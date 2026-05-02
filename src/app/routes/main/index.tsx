import {
	useCallback,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import { measure, todo } from "@/common";
import Minimap from "@/components/minimap";
import OverlayToggleButton from "@/components/overlay-toggle-button";
import useDebugCanvas from "@/hooks/use-debug-canvas";
import useGPUCanvas, {
	drawTexture,
	type GPUCanvasHandle,
} from "@/hooks/use-gpu-canvas";
import createFrameCapture from "@/lib/capture";
import Cuebit from "@/lib/cuebit";
import { device, onnx } from "@/lib/onnx";
import styles from "./index.module.css";

/**
 * 메인 페이지.
 */
function Main() {
	/**
	 * 카메라 프레임 표시하는 Canvas
	 */
	const cameraCanvas = useGPUCanvas();

	/**
	 * Overlay Canvas
	 */
	const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
	/**
	 * 미니맵 캔버스
	 */
	const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

	const debugCanvas = useDebugCanvas();

	// const [debugView, setDebugView] = useState<DebugView>("original"); // 현재 디버그 뷰

	/**
	 * overlay 활성화 여부
	 */
	const [isOverlayEnabled, setIsOverlayEnabled] = useState(false);

	const createOverlayDrawer = useCallback(
		(canvas: HTMLCanvasElement, width: number, height: number) => {
			canvas.width = width;
			canvas.height = height;

			const context =
				canvas.getContext("2d") ?? todo("Failed to get 2D context from canvas");

			return {
				draw: (
					pass: (
						context: CanvasRenderingContext2D,
						width: number,
						height: number,
					) => void,
				) => {
					pass(context, canvas.width, canvas.height);
				},
			};
		},
		[],
	);

	const loop = useEffectEvent(
		async (
			frame: VideoFrame,
			cuebit: Cuebit,
			videCanvasHandle: GPUCanvasHandle,
		) => {
			if (!isOverlayEnabled) {
				return;
			}

			const result = await measure(
				() => cuebit.process(frame),
				"Process Frame",
			);

			const bufferIndex = cuebit.getCurrentBufferIndex();
			const buffer = cuebit.getBuffer(bufferIndex);
			videCanvasHandle.draw((device, handle) => {
				drawTexture(device, handle.context, buffer.frameTexture);
			});
			// debugDrawer.draw(buffer.resizedFrameTexture);

			if (!result) {
				return;
			}

			// overlayDrawer.draw((context, width, height) => {
			// 	const widthScaleFactor = width / 160;
			// 	const heightScaleFactor = height / 160;

			// 	context.clearRect(0, 0, width, height);

			// 	if (!result.table) {
			// 		return;
			// 	}

			// 	context.strokeStyle = "red";
			// 	context.lineWidth = width * 0.005;
			// 	context.font = `${width * 0.05}px Arial`;
			// 	context.fillStyle = "red";
			// 	context.textAlign = "center";
			// 	context.textBaseline = "bottom";

			// 	context.beginPath();

			// 	const points = [
			// 		result.table.quad.points.topLeft,
			// 		result.table.quad.points.bottomLeft,
			// 		result.table.quad.points.bottomRight,
			// 		result.table.quad.points.topRight,
			// 	];

			// 	for (let i = 0; i < 4; i++) {
			// 		const point = points[i];
			// 		context.fillText(
			// 			`${i}`,
			// 			point.x * widthScaleFactor,
			// 			point.y * heightScaleFactor,
			// 		);
			// 		context.moveTo(
			// 			point.x * widthScaleFactor,
			// 			point.y * heightScaleFactor,
			// 		);
			// 		const nextPoint = points[(i + 1) % 4];
			// 		context.lineTo(
			// 			nextPoint.x * widthScaleFactor,
			// 			nextPoint.y * heightScaleFactor,
			// 		);
			// 	}
			// 	context.stroke();

			// 	for (const ball of result.balls) {
			// 		context.beginPath();
			// 		context.arc(
			// 			ball.position.x * widthScaleFactor,
			// 			ball.position.y * heightScaleFactor,
			// 			width * 0.02,
			// 			0,
			// 			2 * Math.PI,
			// 		);
			// 		context.fillStyle = "blue";
			// 		context.fill();
			// 	}
			// });
		},
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

			const cam = await cameraCanvas.createCanvas(
				device,
				frameCapture.frameInfo.width,
				frameCapture.frameInfo.height,
			);

			const cuebit = new Cuebit(device, onnx, frameCapture.frameInfo);
			console.log("Cuebit instance created:", cuebit);

			frameCapture.on(async (frame) => {
				await loop(frame, cuebit, cam);
			});
		})();

		return () => {
			ac.abort();
		};
	}, [cameraCanvas, createOverlayDrawer]);

	return (
		<div className={styles.container}>
			{/* 카메라 프레임 */}
			<div>{<cameraCanvas.element className={styles.videoCanvas} />}</div>

			{/* 디버깅 */}
			<div
				style={{
					width: "100vw",
					height: "auto",
					aspectRatio: "1 / 1",
					overflow: "scroll",
					display: "flex",
					flexDirection: "row",
				}}
			>
				{debugCanvas.specs.map((spec) => (
					<canvas
						key={spec.id}
						ref={spec.ref}
						width={spec.width}
						height={spec.height}
						style={{
							width: "100vw",
							height: "auto",
							aspectRatio: "1 / 1",
						}}
					/>
				))}
			</div>

			{/* 오버레이 */}
			<canvas ref={overlayCanvasRef} className={styles.arCanvas} />

			{/* 상단 헤더 */}
			<div className={styles.header}>
				<div>
					<h1 className={styles.title}>
						Cue<span className={styles.titleAccent}>bit</span>
					</h1>
					<p className={styles.subtitle}>Real-time Trajectory</p>
				</div>
				{isOverlayEnabled && (
					<div className={styles.analyzingBadge}>
						<div className={styles.analyzingDot} />
						<span className={styles.analyzingText}>실시간 분석 중...</span>
					</div>
				)}
			</div>

			{/* 미니맵 */}
			<Minimap ref={minimapCanvasRef} visible={isOverlayEnabled} />

			{/* 하단 컨트롤 패널 */}
			<div className={styles.controls}>
				{/* <DebugViewToggle current={debugView} onChange={setDebugView} /> */}
				<OverlayToggleButton
					enabled={isOverlayEnabled}
					onClick={() => {
						setIsOverlayEnabled((prev) => !prev);
					}}
				/>
			</div>

			{/* 개발용 로그 패널 (개발 환경에서만 표시) */}
			{/* <DevLog /> */}
		</div>
	);
}

export default Main;
