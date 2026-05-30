import cv from "@techstark/opencv-js";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { argmin, measure, rerange, restoreMat, withMatScope } from "@/common";
import HitControlPanel from "@/components/hit-params-panel";
import Minimap from "@/components/minimap";
import OverlayToggleButton from "@/components/overlay-toggle-button";
import useDebugCanvas from "@/hooks/use-debug-canvas";
import useGPUCanvas, { drawTexture } from "@/hooks/use-gpu-canvas";
import createFrameCapture from "@/lib/capture";
import Cuebit from "@/lib/cuebit";
import logger from "@/lib/logger";
import { device, onnx } from "@/lib/onnx";
import { drawTrajectory } from "@/lib/painter";
import Simulator from "@/lib/simulator";
import styles from "./index.module.css";

/**
 * 큐의 방향정보와 수구, 목적구 정보 분리
 * @param cuePoints
 * @param ballPoints
 * @returns
 */
function resolveTableState(
	cuePoints: [Vector2, Vector2],
	ballPoints: Vector2[],
): {
	cue: Cue;
	cueBall: Vector2 | null;
	objectBalls: Vector2[];
} {
	let line: Line = {
		start: cuePoints[0],
		end: cuePoints[1],
	};
	let cueBallCandidate: {
		point: Vector2;
		distance: number;
	} | null = null;
	const objectBalls: Vector2[] = [];

	for (const ballPoint of ballPoints) {
		const distances = cuePoints.map((cuePoint) =>
			Math.hypot(ballPoint.x - cuePoint.x, ballPoint.y - cuePoint.y),
		);
		const cueTipIndex = argmin(distances);
		const minDistance = distances[cueTipIndex];

		if (cueBallCandidate === null || minDistance < cueBallCandidate.distance) {
			cueBallCandidate = { point: ballPoint, distance: minDistance };
			line = {
				start: cuePoints[1 - cueTipIndex],
				end: cuePoints[cueTipIndex],
			};

			if (cueBallCandidate !== null) {
				objectBalls.push(cueBallCandidate.point);
			}
		} else {
			objectBalls.push(ballPoint);
		}
	}

	return {
		cue: {
			line,
			angle: Math.atan2(line.end.y - line.start.y, line.end.x - line.start.x),
		},
		cueBall: cueBallCandidate?.point ?? null,
		objectBalls,
	};
}

/**
 * 메인 페이지.
 */
