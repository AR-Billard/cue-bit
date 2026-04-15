import { todo } from "@/common";

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
		usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
	});

	return {
		draw: (frameTexture: GPUTexture) => {
			const commandEncoder = device.createCommandEncoder();
			commandEncoder.copyTextureToTexture(
				{
					texture: frameTexture,
				},
				{
					texture: context.getCurrentTexture(),
				},
				[width, height],
			);
			device.queue.submit([commandEncoder.finish()]);
		},
	};
}

export default createVisualizer;
