import type { InferenceSession } from "onnxruntime-web";
import * as ort from "onnxruntime-web/webgpu";

const shader = await fetch("/shader.wgsl").then((res) => res.text());
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
 * 16바이트 정렬
 */
function alignTo16Bytes(size: number): number {
	return Math.ceil(size / 16) * 16;
}

interface BufferSet {
	frameTexture: GPUTexture;
	inputBuffer: GPUBuffer;
	bindGroup: GPUBindGroup;
	inputTensor: ort.Tensor;
	output0Buffer: GPUBuffer;
	output0Tensor: ort.Tensor;
	output1Buffer: GPUBuffer;
	output1Tensor: ort.Tensor;
}

/**
 * 이미지 프로세싱을 담당할 클래스
 * 더블 버퍼링으로 전처리와 추론을 파이프라이닝
 */
class Cuebit {
	private width: number;
	private height: number;
	private shaderModule: GPUShaderModule;
	private pipeline: GPUComputePipeline;
	private buffers: [BufferSet, BufferSet];
	private current: 0 | 1 = 0;
	private pendingInference: Promise<InferenceSession.OnnxValueMapType> | null =
		null;

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.shaderModule = device.createShaderModule({
			code: shader,
		});
		const bindGroupLayout = device.createBindGroupLayout({
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
		this.pipeline = device.createComputePipeline({
			layout: device.createPipelineLayout({
				bindGroupLayouts: [bindGroupLayout],
			}),
			compute: {
				module: this.shaderModule,
				entryPoint: "main",
			},
		});

		this.buffers = [
			this.createBufferSet(width, height, bindGroupLayout),
			this.createBufferSet(width, height, bindGroupLayout),
		];
	}

	private createBufferSet(
		width: number,
		height: number,
		bindGroupLayout: GPUBindGroupLayout,
	): BufferSet {
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
			size: alignTo16Bytes(4 * 3 * width * height),
		});
		const bindGroup = device.createBindGroup({
			layout: bindGroupLayout,
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
			size: alignTo16Bytes(4 * 300 * 38),
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
			size: alignTo16Bytes(4 * 32 * 160 * 160),
		});
		const output1Tensor = ort.Tensor.fromGpuBuffer(output1Buffer, {
			dataType: "float32",
			dims: [1, 32, 160, 160],
		});

		return {
			frameTexture,
			inputBuffer,
			bindGroup,
			inputTensor,
			output0Buffer,
			output0Tensor,
			output1Buffer,
			output1Tensor,
		};
	}

	/**
	 * 전처리: 프레임을 텍스처에 복사하고 컴퓨트 셰이더로 CHW 변환
	 * GPU 큐에 제출만 하고 대기하지 않음 (non-blocking)
	 */
	public preprocess(frame: VideoFrame): void {
		const set = this.buffers[this.current];

		device.queue.copyExternalImageToTexture(
			{ source: frame },
			{ texture: set.frameTexture },
			[this.width, this.height],
		);
		const commandEncoder = device.createCommandEncoder();
		const pass = commandEncoder.beginComputePass();
		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, set.bindGroup);
		pass.dispatchWorkgroups(
			Math.ceil(this.width / 16),
			Math.ceil(this.height / 16),
		);
		pass.end();
		device.queue.submit([commandEncoder.finish()]);
	}

	/**
	 * 현재 버퍼에 대해 추론을 시작하고, 이전 추론 결과를 반환
	 * 첫 호출 시에는 null 반환
	 */
	public async process(
		frame: VideoFrame,
	): Promise<InferenceSession.OnnxValueMapType | null> {
		// 현재 버퍼에 전처리 제출 (non-blocking)
		this.preprocess(frame);

		// 이전 프레임의 추론 결과 대기
		const previousResult = this.pendingInference
			? await this.pendingInference
			: null;

		// 현재 버퍼에 대해 추론 시작 (대기하지 않음)
		const set = this.buffers[this.current];
		this.pendingInference = session.run(
			{ [session.inputNames[0]]: set.inputTensor },
			{
				[session.outputNames[0]]: set.output0Tensor,
				[session.outputNames[1]]: set.output1Tensor,
			},
		);

		// 버퍼 교대
		this.current = this.current === 0 ? 1 : 0;

		return previousResult;
	}

	/**
	 * 마지막 프레임의 추론 결과를 대기하여 반환
	 */
	public async flush(): Promise<InferenceSession.OnnxValueMapType | null> {
		if (!this.pendingInference) return null;
		const result = await this.pendingInference;
		this.pendingInference = null;
		return result;
	}
}

export default Cuebit;
