import type { Point } from "@techstark/opencv-js";
import type { InferenceSession } from "onnxruntime-web";
import * as ort from "onnxruntime-web/webgpu";
import { measure, measureAsync } from "@/common";
import { getOpenCv } from "@/lib/opencv";
import maskShader from "@/shaders/mask.wgsl?raw";
import preprocessShader from "@/shaders/preprocess.wgsl?raw";

/**
 * 버퍼 인덱스
 */
type BufferIndex = 0 | 1;

const { cv } = await getOpenCv();
const session = await ort.InferenceSession.create("/best16.onnx", {
	executionProviders: ["webgpu"],
	// logSeverityLevel: 0,
});
const device = await ort.env.webgpu.device;

const adapter = await navigator.gpu.requestAdapter();
console.log(adapter?.info);

console.log("session created", session);

export interface Prediction {
	dummy: string;
}

/**
 * 16배수 정렬
 */
function alignTo16(size: number): number {
	return Math.ceil(size / 16) * 16;
}

/**
 * 한 프레임 추론에 필요한 버퍼 세트
 */
interface BufferSet {
	preprocessPipeline: GPUComputePipeline;
	/**
	 * 프레임을 복사할 텍스처
	 */
	frameTexture: GPUTexture;
	/**
	 * 셰이더에서 프레임 데이터를 읽어올 때 사용하는 바인드 그룹
	 */
	preprocessBindGroup: GPUBindGroup;
	/**
	 * 셰이더에서 프레임 데이터를 읽어올 버퍼
	 */
	inputBuffer: GPUBuffer;
	/**
	 * ONNX Runtime에서 GPU 버퍼를 텐서로 사용할 때 필요한 래퍼 객체
	 */
	inputTensor: ort.Tensor;
	/**
	 * 모델의 첫 번째 출력 버퍼
	 */
	output0Buffer: GPUBuffer;
	/**
	 * 모델의 첫 번째 출력 텐서
	 */
	output0Tensor: ort.Tensor;
	/**
	 * 모델의 두 번째 출력 버퍼
	 */
	output1Buffer: GPUBuffer;
	/**
	 * 모델의 두 번째 출력 텐서
	 */
	output1Tensor: ort.Tensor;
	/**
	 * output0를 CPU에 전달하기 위한 staging 버퍼
	 */
	output0ReadBuffer: GPUBuffer;
	/**
	 * 현재 버퍼에 대해 진행 중인 추론 결과를 나타내는 Promise
	 */
	pendingInference: Promise<InferenceSession.OnnxValueMapType> | null;

	maskPipeline: GPUComputePipeline;
	/**
	 * 마스크 생성 셰이더에서 사용할 바인드 그룹
	 */
	maskBindGroup: GPUBindGroup;
	/**
	 * 마스크 이미지를 생성할 detection 인덱스 배열 버퍼
	 */
	candidateRowBuffer: GPUBuffer;
	/**
	 * 마스크 생성 셰이더에서 사용할 Params 버퍼
	 */
	paramsBuffer: GPUBuffer;
	/**
	 * 마스크 이미지를 저장하는 버퍼
	 */
	maskBuffer: GPUBuffer;
	/**
	 * 마스크 이미지를 CPU에 전달하기 위한 staging 버퍼:
	 */
	maskReadBuffer: GPUBuffer;
}

function findLargestQuad(mask: Float32Array): Point[] | null {
	// 첫 detection의 160*160만 사용
	const W = 160,
		H = 160;
	const first = mask.subarray(0, W * H);

	// Float32 → 0/255 binary Mat
	const src = new cv.Mat(H, W, cv.CV_8UC1);
	for (let i = 0; i < W * H; i++) {
		src.data[i] = first[i] > 0.5 ? 255 : 0;
	}

	const contours = new cv.MatVector();
	const hierarchy = new cv.Mat();
	cv.findContours(
		src,
		contours,
		hierarchy,
		cv.RETR_EXTERNAL,
		cv.CHAIN_APPROX_SIMPLE,
	);

	// 면적 가장 큰 컨투어
	let maxArea = 0;
	let maxIdx = -1;
	for (let i = 0; i < contours.size(); i++) {
		const area = cv.contourArea(contours.get(i));
		if (area > maxArea) {
			maxArea = area;
			maxIdx = i;
		}
	}

	let result: { x: number; y: number }[] | null = null;
	if (maxIdx >= 0) {
		const cnt = contours.get(maxIdx);
		const approx = new cv.Mat();
		const peri = cv.arcLength(cnt, true);
		cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

		// 꼭짓점 4개일 때만 사각형으로 인정
		if (approx.rows === 4) {
			result = [];
			for (let i = 0; i < 4; i++) {
				result.push({
					x: approx.data32S[i * 2],
					y: approx.data32S[i * 2 + 1],
				});
			}
		}
		approx.delete();
	}

	src.delete();
	contours.delete();
	hierarchy.delete();
	return result;
}

