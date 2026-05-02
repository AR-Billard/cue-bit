import { useCallback, useRef, useState } from "react";
import { todo } from "@/common";

export type DebugCanvasSpec = {
	id: number;
	width: number;
	height: number;
	onMount: (canvas: HTMLCanvasElement) => void;
};

function useDebugCanvas() {
	const id = useRef(0);
	const [specs, setSpecs] = useState<DebugCanvasSpec[]>([]);

	const create2DCanvas = useCallback(
		(width: number, height: number): Promise<CanvasHandle<"2d">> => {
			return new Promise((resolve) => {
				setSpecs((prev) => [
					...prev,
					{
						id: id.current++,
						width,
						height,
						onMount: (canvas) => {
							const context =
								canvas.getContext("2d") ?? todo(`context를 얻을 수 없음`);

							resolve({
								canvas,
								context,
							});
						},
					},
				]);
			});
		},
		[setSpecs],
	);

	const createGPUCanvas = useCallback(
		(
			device: GPUDevice,
			width: number,
			height: number,
		): Promise<CanvasHandle<"webgpu">> => {
			return new Promise((resolve) => {
				setSpecs((prev) => [
					...prev,
					{
						id: id.current++,
						width,
						height,
						onMount: (canvas) => {
							const context =
								canvas.getContext("webgpu") ?? todo(`context를 얻을 수 없음`);

							context.configure({
								device,
								format: "rgba8unorm",
								usage:
									GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
							});

							resolve({
								canvas,
								context,
							});
						},
					},
				]);
			});
		},
		[setSpecs],
	);

	const clear = useCallback(() => {
		setSpecs([]);
	}, [setSpecs]);

	return [create2DCanvas, createGPUCanvas, specs, clear] as const;
}
export default useDebugCanvas;
