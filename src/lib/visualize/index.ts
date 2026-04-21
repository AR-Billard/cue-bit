import { todo } from "@/common";
import type { FrameInfo } from '../capture';

function createVisualizer(
	canvas: HTMLCanvasElement,
	device: GPUDevice,
    frameInfo: FrameInfo,
) {
	canvas.width = frameInfo.width;
	canvas.height = frameInfo.height;
	const context =
		canvas.getContext("webgpu") ?? todo("Failed to get WebGPU context");
	context.configure({
		device,
		format: "rgba8unorm",
		usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
	});

	return {
		draw: (texture: GPUTexture) => {
			const commandEncoder = device.createCommandEncoder();
			commandEncoder.copyTextureToTexture(
				{
					texture: texture,
				},
				{
					texture: context.getCurrentTexture(),
				},
				[texture.width, texture.height],
			);
			device.queue.submit([commandEncoder.finish()]);
		},
	};
}

export default createVisualizer;
