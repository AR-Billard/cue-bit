import cv from "@techstark/opencv-js";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { measure, restoreMat, withMatScope } from "@/common";
import Minimap from "@/components/minimap";
import OverlayToggleButton from "@/components/overlay-toggle-button";
import useDebugCanvas from "@/hooks/use-debug-canvas";
import useGPUCanvas, { drawTexture } from "@/hooks/use-gpu-canvas";
import createFrameCapture from "@/lib/capture";
import Cuebit from "@/lib/cuebit";
import { device, onnx } from "@/lib/onnx";
import Simulator from "@/lib/simulator";
import styles from "./index.module.css";

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
			tableDebugCanvas: CanvasHandle<"2d">,
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

			const table = result.table;
			if (!table) {
				return;
			}

			tableDebugCanvas.draw((context, width, height) => {
				const widthScaleFactor = width / 160;
				const heightScaleFactor = height / 160;

				context.clearRect(0, 0, width, height);

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

				if (result.cue?.bbox) {
					context.strokeStyle = "green";
					context.lineWidth = width * 0.002;

					context.beginPath();

					context.fillText(
						"cue",
						((result.cue.bbox.lt.x + result.cue.bbox.rb.x) / 2) *
							widthScaleFactor,
						result.cue.bbox.lt.y * heightScaleFactor,
					);

					context.rect(
						result.cue.bbox.lt.x * widthScaleFactor,
						result.cue.bbox.lt.y * heightScaleFactor,
						(result.cue.bbox.rb.x - result.cue.bbox.lt.x) * widthScaleFactor,
						(result.cue.bbox.rb.y - result.cue.bbox.lt.y) * heightScaleFactor,
					);
					context.stroke();
				}

				if (result.cue?.line) {
					context.strokeStyle = "white";
					context.lineWidth = width * 0.002;

					context.beginPath();
					context.moveTo(
						result.cue.line.start.x * widthScaleFactor,
						result.cue.line.start.y * heightScaleFactor,
					);
					context.lineTo(
						result.cue.line.end.x * widthScaleFactor,
						result.cue.line.end.y * heightScaleFactor,
					);
					context.stroke();
				}

				context.strokeStyle = "blue";
				context.lineWidth = width * 0.002;

				for (const ball of result.balls) {
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

			const transformedPoints = withMatScope((track) => {
				const src = track(
					cv.matFromArray(
						result.balls.length,
						1,
						cv.CV_32FC2,
						result.balls.flatMap((p) => [p.x, p.y]),
					),
				);
				const dst = track(new cv.Mat());
				const transform = track(restoreMat(table.matrix.transform));
				cv.perspectiveTransform(src, dst, transform);
				const transformedPoints: Vector2[] = [];
				for (let i = 0; i < result.balls.length; i++) {
					transformedPoints.push({
						x: dst.data32F[i * 2],
						y: dst.data32F[i * 2 + 1],
					});
				}

				return transformedPoints;
			});

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
				for (const point of transformedPoints) {
					context.fillText(
						`${i}`,
						point.x * widthScaleFactor,
						point.y * heightScaleFactor,
					);
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
			});

			const scaledPoints = transformedPoints.map((p) => ({
				x: p.x * 0.001,
				y: p.y * 0.001,
			}));

			console.log("Transformed and scaled points:", scaledPoints);

			// const [initialTrajectory, step] = simulator.simulate(
			// 	{ x: 0.5, y: 0.5 },
			// 	[],
			// 	Math.PI / 4,
			// 	0.0001,
			// 	{ x: 0.5, y: 0.5 },
			// );
			const [initialTrajectory, step] = simulator.simulate(
				scaledPoints[0],
				[],
				// scaledPoints.slice(1, 3),
				Math.PI / 1.4,
				0.0001,
				{ x: 0.5, y: 0.5 },
			);

			const trajectories = [initialTrajectory];
			for (let i = 0; i < 600; i++) {
				const trajectory = step();
				trajectories.push(trajectory);
			}

			// console.log("Simulated trajectories:", trajectories);

			// TODO: Float32Array 로 캐시히트 최적화 해볼수 있을듯
			trajectoryDebugCanvas.draw((context, width, height) => {
				const widthScaleFactor = width / 2844;
				const heightScaleFactor = height / 1422;
				const balls = [
					trajectories.map((t) => t.target),
					// ...trajectories.map((t) => t.others),
				];

				context.clearRect(0, 0, width, height);
				context.lineWidth = width * 0.003;

				for (let i = 0; i < balls.length; i++) {
					const ball = balls[i];
					context.strokeStyle = i === 0 ? "white" : "yellow";

					context.beginPath();
					const initialPosition = ball[0];
					const x = initialPosition.x * 1000 * widthScaleFactor;
					const y = initialPosition.z * 1000 * heightScaleFactor;
					context.arc(x, y, width * 0.02, 0, 2 * Math.PI);
					context.stroke();

					context.beginPath();
					context.moveTo(x, y);
					for (let tick = 1; tick < ball.length; tick++) {
						const position = ball[tick];
						const x = position.x * 1000 * widthScaleFactor;
						const y = position.z * 1000 * heightScaleFactor;

						context.lineTo(x, y);
					}
					context.stroke();
				}
			});
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

			const cameraCanvas = await createCameraCanvas(
				device,
				frameCapture.frameInfo.width,
				frameCapture.frameInfo.height,
			);

			if (ac.signal.aborted) {
				console.log("Initialization aborted");
				return;
			}

			const cuebit = new Cuebit(device, onnx, frameCapture.frameInfo);
			console.log("Cuebit instance created:", cuebit);

			const simulator = new Simulator({
				table: {
					width: 2.844,
					height: 1.422,
				},
				ball: {
					count: 4,
					radius: 0.05715 / 2,
				},
				physics: {
					timeStep: 1 / 60,
				},
			});
			console.log("Simulator instance created:", simulator);

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
			const tableDebugCanvas = await createDebug2DCanvas(
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
					tableDebugCanvas,
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
					<></>
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
							key={spec.id}
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
