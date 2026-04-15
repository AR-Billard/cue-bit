import type { Point } from "@techstark/opencv-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { measure, todo } from "@/common";
import ARButton from "@/components/ar-button";
import Minimap from "@/components/minimap";
import useAR from "@/hooks/useAR";
import createFrameCapture from "@/lib/capture";
import Cuebit, { type BufferIndex } from "@/lib/cuebit";
import { device, session } from "@/lib/onnx";
import createVisualizer from "@/lib/visualize";
import type { PhysicsResult } from "@/types/physics";
import styles from "./Main.module.css";

/** 당구 모드 타입 — ModeToggle과 공유 */
export type BilliardMode = "3구" | "4구";

/**
 * 메인 페이지.
 * 이 파일은 "조립"만 담당해요.
 *
 * - 카메라/OpenCV 로직  → useCamera 훅
 * - AR 오버레이         → useAR 훅
 * - UI 컴포넌트들       → ARButton, ModeToggle, Minimap, DebugViewToggle
 * - 개발용 로그 패널    → DevLog (개발 환경에서만 표시)
 */
function Main() {
	const videoCanvasRef = useRef<HTMLCanvasElement>(null);
	const arCanvasRef = useRef<HTMLCanvasElement>(null);
	const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// const [debugView, setDebugView] = useState<DebugView>("original"); // 현재 디버그 뷰

	// AR 훅: 오버레이 그리기
	const { isARMode, toggleARMode, drawAR } = useAR({
		arCanvasRef,
		minimapCanvasRef,
		containerRef,
	});

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
				arCanvasRef.current ?? todo("canvas가 없음"),
				device,
				640,
				640,
			);
			const overlayDrawer = createOverlayDrawer(
				arCanvasRef.current ?? todo("overlay canvas가 없음"),
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
	}, [arCanvasRef, createOverlayDrawer]);

	return (
		<div ref={containerRef} className={styles.container}>
			{/* 레이어 1: 카메라 영상 */}
			<canvas ref={videoCanvasRef} className={styles.videoCanvas} />

			{/* 레이어 2: OpenCV 로딩 오버레이 */}
			{/* {!cvLoaded && (
				<div className={styles.loadingOverlay}>
					<div className={styles.spinner} />
					<p className={styles.loadingText}>AI 비전 엔진 로딩 중...</p>
				</div>
			)} */}

			{/* 레이어 3: 에러 메시지 */}
			{/* {errorMsg && <div className={styles.error}>{errorMsg}</div>} */}

			{/* 레이어 4: AR 궤적 오버레이 */}
			<canvas ref={arCanvasRef} className={styles.arCanvas} />

			{/* 레이어 5: 상단 헤더 */}
			<div className={styles.header}>
				<div>
					<h1 className={styles.title}>
						Cue<span className={styles.titleAccent}>bit</span>
					</h1>
					<p className={styles.subtitle}>Real-time Trajectory</p>
				</div>
				{isARMode && (
					<div className={styles.analyzingBadge}>
						<div className={styles.analyzingDot} />
						<span className={styles.analyzingText}>실시간 분석 중...</span>
					</div>
				)}
			</div>

			{/* 레이어 6: 미니맵 */}
			<Minimap ref={minimapCanvasRef} visible={isARMode} />

			{/* 레이어 7: 하단 컨트롤 패널 */}
			<div className={styles.controls}>
				{/* <DebugViewToggle current={debugView} onChange={setDebugView} /> */}
				<ARButton isARMode={isARMode} onClick={toggleARMode} />
			</div>

			{/* 레이어 8: 개발용 로그 패널 (개발 환경에서만 표시) */}
			{/* <DevLog /> */}
		</div>
	);
}

export default Main;
