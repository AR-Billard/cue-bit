import type { Point } from "@techstark/opencv-js";
import { useCallback, useEffect, useRef } from "react";
import { measure, todo } from "@/common";
import createFrameCapture from "@/lib/capture";
import Cuebit, { type BufferIndex } from "@/lib/cuebit";
import { device, session } from "@/lib/onnx";
import createVisualizer from "@/lib/visualize";

function Main() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

	/**
	 * 캔버스에 RGBA 데이터를 그리는 유틸 생성
	 */
	const createOverlayDrawer = useCallback(
		(
			canvas: HTMLCanvasElement,
			width: number,
			height: number,
			scale: number,
		) => {
			canvas.width = width * scale;
			canvas.height = height * scale;
			const context = canvas.getContext("2d");

			if (!context) {
				throw new Error("Failed to get canvas context");
			}

			return {
				draw: (quad: Point[] | null) => {
					context.clearRect(0, 0, width * scale, height * scale);

					if (quad !== null) {
						context.strokeStyle = "red";
						context.lineWidth = 4;

						context.beginPath();
						for (let i = 0; i < 4; i++) {
							const point = quad[i];
							context.moveTo(point.x * scale, point.y * scale);
							const nextPoint = quad[(i + 1) % 4];
							context.lineTo(nextPoint.x * scale, nextPoint.y * scale);
						}
						context.stroke();
					}
				},
			};
		},
		[],
	);

	useEffect(() => {
		// 비동기 작업을 중단하기 위한 AbortController
		const ac = new AbortController();

		(async () => {
			// 카메라 스트림 가져오기
			const stream = await navigator.mediaDevices.getUserMedia({
				// 오디오 스트림은 사용하지 않음
				audio: false,
				video: {
					width: 1000,
					height: 1000,
					facingMode: {
						// 후면 카메라 사용
						ideal: "environment",
					},
				},
			});
			// 비디오 트랙 가져오기
			const [track] = stream.getVideoTracks();
			// 프레임 캡처 유틸 생성
			const frameCapture = await createFrameCapture(
				// cleanup 시 프레임 캡처 중단을 위해 signal 전달
				ac.signal,
				track,
			);
			console.log("Frame capture created:", frameCapture);

			const frameDrawer = createVisualizer(
				canvasRef.current ?? todo("canvas가 없음"),
				device,
				640,
				640,
			);
			const overlayDrawer = createOverlayDrawer(
				overlayCanvasRef.current ?? todo("overlay canvas가 없음"),
				160,
				160,
				4,
			);

			const draw = () => {
				const bufferIndex = (1 - cuebit.getCurrentBufferIndex()) as BufferIndex;
				const buffer = cuebit.getBuffer(bufferIndex);
				frameDrawer.draw(buffer.frameTexture);

				requestAnimationFrame(draw);
			};

			requestAnimationFrame(draw);

			const cuebit = new Cuebit(device, session, 640, 640);
			console.log("Cuebit instance created:", cuebit);

			await frameCapture.on(async (frame) => {
				// drawer.draw(frame as Uint8ClampedArray<ArrayBuffer>);
				const result = await measure(
					() => cuebit.process(frame),
					"Process Frame",
				);

				if (result) {
					overlayDrawer.draw(result.table);
				}
			});
		})();

		return () => {
			ac.abort();
		};
	}, [canvasRef, createOverlayDrawer]);

	return (
		<div
			style={{
				width: "100%",
				height: "100%",
			}}
		>
			<div
				style={{
					width: "auto",
					display: "flex",
					flexDirection: "row",
				}}
			>
				<canvas
					ref={canvasRef}
					style={{
						width: "100%",
						aspectRatio: "1 / 1",
						position: "absolute",
					}}
				/>
				<canvas
					ref={overlayCanvasRef}
					style={{
						width: "100%",
						aspectRatio: "1 / 1",
						position: "absolute",
					}}
				/>
			</div>
		</div>
	);
}

export default Main;