function Main() {
	/**
	 * 카메라 프레임 표시하는 Canvas
	 */
	const [createCameraCanvas, cameraCanvasSpec] = useGPUCanvas();
	/**
	 * Debug Canvas
	 */
	const [
		createDebug2DCanvas,
		createDebugGPUCanvas,
		debugCanvasSpecs,
		clearDebugCanvasSpecs,
	] = useDebugCanvas();
	/**
	 * 미니맵 캔버스
	 */
	const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

	const hitPointRef = useRef<Vector2>({ x: 0, y: 0 });
	const hitPowerRef = useRef(0.5);

	/**
	 * overlay 활성화 여부
	 */
	const [isOverlayEnabled, setIsOverlayEnabled] = useState(false);

	const loop = useEffectEvent(
		async (
			frame: VideoFrame,
			cuebit: Cuebit,
			simulator: Simulator,
			cameraCanvas: CanvasHandle<"webgpu">,
			resizedFrameCanvas: CanvasHandle<"webgpu">,
			tableMaskDebugCanvas: CanvasHandle<"webgpu">,
			cueMaskDebugCanvas: CanvasHandle<"webgpu">,
			detectionDebugCanvas: CanvasHandle<"2d">,
			normalizedTableDebugCanvas: CanvasHandle<"2d">,
			trajectoryDebugCanvas: CanvasHandle<"2d">,
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
			cameraCanvas.draw((device, context, _width, _height) => {
				drawTexture(device, context, buffer.frameTexture);
			});
			resizedFrameCanvas.draw((device, context, _width, _height) => {
				drawTexture(device, context, buffer.resizedFrameTexture);
			});
			tableMaskDebugCanvas.draw((device, context, _width, _height) => {
				drawTexture(device, context, buffer.tableMaskFrameTexture);
			});
			cueMaskDebugCanvas.draw((device, context, _width, _height) => {
				drawTexture(device, context, buffer.cueMaskFrameTexture);
			});

			const table = result.screenSpaceTable;
			if (!table) {
				return;
			}

			detectionDebugCanvas.draw((context, width, height) => {
				const widthScaleFactor = width / 160;
				const heightScaleFactor = height / 160;

				context.clearRect(0, 0, width, height);

				if (table.quad) {
					context.strokeStyle = "green";
					context.lineWidth = width * 0.002;

					context.beginPath();

					context.fillText(
						"table",
						((table.bbox.lt.x + table.bbox.rb.x) / 2) * widthScaleFactor,
						table.bbox.lt.y * heightScaleFactor,
					);

					context.rect(
						table.bbox.lt.x * widthScaleFactor,
						table.bbox.lt.y * heightScaleFactor,
						(table.bbox.rb.x - table.bbox.lt.x) * widthScaleFactor,
						(table.bbox.rb.y - table.bbox.lt.y) * heightScaleFactor,
					);
					context.stroke();

					context.strokeStyle = "red";
					context.lineWidth = width * 0.005;
					context.font = `${width * 0.05}px Arial`;
					context.fillStyle = "red";
					context.textAlign = "center";
					context.textBaseline = "bottom";

					context.beginPath();

					const points = [
						table.quad.points.topLeft,
						table.quad.points.bottomLeft,
						table.quad.points.bottomRight,
						table.quad.points.topRight,
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
				}

				if (result.screenSpaceCue) {
					context.strokeStyle = "green";
					context.lineWidth = width * 0.002;

					context.beginPath();

					context.fillText(
						"cue",
						((result.screenSpaceCue.bbox.lt.x +
							result.screenSpaceCue.bbox.rb.x) /
							2) *
							widthScaleFactor,
						result.screenSpaceCue.bbox.lt.y * heightScaleFactor,
					);

					context.rect(
						result.screenSpaceCue.bbox.lt.x * widthScaleFactor,
						result.screenSpaceCue.bbox.lt.y * heightScaleFactor,
						(result.screenSpaceCue.bbox.rb.x -
							result.screenSpaceCue.bbox.lt.x) *
							widthScaleFactor,
						(result.screenSpaceCue.bbox.rb.y -
							result.screenSpaceCue.bbox.lt.y) *
							heightScaleFactor,
					);
					context.stroke();
				}

				if (result.screenSpaceCue?.points) {
					context.strokeStyle = "white";
					context.lineWidth = width * 0.002;

					context.beginPath();
					context.moveTo(
						result.screenSpaceCue.points[0].x * widthScaleFactor,
						result.screenSpaceCue.points[0].y * heightScaleFactor,
					);
					context.lineTo(
						result.screenSpaceCue.points[1].x * widthScaleFactor,
						result.screenSpaceCue.points[1].y * heightScaleFactor,
					);
					context.stroke();
				}

				context.strokeStyle = "blue";
				context.lineWidth = width * 0.002;

				for (const ball of result.screenSpaceBallPoints) {
					context.beginPath();
					context.arc(
						ball.x * widthScaleFactor,
						ball.y * heightScaleFactor,
						width * 0.02,
						0,
						2 * Math.PI,
					);
					context.stroke();
				}
			});

			const normalizedBallPoints = withMatScope((track) => {
				const src = track(
					cv.matFromArray(
						result.screenSpaceBallPoints.length,
						1,
						cv.CV_32FC2,
						result.screenSpaceBallPoints.flatMap((p) => [p.x, p.y]),
					),
				);
				const dst = track(new cv.Mat());
				const transform = track(restoreMat(table.matrix.transform));
				cv.perspectiveTransform(src, dst, transform);
				const transformedPoints: Vector2[] = [];
				for (let i = 0; i < result.screenSpaceBallPoints.length; i++) {
					transformedPoints.push({
						x: dst.data32F[i * 2],
						y: dst.data32F[i * 2 + 1],
					});
				}

				return transformedPoints;
			});

			const normalizedCuePoints = withMatScope((track) => {
				if (!result.screenSpaceCue) {
					return null;
				}

				const src = track(
					cv.matFromArray(2, 1, cv.CV_32FC2, [
						result.screenSpaceCue.points[0].x,
						result.screenSpaceCue.points[0].y,
						result.screenSpaceCue.points[1].x,
						result.screenSpaceCue.points[1].y,
					]),
				);
				const dst = track(new cv.Mat());
				const transform = track(restoreMat(table.matrix.transform));
				cv.perspectiveTransform(src, dst, transform);
				const points: [Vector2, Vector2] = [
					{
						x: dst.data32F[0],
						y: dst.data32F[1],
					},
					{
						x: dst.data32F[2],
						y: dst.data32F[3],
					},
				];

				return points;
			});

			const resolvedState =
				normalizedCuePoints &&
				resolveTableState(normalizedCuePoints, normalizedBallPoints);

			normalizedTableDebugCanvas.draw((context, width, height) => {
				const widthScaleFactor = width / 2844;
				const heightScaleFactor = height / 1422;

				context.clearRect(0, 0, width, height);
				context.strokeStyle = "blue";
				context.lineWidth = width * 0.002;
				context.fillStyle = "red";
				context.font = `${width * 0.05}px Arial`;
				context.textAlign = "center";
				context.textBaseline = "bottom";

				let i = 0;
				for (const point of normalizedBallPoints) {
					if (point === resolvedState?.cueBall) {
						context.fillText(
							`c`,
							point.x * widthScaleFactor,
							point.y * heightScaleFactor,
						);
					} else {
						context.fillText(
							`${i}`,
							point.x * widthScaleFactor,
							point.y * heightScaleFactor,
						);
					}

					context.beginPath();
					context.arc(
						point.x * widthScaleFactor,
						point.y * heightScaleFactor,
						width * 0.02,
						0,
						2 * Math.PI,
					);
					context.stroke();
					i++;
				}

				if (normalizedCuePoints) {
					context.strokeStyle = "white";
					context.lineWidth = width * 0.002;

					context.beginPath();
					context.moveTo(
						normalizedCuePoints[0].x * widthScaleFactor,
						normalizedCuePoints[0].y * heightScaleFactor,
					);
					context.lineTo(
						normalizedCuePoints[1].x * widthScaleFactor,
						normalizedCuePoints[1].y * heightScaleFactor,
					);
					context.stroke();
				}
			});

			if (resolvedState?.cueBall) {
				const [initialTrajectory, step] = simulator.simulate(
					rerange(resolvedState.cueBall, 2844, 2.844),
					resolvedState.objectBalls.map((p) => rerange(p, 2844, 2.844)),
					resolvedState.cue.angle,
					hitPowerRef.current,
					hitPointRef.current,
				);

				const trajectories = [initialTrajectory];
				for (let i = 0; i < 600; i++) {
					const trajectory = step();
					trajectories.push(trajectory);
				}

				drawTrajectory(trajectoryDebugCanvas, trajectories);
			}
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
			logger.info(
				`Frame capture created. width: ${frameCapture.frameInfo.width}, height: ${frameCapture.frameInfo.height}`,
			);

			const cameraCanvas = await createCameraCanvas(
				device,
				frameCapture.frameInfo.width,
				frameCapture.frameInfo.height,
			);

			if (ac.signal.aborted) {
				logger.info("Initialization aborted");
				return;
			}

			const cuebit = new Cuebit(device, onnx, frameCapture.frameInfo);
			logger.info("Cuebit instance created");

			const simulator = new Simulator();
			logger.info("Simulator instance created");

			const resizedFrameCanvas = await createDebugGPUCanvas(
				device,
				onnx.segementation.input.feeds.image.width,
				onnx.segementation.input.feeds.image.height,
				{
					width: "100cqw",
					height: "auto",
					aspectRatio: "1 / 1",
				},
				"Resized Frame",
			);
			const tableMaskDebugCanvas = await createDebugGPUCanvas(
				device,
				onnx.segementation.output.fetchs.protos.width,
				onnx.segementation.output.fetchs.protos.height,
				{
					width: "100cqw",
					height: "100cqh",
					objectFit: "cover",
					objectPosition: "50% 50%",
					opacity: 0.2,
				},
				"Table Mask",
			);
			const cueMaskDebugCanvas = await createDebugGPUCanvas(
				device,
				onnx.segementation.output.fetchs.protos.width,
				onnx.segementation.output.fetchs.protos.height,
				{
					width: "100cqw",
					height: "100cqh",
					objectFit: "cover",
					objectPosition: "50% 50%",
					opacity: 0.8,
				},
				"Cue Mask",
			);
			const detectionDebugCanvas = await createDebug2DCanvas(
				frameCapture.frameInfo.width,
				frameCapture.frameInfo.height,
				{
					width: "100cqw",
					height: "100cqh",
					objectFit: "cover",
					objectPosition: "50% 50%",
				},
				"Detection Result",
			);
			const normalizedTableDebugCanvas = await createDebug2DCanvas(
				2844,
				1422,
				{
					width: "100cqw",
					height: "auto",
					aspectRatio: "2 / 1",
				},
				"Normalized Detection Result",
			);

			const trajectoryDebugCanvas = await createDebug2DCanvas(
				2844,
				1422,
				{
					width: "100cqw",
					height: "auto",
					aspectRatio: "2 / 1",
				},
				"Trajectory",
			);

			if (ac.signal.aborted) {
				return;
			}

			frameCapture.on(async (frame) => {
				await loop(
					frame,
					cuebit,
					simulator,
					cameraCanvas,
					resizedFrameCanvas,
					tableMaskDebugCanvas,
					cueMaskDebugCanvas,
					detectionDebugCanvas,
					normalizedTableDebugCanvas,
					trajectoryDebugCanvas,
				);
			});
		})();

		return () => {
			ac.abort();
			clearDebugCanvasSpecs();
		};
	}, [
		createCameraCanvas,
		createDebug2DCanvas,
		createDebugGPUCanvas,
		clearDebugCanvasSpecs,
	]);

	return (
		<div
			className={styles.container}
			style={{
				width: "100vw",
				height: "100vh",
				containerType: "size",
			}}
		>
			{/* 카메라 프레임 */}
			<div
				style={{
					position: "absolute",
					width: "100cqw",
					height: "100cwh",
				}}
			>
				{cameraCanvasSpec === null ? (
					<span>canvas 로딩중</span>
				) : (
					<canvas
						ref={(element) => {
							if (element) {
								cameraCanvasSpec.onMount(element);
							}
						}}
						width={cameraCanvasSpec.width}
						height={cameraCanvasSpec.height}
						style={{
							width: "100cqw",
							height: "100cqh",
							objectFit: "cover",
							objectPosition: "50% 50%",
						}}
					/>
				)}
			</div>

			{/* 디버깅 */}
			<div
				style={{
					width: "100cqw",
					height: "100cqh",
					overflow: "scroll",
					position: "absolute",
					display: "flex",
					alignItems: "center",
					justifyContent: "flex-start",
					scrollSnapType: "x mandatory",
				}}
			>
				<div
					style={{
						width: "100vw",
						height: "auto",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						flexShrink: 0,
						scrollSnapAlign: "center",
					}}
				></div>

				{debugCanvasSpecs.map((spec) => (
					<div
						key={spec.id}
						style={{
							width: "100cqw",
							height: "100cqh",
							position: "relative",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							flexShrink: 0,
						}}
					>
						<canvas
							ref={(element) => {
								if (element) {
									spec.onMount(element);
								}
							}}
							width={spec.width}
							height={spec.height}
							style={{
								...spec.style,
								backdropFilter: "brightness(0.6)",
								scrollSnapAlign: "center",
							}}
						/>
						<span
							style={{
								position: "absolute",
								top: 8,
								right: 8,
								padding: "4px",
								backgroundColor: "rgba(0, 0, 0, 0.5)",
								color: "white",
								fontSize: 12,
								borderRadius: 4,
							}}
						>
							{spec.name}
						</span>
					</div>
				))}
			</div>

			{/* 오버레이 */}
			{/* <canvas ref={overlayCanvasRef} className={styles.arCanvas} /> */}

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

			<HitControlPanel
				style={{
					position: "absolute",
					bottom: "20px",
					left: "20px",
					backgroundColor: "rgba(255, 255, 255, 0.9)",
					padding: "12px",
					borderRadius: "8px",
					boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
				}}
				onHitPointChange={(point) => {
					hitPointRef.current = point;
				}}
				onHitPowerChange={(power) => {
					hitPowerRef.current = power;
				}}
			/>

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
