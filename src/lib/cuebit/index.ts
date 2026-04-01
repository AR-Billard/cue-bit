import { measure, measureAsync } from "@/common";
import type { InferenceSession } from "onnxruntime-web";
import * as ort from "onnxruntime-web/webgpu";

const shader = await fetch("/shader.wgsl").then((res) => res.text());
const session = await ort.InferenceSession.create("/best.onnx", {
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

/**
 * 이미지 프로세싱을 담당할 클래스
 */
class Cuebit {
    private width: number;
    private height: number;
	private shaderModule: GPUShaderModule;
	private pipeline: GPUComputePipeline;
	private frameTexture: GPUTexture;
	private inputBuffer: GPUBuffer;
	private bindGroup: GPUBindGroup;
	private inputTensor: ort.Tensor;
	private output0Buffer: GPUBuffer;
	private output0Tensor: ort.Tensor;
	private output1Buffer: GPUBuffer;
	private output1Tensor: ort.Tensor;

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

		this.frameTexture = device.createTexture({
			size: [width, height],
			format: "rgba8unorm",
			usage:
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.RENDER_ATTACHMENT,
		});
		this.inputBuffer = device.createBuffer({
			usage:
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.STORAGE,
			// 4 (f32) * 3 (RGB) * width * height
			size: alignTo16Bytes(4 * 3 * width * height),
		});

		this.bindGroup = device.createBindGroup({
			layout: bindGroupLayout,
			entries: [
				{
					binding: 0,
					resource: this.frameTexture.createView(),
				},
				{
					binding: 1,
					resource: {
						buffer: this.inputBuffer,
					},
				},
			],
		});
		this.inputTensor = ort.Tensor.fromGpuBuffer(this.inputBuffer, {
			dataType: "float32",
			dims: [1, 3, height, width],
		});

		this.output0Buffer = device.createBuffer({
			usage:
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.STORAGE,
			size: alignTo16Bytes(4 * 300 * 38),
		});
		this.output0Tensor = ort.Tensor.fromGpuBuffer(this.output0Buffer, {
			dataType: "float32",
			dims: [1, 300, 38],
		});

		this.output1Buffer = device.createBuffer({
			usage:
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.STORAGE,
			size: alignTo16Bytes(4 * 32 * 160 * 160),
		});
		this.output1Tensor = ort.Tensor.fromGpuBuffer(this.output1Buffer, {
			dataType: "float32",
			dims: [1, 32, 160, 160],
		});
	}

	public async process(
		frame: VideoFrame,
	): Promise<InferenceSession.OnnxValueMapType> {
		device.queue.copyExternalImageToTexture(
			{
				source: frame,
			},
			{
				texture: this.frameTexture,
			},
			[this.width, this.height],
		);
		const commandEncoder = device.createCommandEncoder();
		const pass = commandEncoder.beginComputePass();
		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, this.bindGroup);
		pass.dispatchWorkgroups(
			Math.ceil(640 / 16), // 40
			Math.ceil(640 / 16), // 40
		);
		pass.end();
		device.queue.submit([commandEncoder.finish()]);

		const result = await measureAsync(
			() =>
				session.run(
					{
						[session.inputNames[0]]: this.inputTensor,
					},
					{
						[session.outputNames[0]]: this.output0Tensor,
						[session.outputNames[1]]: this.output1Tensor,
					},
				),
			"Run Inference",
		);
		// output shape 확인
		console.log(session.outputNames);
		for (const name of session.outputNames) {
			console.log(name, result[name].dims);
		}

		return result;
	}
}

export default Cuebit;
