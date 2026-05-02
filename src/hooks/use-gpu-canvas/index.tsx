import { useCallback, useState } from "react";
import { todo } from "@/common";

type CanvasSpec = {
	width: number;
	height: number;
	ref: (canvas: HTMLCanvasElement) => void;
};

type Pass = (device: GPUDevice, handler: CanvasHandle<"webgpu">) => void;

export type GPUCanvasHandle = {
	draw: (pass: Pass) => void;
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
		): Promise<GPUCanvasHandle> => {
			return new Promise((resolve) => {
				setSpec({
					width,
					height,
					ref: (canvas) => {
						const context =
							canvas.getContext("webgpu") ??
							todo("webgpu context를 얻을 수 없음");

						context.configure({
							device,
							format: "rgba8unorm",
							usage:
								GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
						});

						const handle = {
							canvas,
							context,
						};

						resolve({
							draw: (pass: Pass) => {
								pass(device, handle);
							},
						});
					},
				});
			});
		},
		[setSpec],
	);

	const element = useCallback(
		(
			style: React.DetailedHTMLProps<
				React.StyleHTMLAttributes<HTMLStyleElement>,
				HTMLStyleElement
			>,
		) => {
			if (!spec) {
				return <></>;
			}

			return (
				<canvas
					ref={(element) => {
                        if (element) {
                            spec.ref(element);
                        }
                    }}
					width={spec.width}
					height={spec.height}
					style={style}
				/>
			);
		},
		[spec],
	);

	return { createCanvas, element };
}

export default useGPUCanvas;