/**
 * 전체 파이프라인 실행 클래스
 */
class Cuebit {
	private width: number;
	private height: number;
	private preprocessShaderModule: GPUShaderModule;
	private maskShaderModule: GPUShaderModule;
	private buffers: [BufferSet, BufferSet];
	private currentBufferIndex: BufferIndex = 0;

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.preprocessShaderModule = device.createShaderModule({
			code: preprocessShader,
		});
		this.maskShaderModule = device.createShaderModule({
			code: maskShader,
		});
		const preprocessBindGroupLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					texture: {
						sampleType: "float",
					},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {
						type: "storage",
					},
				},
			],
		});

		const maskBindGroupLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {
						type: "read-only-storage",
					},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {
						type: "read-only-storage",
					},
				},
				{
					binding: 2,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {
						type: "read-only-storage",
					},
				},
				{
					binding: 3,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {
						type: "uniform",
					},
				},
				{
					binding: 4,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {
						type: "storage",
					},
				},
			],
		});

		this.buffers = [
			this.createBufferSet(
				width,
				height,
				preprocessBindGroupLayout,
				maskBindGroupLayout,
			),
			this.createBufferSet(
				width,
				height,
				preprocessBindGroupLayout,
				maskBindGroupLayout,
			),
		];
	}

	private createBufferSet(
		width: number,
		height: number,
		preprocessBindGroupLayout: GPUBindGroupLayout,
		maskBindGroupLayout: GPUBindGroupLayout,
	): BufferSet {
		const preprocessPipeline = device.createComputePipeline({
			layout: device.createPipelineLayout({
				bindGroupLayouts: [preprocessBindGroupLayout],
			}),
			compute: {
				module: this.preprocessShaderModule,
				entryPoint: "hwc2chw",
			},
		});
		const frameTexture = device.createTexture({
			size: [width, height],
			format: "rgba8unorm",
			usage:
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const inputBuffer = device.createBuffer({
			usage:
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.STORAGE,
			size: alignTo16(4 * 3 * width * height),
		});
		const bindGroup = device.createBindGroup({
			layout: preprocessBindGroupLayout,
			entries: [
				{
					binding: 0,
					resource: frameTexture.createView(),
				},
				{
					binding: 1,
					resource: {
						buffer: inputBuffer,
					},
				},
			],
		});
		const inputTensor = ort.Tensor.fromGpuBuffer(inputBuffer, {
			dataType: "float32",
			dims: [1, 3, height, width],
		});

		const output0Buffer = device.createBuffer({
			usage:
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.STORAGE,
			size: alignTo16(4 * 300 * 38),
		});
		const output0Tensor = ort.Tensor.fromGpuBuffer(output0Buffer, {
			dataType: "float32",
			dims: [1, 300, 38],
		});
		const output1Buffer = device.createBuffer({
			usage:
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.STORAGE,
			size: alignTo16(4 * 32 * 160 * 160),
		});
		const output1Tensor = ort.Tensor.fromGpuBuffer(output1Buffer, {
			dataType: "float32",
			dims: [1, 32, 160, 160],
		});
		const output0ReadBuffer = device.createBuffer({
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
			size: alignTo16(4 * 300 * 38),
		});

		// mask
		const maskPipeline = device.createComputePipeline({
			layout: device.createPipelineLayout({
				bindGroupLayouts: [maskBindGroupLayout],
			}),
			compute: {
				module: this.maskShaderModule,
				entryPoint: "createMask",
			},
		});
		const candidateRowBuffer = device.createBuffer({
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			size: alignTo16(4 * 10),
		});
		const paramsBuffer = device.createBuffer({
			size: 16, // u32 1개지만 16바이트 정렬
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		const maskBuffer = device.createBuffer({
			usage:
				GPUBufferUsage.STORAGE |
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST,
			size: alignTo16(4 * 10 * 160 * 160),
		});
		const maskReadBuffer = device.createBuffer({
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
			size: alignTo16(4 * 10 * 160 * 160),
		});
		const maskBindGroup = device.createBindGroup({
			layout: maskBindGroupLayout,
			entries: [
				{
					binding: 0,
					resource: {
						buffer: output0Buffer,
					},
				},
				{
					binding: 1,
					resource: {
						buffer: output1Buffer,
					},
				},
				{
					binding: 2,
					resource: {
						buffer: candidateRowBuffer,
					},
				},
				{
					binding: 3,
					resource: {
						buffer: paramsBuffer,
					},
				},
				{
					binding: 4,
					resource: {
						buffer: maskBuffer,
					},
				},
			],
		});

		return {
			preprocessPipeline: preprocessPipeline,
			frameTexture,
			preprocessBindGroup: bindGroup,
			inputBuffer,
			inputTensor,
			output0Buffer,
			output0Tensor,
			output1Buffer,
			output1Tensor,
			output0ReadBuffer,
			pendingInference: null,
			maskPipeline,
			maskBindGroup,
			candidateRowBuffer: candidateRowBuffer,
			paramsBuffer,
			maskBuffer,
			maskReadBuffer,
		};
	}

	/**
	 * 프레임 전처리
	 */
	private preprocessFrame(frame: VideoFrame, buffer: BufferSet): void {
		// 프레임을 텍스처로 복사
		this.copyFrameToTexture(frame, buffer);

		// 프레임 전처리
		const commandEncoder = device.createCommandEncoder();
		this.hwc2chw(commandEncoder, buffer);
		device.queue.submit([commandEncoder.finish()]);
	}

	private copyFrameToTexture(frame: VideoFrame, buffer: BufferSet): void {
		device.queue.copyExternalImageToTexture(
			{
				source: frame,
			},
			{
				texture: buffer.frameTexture,
			},
			[this.width, this.height],
		);
	}

	private hwc2chw(encoder: GPUCommandEncoder, buffer: BufferSet): void {
		const pass = encoder.beginComputePass();
		pass.setPipeline(buffer.preprocessPipeline);
		pass.setBindGroup(0, buffer.preprocessBindGroup);
		pass.dispatchWorkgroups(
			Math.ceil(this.width / 16),
			Math.ceil(this.height / 16),
		);
		pass.end();
	}

	private async getMask(buffer: BufferSet): Promise<Float32Array | null> {
		// 프레임 추론 결과 대기
		if (buffer.pendingInference == null) {
			return null;
		}

		await buffer.pendingInference;

		// 이젠 프레임 추론 결과를 staging 버퍼로 복사
		const stagingCommandEncoder = device.createCommandEncoder();
		stagingCommandEncoder.copyBufferToBuffer(
			buffer.output0Buffer,
			0,
			buffer.output0ReadBuffer,
			0,
			4 * 300 * 38,
		);
		device.queue.submit([stagingCommandEncoder.finish()]);

		device.queue.writeBuffer(
			buffer.candidateRowBuffer,
			0,
			new Uint32Array([0, -1, -1, -1, -1, -1, -1, -1, -1, -1]),
		);
		device.queue.writeBuffer(buffer.paramsBuffer, 0, new Uint32Array([10]));

		const commandEncoder = device.createCommandEncoder();
		const pass = commandEncoder.beginComputePass();
		pass.setPipeline(buffer.maskPipeline);
		pass.setBindGroup(0, buffer.maskBindGroup);
		pass.dispatchWorkgroups(Math.ceil(160 / 16), Math.ceil(160 / 16));
		pass.end();
		device.queue.submit([commandEncoder.finish()]);

		const maskStagingCommandEncoder = device.createCommandEncoder();
		maskStagingCommandEncoder.copyBufferToBuffer(
			buffer.maskBuffer,
			0,
			buffer.maskReadBuffer,
			0,
			// 4 byte * 10개 detection * 160 * 160
			4 * 10 * 160 * 160,
		);
		device.queue.submit([maskStagingCommandEncoder.finish()]);

		await buffer.maskReadBuffer.mapAsync(GPUMapMode.READ);

		const maskImage = new Float32Array(
			buffer.maskReadBuffer.getMappedRange().slice(0),
		);
		buffer.maskReadBuffer.unmap();

		return maskImage;
	}

	/**
	 *
	 */
	public async process(frame: VideoFrame): Promise<Float32Array | null> {
		// 이전 버퍼 인덱스 계산
		const previousBufferIndex = 1 - this.currentBufferIndex;

		// 현재 버퍼와 이전 버퍼 참조
		const [currentBuffer, previousBuffer] = [
			this.buffers[this.currentBufferIndex],
			this.buffers[previousBufferIndex],
		];

		this.preprocessFrame(frame, currentBuffer);

		const mask = await measureAsync(
			() => this.getMask(previousBuffer),
			"Get Mask",
		);

		// 이전 추론이 완료된 후 현재 버퍼에 대해 추론 시작
		currentBuffer.pendingInference = session.run(
			{
				[session.inputNames[0]]: currentBuffer.inputTensor,
			},
			{
				[session.outputNames[0]]: currentBuffer.output0Tensor,
				[session.outputNames[1]]: currentBuffer.output1Tensor,
			},
		);

		if (mask) {
			const quad = measure(() => findLargestQuad(mask), "approx quad");
			console.log("Largest quad:", quad);
		}

		// 버퍼 인덱스 업데이트
		this.currentBufferIndex = (1 - this.currentBufferIndex) as BufferIndex;

		return mask;
	}
}

export default Cuebit;
