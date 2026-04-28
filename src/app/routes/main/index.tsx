import { useCallback, useEffect, useRef, useState } from "react";
import { measure, todo } from "@/common";
import Minimap from "@/components/minimap";
import OverlayToggleButton from "@/components/overlay-toggle-button";
import createFrameCapture from "@/lib/capture";
import Cuebit from "@/lib/cuebit";
import { device, onnx } from "@/lib/onnx";
import createVisualizer from "@/lib/visualize";
import styles from "./index.module.css";

/**
 * 메인 페이지.
 */
function Main() {
	/**
	 * 카메라 프레임 표시하는 Canvas
	 */
	const videoCanvasRef = useRef<HTMLCanvasElement>(null);
	/**
	 * 디버깅용 Canvas
	 */
	const debugCanvasRef = useRef<HTMLCanvasElement>(null);
	/**
	 * Overlay Canvas
	 */
	const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
	/**
	 * 미니맵 캔버스
	 */
	const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

	// const [debugView, setDebugView] = useState<DebugView>("original"); // 현재 디버그 뷰

	/**
	 *
	 */
	const [isOverlayEnabled, setIsOverlayEnabled] = useState(false);
	const isOverlayEnabledRef = useRef(isOverlayEnabled);
	useEffect(() => {
		isOverlayEnabledRef.current = isOverlayEnabled;
	}, [isOverlayEnabled]);

	const createOverlayDrawer = useCallback(
		(canvas: HTMLCanvasElement, width: number, height: number) => {
			canvas.width = width;
			canvas.height = height;

			const context = canvas.getContext("2d");

			if (!context) {
				throw new Error("Failed to get canvas context");
			}

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

	/**
	 * frame capture 생성
	 */
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
				videoCanvasRef.current ?? todo("frame canvas가 없음"),
				device,
				frameCapture.frameInfo,
			);
			const debugDrawer = createVisualizer(
				debugCanvasRef.current ?? todo("debug canvas가 없음"),
				device,
				{
					width: 640,
					height: 640,
				},
			);

			const overlayDrawer = createOverlayDrawer(
				overlayCanvasRef.current ?? todo("overlay canvas가 없음"),
				frameCapture.frameInfo.width,
				frameCapture.frameInfo.height,
			);

			const cuebit = new Cuebit(device, onnx, frameCapture.frameInfo);

			console.log("Cuebit instance created:", cuebit);

			frameCapture.on(async (frame) => {
				if (!isOverlayEnabledRef.current) {
					return;
				}

				const result = await measure(
					() => cuebit.process(frame),
					"Process Frame",
				);

				const bufferIndex = cuebit.getCurrentBufferIndex();
				const buffer = cuebit.getBuffer(bufferIndex);
				frameDrawer.draw(buffer.frameTexture);
				// debugDrawer.draw(buffer.resizedFrameTexture);

				if (!result) {
					return;
				}

				overlayDrawer.draw((context, width, height) => {
					const widthScaleFactor = width / 160;
					const heightScaleFactor = height / 160;

					context.clearRect(0, 0, width, height);

					if (!result.quad) {
						return;
					}
					context.strokeStyle = "red";
					context.lineWidth = width * 0.005;
					context.font = `${width * 0.05}px Arial`;
					context.fillStyle = "red";
					context.textAlign = "center";
					context.textBaseline = "middle";

					context.beginPath();
					const points = [
						result.quad.points.topLeft,
						result.quad.points.bottomLeft,
						result.quad.points.bottomRight,
						result.quad.points.topRight,
					];

					for (let i = 0; i < 4; i++) {
						const point = points[i];
						context.fillText(
							`${i}`,
							point.x * widthScaleFactor,
							point.y * heightScaleFactor,
						);
						context.moveTo(
							point.x * widthScaleFactor,
							point.y * heightScaleFactor,
						);
						const nextPoint = points[(i + 1) % 4];
						context.lineTo(
							nextPoint.x * widthScaleFactor,
							nextPoint.y * heightScaleFactor,
						);
					}
					context.stroke();
				});
			});
		})();

		return () => {
			ac.abort();
		};
	}, [createOverlayDrawer]);

	return (
		<div className={styles.container}>
			{/* 카메라 프레임 */}
			<canvas ref={videoCanvasRef} className={styles.videoCanvas} />

			{/* 디버깅 */}
			<canvas ref={debugCanvasRef} className={styles.debugCanvas} />

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
