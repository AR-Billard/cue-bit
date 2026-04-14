import cv from "@techstark/opencv-js";
import type { InferenceSession } from "onnxruntime-web";
import * as ort from "onnxruntime-web/webgpu";
import { alignTo16, measure } from "@/common";
import maskShader from "./shaders/mask.wgsl";
import preprocessShader from "./shaders/preprocess.wgsl";

/**
 * 버퍼 인덱스
 */
export type BufferIndex = 0 | 1;

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
	maskBindgroup: GPUBindGroup;
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

interface DetectionMaskIndex {
	readonly detection: Detection;
	readonly index: number;
}

class MaskParams {
	public readonly table: DetectionMaskIndex | null;

	constructor(table: Detection | null) {
		const maskIndices: Detection[] = [];

		this.table = table
			? {
					detection: table,
					index: maskIndices.length,
				}
			: null;
	}

	public toByteLayout(): Uint32Array {
		const indices: number[] = [];

		if (this.table) {
			indices.push(this.table.detection.index);
		}

		return new Uint32Array([indices.length, ...indices]);
	}
}

interface MaskResult {
	masks: Float32Array[];
	params: MaskParams;
}

/**
 *
 */
function splitFloat32Array(
	array: Float32Array,
	chunkSize: number,
): Float32Array[] {
	const chunks: Float32Array[] = [];

	for (let i = 0; i < array.length; i += chunkSize) {
		chunks.push(array.subarray(i, i + chunkSize));
	}

	return chunks;
}

