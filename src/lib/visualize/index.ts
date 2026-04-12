import { alignTo16, todo } from "@/common";
import visuialzeShader from "./shaders/visualize.wgsl";

function createVisualizer(
	canvas: HTMLCanvasElement,
	device: GPUDevice,
	width: number,
	height: number,
) {
	canvas.width = width;
	canvas.height = height;
	const context =
		canvas.getContext("webgpu") ?? todo("Failed to get WebGPU context");
	context.configure({
		device,
		format: "rgba8unorm",
	});

	const uniformBuffer = device.createBuffer({
		size: alignTo16(4 * 3),
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	const bindgroupLayout = device.createBindGroupLayout({
		entries: [
			{
				binding: 0,
				visibility: GPUShaderStage.FRAGMENT,
				buffer: {
					type: "uniform",
				},
			},
		],
	});
	const pipeline = device.createRenderPipeline({
		layout: device.createPipelineLayout({
			bindGroupLayouts: [bindgroupLayout],
		}),
		vertex: {
			module: device.createShaderModule({
				code: visuialzeShader,
			}),
			entryPoint: "vs_main",
		},
		fragment: {
			module: device.createShaderModule({
				code: visuialzeShader,
			}),
			entryPoint: "fs_main",
			targets: [
				{
					format: "rgba8unorm",
				},
			],
		},
		primitive: {
			topology: "triangle-list",
		},
	});
	const bindgroup = device.createBindGroup({
		layout: bindgroupLayout,
		entries: [
			{
				binding: 0,
				resource: {
					buffer: uniformBuffer,
				},
			},
		],
	});

	return {
		draw: (time: number) => {
			const commandEncoder = device.createCommandEncoder();
			const textureView = context.getCurrentTexture().createView();
			const renderPass = commandEncoder.beginRenderPass({
				colorAttachments: [
					{
						view: textureView,
						loadOp: "clear",
						storeOp: "store",
					},
				],
			});
			renderPass.setPipeline(pipeline);
			renderPass.setBindGroup(0, bindgroup);
			renderPass.draw(3, 1, 0, 0);
			renderPass.end();

			device.queue.writeBuffer(
				uniformBuffer,
				0,
				new Float32Array([time, width, height]),
			);

			device.queue.submit([commandEncoder.finish()]);
		},
	};
}

export default createVisualizer;
