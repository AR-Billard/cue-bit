export function drawTexture(
	canvasHandle: CanvasHandle<"webgpu">,
	texture: GPUTexture,
) {
	canvasHandle.draw((device, context, _width, _height) => {
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
	});
}

export * from "./trajectory";
export * from "./transform";