function findLargestQuad(
	mask: Float32Array,
	width: number,
	height: number,
): cv.Point[] | null {
	// Float32 → 0/255 binary Mat
	const src = new cv.Mat(height, width, cv.CV_8UC1);
	for (let i = 0; i < width * height; i++) {
		src.data[i] = mask[i] > 0.5 ? 255 : 0;
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

class Detection {
	public readonly index: number;
	public readonly confidence: number;
	public readonly classId: number;
	public readonly coefficients: Float32Array;

	constructor(index: number, chunk: Float32Array) {
		this.index = index;
		this.confidence = chunk[4];
		this.classId = chunk[5];
		this.coefficients = chunk.subarray(6);
	}
}

function toDetections(detection: Float32Array, chunkSize: number): Detection[] {
	const detections: Detection[] = [];

	for (let i = 0; i < detection.length; i += chunkSize) {
		detections.push(new Detection(i, detection.subarray(i, i + chunkSize)));
	}

	return detections;
}

/**
 * 전체 파이프라인 실행 클래스
 */
class Cuebit {
	private device: GPUDevice;
	private session: InferenceSession;
	private width: number;
	private height: number;
	private preprocessShaderModule: GPUShaderModule;
	private maskShaderModule: GPUShaderModule;
	private buffers: [BufferSet, BufferSet];
	private currentBufferIndex: BufferIndex = 0;

	constructor(
		device: GPUDevice,
		session: InferenceSession,
		width: number,
		height: number,
	) {
		this.device = device;
		this.session = session;
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
		const preprocessPipeline = this.device.createComputePipeline({
			layout: this.device.createPipelineLayout({
				bindGroupLayouts: [preprocessBindGroupLayout],
			}),
			compute: {
				module: this.preprocessShaderModule,
				entryPoint: "hwc2chw",
			},
		});
		const frameTexture = this.device.createTexture({
			size: [width, height],
			format: "rgba8unorm",
			usage:
				GPUTextureUsage.COPY_SRC |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const inputBuffer = this.device.createBuffer({
			usage:
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.STORAGE,
			size: alignTo16(4 * 3 * width * height),
		});
		const preprocessBindGroup = this.device.createBindGroup({
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

		const output0Buffer = this.device.createBuffer({
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
		const output1Buffer = this.device.createBuffer({
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
		const output0ReadBuffer = this.device.createBuffer({
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
			size: alignTo16(4 * 300 * 38),
		});

		// mask
		const maskPipeline = this.device.createComputePipeline({
			layout: this.device.createPipelineLayout({
				bindGroupLayouts: [maskBindGroupLayout],
			}),
			compute: {
				module: this.maskShaderModule,
				entryPoint: "createMask",
			},
		});
		const paramsBuffer = this.device.createBuffer({
			// candidateCount(1) + candidates(31)
			size: alignTo16(4 * 32),
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		const maskBuffer = this.device.createBuffer({
			usage:
				GPUBufferUsage.STORAGE |
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST,
			size: alignTo16(4 * 10 * 160 * 160),
		});
		const maskBindgroup = this.device.createBindGroup({
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
						buffer: paramsBuffer,
					},
				},
				{
					binding: 3,
					resource: {
						buffer: maskBuffer,
					},
				},
			],
		});
		const maskReadBuffer = this.device.createBuffer({
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
			size: alignTo16(4 * 10 * 160 * 160),
		});

		return {
			preprocessPipeline,
			frameTexture,
			preprocessBindGroup,
			inputBuffer,
			inputTensor,
			output0Buffer,
			output0Tensor,
			output1Buffer,
			output1Tensor,
			output0ReadBuffer,
			pendingInference: null,
			maskPipeline,
			maskBindgroup,
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
		const commandEncoder = this.device.createCommandEncoder();
		this.hwc2chw(commandEncoder, buffer);
		this.device.queue.submit([commandEncoder.finish()]);
	}

	private copyFrameToTexture(frame: VideoFrame, buffer: BufferSet): void {
		// NOTE: importExternalTexture 고려
		this.device.queue.copyExternalImageToTexture(
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

	private getMaskParams(detections: Detection[]): MaskParams {
		let table: Detection | null = null;

		for (const detection of detections) {
			// NOTE: 현재 모델은 2가 table임
			if (detection.classId === 2) {
				if (table === null || detection.confidence > table.confidence) {
					table = detection;
				}
			}
		}

		return new MaskParams(table);
	}

	private async getMask(buffer: BufferSet): Promise<MaskResult | null> {
		// buffer의 프레임 추론 결과 대기
		if (buffer.pendingInference == null) {
			return null;
		}
		await measure(() => buffer.pendingInference, "Pending Inference"); 

		// buffer의 추론 결과를 staging 버퍼로 복사
		const stagingCommandEncoder = this.device.createCommandEncoder();
		stagingCommandEncoder.copyBufferToBuffer(
			buffer.output0Buffer,
			0,
			buffer.output0ReadBuffer,
			0,
			4 * 300 * 38,
		);
		this.device.queue.submit([stagingCommandEncoder.finish()]);

		await buffer.output0ReadBuffer.mapAsync(GPUMapMode.READ);
		const detections = toDetections(
			new Float32Array(buffer.output0ReadBuffer.getMappedRange().slice(0)),
			38,
		);
		buffer.output0ReadBuffer.unmap();

		// 마스크 이미지를 만들 detections 인덱스 선택
		const params = this.getMaskParams(detections);

		//
		this.device.queue.writeBuffer(
			buffer.paramsBuffer,
			0,
			params.toByteLayout(),
		);

		const commandEncoder = this.device.createCommandEncoder();
		const maskPass = commandEncoder.beginComputePass();
		maskPass.setPipeline(buffer.maskPipeline);
		maskPass.setBindGroup(0, buffer.maskBindgroup);
		maskPass.dispatchWorkgroups(Math.ceil(160 / 16), Math.ceil(160 / 16));
		maskPass.end();
		this.device.queue.submit([commandEncoder.finish()]);

		// TODO: maskCommandEncoder와 stagingCommandEncoder를 하나의 커맨드 인코더로 합쳐서 해도 될듯
		const maskStagingCommandEncoder = this.device.createCommandEncoder();
		maskStagingCommandEncoder.copyBufferToBuffer(
			buffer.maskBuffer,
			0,
			buffer.maskReadBuffer,
			0,
			// 4 byte * 10개 detection * 160 * 160
			4 * 10 * 160 * 160,
		);
		this.device.queue.submit([maskStagingCommandEncoder.finish()]);

		await buffer.maskReadBuffer.mapAsync(GPUMapMode.READ);

		const masks = splitFloat32Array(
			new Float32Array(buffer.maskReadBuffer.getMappedRange().slice(0)),
			160 * 160,
		);
		buffer.maskReadBuffer.unmap();

		return {
			masks,
			params,
		};
	}

	/**
	 *
	 */
	public async process(frame: VideoFrame) {
		// 이전 버퍼 인덱스 계산
		const previousBufferIndex = 1 - this.currentBufferIndex;

		// 현재 버퍼와 이전 버퍼 참조
		const [currentBuffer, previousBuffer] = [
			this.buffers[this.currentBufferIndex],
			this.buffers[previousBufferIndex],
		];

		this.preprocessFrame(frame, currentBuffer);

		const maskResult = await measure(
			() => this.getMask(previousBuffer),
			"Get Mask",
		);

		// 이전 추론이 완료된 후 현재 버퍼에 대해 추론 시작
		currentBuffer.pendingInference = this.session.run(
			{
				[this.session.inputNames[0]]: currentBuffer.inputTensor,
			},
			{
				[this.session.outputNames[0]]: currentBuffer.output0Tensor,
				[this.session.outputNames[1]]: currentBuffer.output1Tensor,
			},
		);

		const getTablePoints = () => {
			const table = maskResult?.params?.table;

			if (!table) {
				return null;
			}

			const mask = maskResult.masks[table.index];

			return findLargestQuad(mask, 160, 160);
		};

		const table = measure(() => getTablePoints(), "Find Largest Quad");

		const result =
			maskResult === null
				? null
				: {
						frameTexture: previousBuffer.frameTexture,
						table,
					};

		// 버퍼 인덱스 업데이트
		this.currentBufferIndex = (1 - this.currentBufferIndex) as BufferIndex;

		return result;
	}

	public getCurrentBufferIndex(): BufferIndex {
		return this.currentBufferIndex;
	}

	public getBuffer(bufferIndex: BufferIndex): BufferSet {
		return this.buffers[bufferIndex];
	}
}

export default Cuebit;
