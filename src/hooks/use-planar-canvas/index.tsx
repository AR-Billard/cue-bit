import { useCallback, useState } from "react";
import { todo } from "@/common";

function usePlanarCanvas() {
	const [spec, setSpec] = useState<CanvasSpec | null>(null);

	const createCanvas = useCallback(
		(width: number, height: number): Promise<CanvasHandle<"2d">> => {
			return new Promise((resolve) => {
				setSpec({
					width,
					height,
					onMount: (canvas) => {
						const context =
							canvas.getContext("2d") ?? todo("2d context를 얻을 수 없음");

						resolve({
							canvas,
							draw: (pass) => pass(context, width, height),
						});
					},
				});
			});
		},
		[],
	);

	return [createCanvas, spec] as const;
}

export default usePlanarCanvas;
