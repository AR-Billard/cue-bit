import { useCallback, useMemo, useRef, useState } from "react";
import { todo } from "@/common";

type CanvasSpec = {
	id: number;
	width: number;
	height: number;
	contextId: keyof ContextMap;
	ref: (canvas: HTMLCanvasElement) => void;
};

function useDebugCanvas() {
	const id = useRef(0);
	const [specs, setSpecs] = useState<CanvasSpec[]>([]);

	const createCanvas = useCallback(
		<T extends keyof ContextMap>(
			width: number,
			height: number,
			contextId: T,
		): Promise<CanvasHandle<T>> => {
			return new Promise((resolve) => {
				setSpecs((prev) => [
					...prev,
					{
						id: id.current++,
						width,
						height,
						contextId: contextId,
						ref: (canvas) => {
							const context =
								canvas.getContext(contextId) ??
								todo(`getContext(${contextId}) failed`);

							resolve({
								canvas,
								context: context as ContextMap[T],
							});
						},
					},
				]);
			});
		},
		[setSpecs],
	);

	return { createCanvas, specs };
}
export default useDebugCanvas;
