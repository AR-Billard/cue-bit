import { useCallback, useState } from "react";
import { todo } from "@/common";

type CanvasSpec = {
	width: number;
	height: number;
	onMount: (canvas: HTMLCanvasElement) => void;
};

export function drawTexture(
	device: GPUDevice,
	context: GPUCanvasContext,
	texture: GPUTexture,
) {
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
}

function useGPUCanvas() {
	const [spec, setSpec] = useState<CanvasSpec | null>(null);

	const createCanvas = useCallback(
		(
			device: GPUDevice,
			width: number,
			height: number,
		): Promise<CanvasHandle<"webgpu">> => {
			return new Promise((resolve) => {
				setSpec({
					width,
					height,
					onMount: (canvas) => {
						const context =
							canvas.getContext("webgpu") ??
							todo("webgpu context를 얻을 수 없음");

						context.configure({
							device,
							format: "rgba8unorm",
							usage:
								GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
						});

						resolve({
							canvas,
							draw: (pass) => pass(device, context, width, height),
						});
					},
				});
			});
		},
		[setSpec],
	);

	return [createCanvas, spec] as const;
}

export default useGPUCanvas;
