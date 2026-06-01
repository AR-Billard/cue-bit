import { alignTo16 } from "@/common";
import transformShader from "./shaders/transform.wgsl";

export class TextureTransformer implements Disposable {
	private sourceTexture: GPUTexture;
	private matrixBuffer: GPUBuffer;
	private pipeline: GPURenderPipeline;
	private bindGroup: GPUBindGroup;

	public constructor(
		device: GPUDevice,
		sourceWidth: number,
		sourceHeight: number,
	) {
		const { sourceTexture, matrixBuffer, pipeline, bindGroup } =
			this.createResource(device, sourceWidth, sourceHeight);

		this.sourceTexture = sourceTexture;
		this.matrixBuffer = matrixBuffer;
		this.pipeline = pipeline;
		this.bindGroup = bindGroup;
	}

	private createResource(
		device: GPUDevice,
		sourceWidth: number,
		sourceHeight: number,
	) {
		const shaderModule = device.createShaderModule({
			code: transformShader,
		});

		const sourceTexture = device.createTexture({
			size: [sourceWidth, sourceHeight],
			format: "rgba8unorm",
			usage:
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.RENDER_ATTACHMENT,
		});

		const matrixBuffer = device.createBuffer({
			// 4(float) * 4(3(column) + 1(padding)) * 3(row)
			size: alignTo16(4 * 4 * 3),
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		const sampler = device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
		});

		const pipeline = device.createRenderPipeline({
			layout: "auto",
			vertex: {
				module: shaderModule,
				entryPoint: "vs_main",
			},
			fragment: {
				module: shaderModule,
				entryPoint: "fs_main",
				targets: [
					{
						format: "rgba8unorm",
					},
				],
			},
			primitive: {
				topology: "triangle-strip",
			},
		});

		const bindGroup = device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: { buffer: matrixBuffer },
				},
				{
					binding: 1,
					resource: sourceTexture.createView(),
				},
				{
					binding: 2,
					resource: sampler,
				},
			],
		});

		return {
			sourceTexture,
			matrixBuffer,
			pipeline,
			bindGroup,
		};
	}

	public drawTransformed(
		source: CanvasHandle<"2d">,
		destination: CanvasHandle<"webgpu">,
		matrix: MatSnapshot,
	) {
		destination.draw((device, context, _width, _height) => {
			device.queue.copyExternalImageToTexture(
				{
					source: source.canvas,
					flipY: false,
				},
				{
					texture: this.sourceTexture,
				},
				[source.canvas.width, source.canvas.height],
			);

			const m = new Float64Array(matrix.data); // 9개 (row-major)
			const packed = new Float32Array(
				// biome-ignore format: 행렬 표현
				[
                    m[0], m[3], m[6], 0, // column 0
                    m[1], m[4], m[7], 0, // column 1
                    m[2], m[5], m[8], 0, // column 2
                ],
			);

			device.queue.writeBuffer(this.matrixBuffer, 0, packed);

			const commandEncoder = device.createCommandEncoder();

			const renderPassEncoder = commandEncoder.beginRenderPass({
				colorAttachments: [
					{
						view: context.getCurrentTexture().createView(),
						clearValue: { r: 0, g: 0, b: 0, a: 1.0 },
						loadOp: "clear",
						storeOp: "store",
					},
				],
			});

			renderPassEncoder.setPipeline(this.pipeline);
			renderPassEncoder.setBindGroup(0, this.bindGroup);
			renderPassEncoder.draw(4);
			renderPassEncoder.end();

			device.queue.submit([commandEncoder.finish()]);
		});
	}

	[Symbol.dispose]() {
		this.sourceTexture.destroy();
		this.matrixBuffer.destroy();
	}
}
