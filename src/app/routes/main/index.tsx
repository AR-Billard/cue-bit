import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type PointerEvent,
} from "react";
import ARButton from "@/components/ar_button/ar_button";
import DevLog from "@/components/dev_log/dev_log";
import Minimap from "@/components/minimap/minimap";
import useAR from "@/hooks/use_ar";
import useCamera, { type DetectionMode } from "@/hooks/use_camera";
import useSimulation from "@/hooks/use_simulation";
import { toPredictShotInput } from "@/lib/physics";
import type { DetectedState } from "@/types/detection";
import type { BallPositions, PhysicsResult } from "@/types/physics";
import TestPanel from "./test_panel";
import styles from "./main.module.css";

const DEFAULT_BALL_POSITIONS: BallPositions = {
	cueBall: { x: 0.57, y: 1.07 },
	red: { x: 1, y: 0.71 },
	yellow: { x: 1.23, y: 0.36 },
};

const TEST_PANEL_BALLS = [
	{ id: "cueBall", label: "\uc218\uad6c" },
	{ id: "red", label: "\ubaa9\uc801\uad6c 1" },
	{ id: "yellow", label: "\ubaa9\uc801\uad6c 2" },
] as const;

const SPIN_MM_TO_HIT_POINT = 1 / 100;
const POWER_MIN = 0;
const POWER_MAX = 3;
const POWER_STEP = 0.1;
const SPIN_MIN_MM = -100;
const SPIN_MAX_MM = 100;

function clampValue(value: number, min: number, max: number) {
	if (!Number.isFinite(value)) return min;
	return Math.max(min, Math.min(max, value));
}

function Main() {
	const videoCanvasRef = useRef<HTMLCanvasElement>(null);
	const arCanvasRef = useRef<HTMLCanvasElement>(null);
	const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const predictionCacheRef = useRef<{
		key: string;
		result: PhysicsResult;
	} | null>(null);

	const [gameState, setGameState] = useState({
		balls: DEFAULT_BALL_POSITIONS,
		angleDeg: 315,
		power: 1.5,
		sideSpin: 0,
		topSpin: 0,
	});
	const [cameraShotInput, setCameraShotInput] = useState({
		power: 1.5,
		sideSpin: 0,
		topSpin: 0,
	});
	const [inputSource, setInputSource] = useState<DetectionMode>(
		import.meta.env.DEV ? "simulator" : "camera",
	);
	const [isTestPanelOpen, setIsTestPanelOpen] = useState(false);
	const [cueTravelMeters, setCueTravelMeters] = useState(0);
	const [isControlUiHidden, setIsControlUiHidden] = useState(false);

	const { isARMode, toggleARMode, drawAR } = useAR({
		arCanvasRef,
		minimapCanvasRef,
		containerRef,
	});
	const { sim, tuningVersion } = useSimulation();
	const canUseTestPanel = inputSource === "simulator";
	const shouldShowMainTrajectory =
		inputSource === "simulator" || (inputSource === "camera" && isARMode);
	const shouldShowMinimap = inputSource === "simulator" || isARMode;
	const shouldShowCameraShotControls =
		inputSource === "camera" && isARMode && !isControlUiHidden;
	const shouldShowARButton = inputSource !== "camera" || !isControlUiHidden;
	const shouldShowInputControls =
		inputSource !== "camera" || !isControlUiHidden;
	const shouldShowControlVisibilityButton = inputSource === "camera";

	useEffect(() => {
		if (!canUseTestPanel) {
			setIsTestPanelOpen(false);
		}
	}, [canUseTestPanel]);

	useEffect(() => {
		if (inputSource !== "camera") {
			setIsControlUiHidden(false);
		}
	}, [inputSource]);

	const handleFrame = useCallback(
		(detected: DetectedState | null) => {
			if (!detected) {
				predictionCacheRef.current = null;
				setCueTravelMeters((prev) => (prev === 0 ? prev : 0));
				drawAR(null, {
					showMainOverlay: shouldShowMainTrajectory,
					showMinimap: shouldShowMinimap,
				});
				return;
			}

			const predictInput = toPredictShotInput(detected);
			const predictionKey = JSON.stringify({
				predictInput,
				tuningVersion,
			});

			let physicsResult = predictionCacheRef.current?.result;
			if (!physicsResult || predictionCacheRef.current?.key !== predictionKey) {
				sim.updateBallPositionsMeters(predictInput.balls);
				physicsResult = sim.predict(
					predictInput.angleDeg,
					predictInput.power,
					predictInput.maxSteps,
					predictInput.sideSpin,
					predictInput.topSpin,
				);
				predictionCacheRef.current = {
					key: predictionKey,
					result: physicsResult,
				};
			}

			const nextCueTravel =
				physicsResult.summary?.travelDistanceByBall["cueBall"] ?? 0;
			setCueTravelMeters((prev) =>
				Math.abs(prev - nextCueTravel) > 0.005 ? nextCueTravel : prev,
			);

			drawAR(physicsResult, {
				showMainOverlay: shouldShowMainTrajectory,
				showMinimap: shouldShowMinimap,
			});
		},
		[drawAR, shouldShowMainTrajectory, shouldShowMinimap, sim, tuningVersion],
	);

	const handleARButtonClick = useCallback(() => {
		if (!isARMode && inputSource !== "simulator") {
			setInputSource("camera");
		}
		toggleARMode();
	}, [inputSource, isARMode, toggleARMode]);

	const selectCameraSpinPoint = useCallback(
		(event: PointerEvent<HTMLButtonElement>) => {
			const rect = event.currentTarget.getBoundingClientRect();
			const centerX = rect.left + rect.width / 2;
			const centerY = rect.top + rect.height / 2;
			const radius = rect.width / 2;
			const rawX = (event.clientX - centerX) / radius;
			const rawY = (event.clientY - centerY) / radius;
			const distance = Math.hypot(rawX, rawY);
			const clampedX = distance > 1 ? rawX / distance : rawX;
			const clampedY = distance > 1 ? rawY / distance : rawY;

			setCameraShotInput((prev) => ({
				...prev,
				sideSpin: Math.round(clampedX * SPIN_MAX_MM),
				topSpin: Math.round(-clampedY * SPIN_MAX_MM),
			}));
		},
		[],
	);

	const resetCameraSpin = useCallback(() => {
		setCameraShotInput((prev) => ({
			...prev,
			sideSpin: 0,
			topSpin: 0,
		}));
	}, []);

	const cameraSpinMarkerX =
		50 +
		(clampValue(cameraShotInput.sideSpin, SPIN_MIN_MM, SPIN_MAX_MM) /
			SPIN_MAX_MM) *
			50;
	const cameraSpinMarkerY =
		50 -
		(clampValue(cameraShotInput.topSpin, SPIN_MIN_MM, SPIN_MAX_MM) /
			SPIN_MAX_MM) *
			50;

	const { cameraReady, errorMsg } = useCamera({
		videoCanvasRef,
		onFrame: handleFrame,
		inputSource,
		cameraUiInput: {
			power: cameraShotInput.power,
			sideSpin: cameraShotInput.sideSpin * SPIN_MM_TO_HIT_POINT,
			topSpin: cameraShotInput.topSpin * SPIN_MM_TO_HIT_POINT,
			cueBallId: "white",
		},
		simulatorInput: {
			balls: gameState.balls,
			angleDeg: gameState.angleDeg,
			power: gameState.power,
			sideSpin: gameState.sideSpin,
			topSpin: gameState.topSpin,
			cueBallId: "cueBall",
		},
	});

	return (
		<div ref={containerRef} className={styles.container}>
			<canvas ref={videoCanvasRef} className={styles.videoCanvas} />

			{!cameraReady && (
				<div className={styles.loadingOverlay}>
					<div className={styles.spinner} />
					<p className={styles.loadingText}>
						{"\uce74\uba54\ub77c \uc900\ube44 \uc911..."}
					</p>
				</div>
			)}

			{errorMsg && <div className={styles.error}>{errorMsg}</div>}

			<canvas ref={arCanvasRef} className={styles.arCanvas} />

			<div className={styles.header}>
				<div>
					<h1 className={styles.title}>
						Cue<span className={styles.titleAccent}>bit</span>
					</h1>
					<p className={styles.subtitle}>
						{"\uc2e4\uc2dc\uac04 \uada4\uc801 \uac00\uc774\ub4dc"}
					</p>
				</div>
				{isARMode && cameraReady && (
					<div className={styles.analyzingBadge}>
						<div className={styles.analyzingDot} />
						<span className={styles.analyzingText}>
							{"\uc2e4\uc2dc\uac04 \uc608\uce21 \uc911"}
						</span>
					</div>
				)}
			</div>

			<Minimap
				ref={minimapCanvasRef}
				visible={cameraReady && shouldShowMinimap}
			/>

			{canUseTestPanel && isTestPanelOpen && (
				<TestPanel
					balls={gameState.balls}
					ballControls={TEST_PANEL_BALLS}
					angleDeg={gameState.angleDeg}
					power={gameState.power}
					sideSpin={gameState.sideSpin}
					topSpin={gameState.topSpin}
					cueTravelMeters={cueTravelMeters}
					onBallChange={(ballId, pos) =>
						setGameState((prev) => ({
							...prev,
							balls: { ...prev.balls, [ballId]: pos },
						}))
					}
					onAngleDegChange={(angleDeg) =>
						setGameState((prev) => ({ ...prev, angleDeg }))
					}
					onPowerChange={(power) =>
						setGameState((prev) => ({ ...prev, power }))
					}
					onSideSpinChange={(sideSpin) =>
						setGameState((prev) => ({ ...prev, sideSpin }))
					}
					onTopSpinChange={(topSpin) =>
						setGameState((prev) => ({ ...prev, topSpin }))
					}
					onClose={() => setIsTestPanelOpen(false)}
				/>
			)}

			<div className={styles.controls}>
				{shouldShowInputControls && (
					<div className={styles.debugRow}>
						<div className={styles.debugGroup}>
							<span className={styles.debugLabel}>INPUT</span>
							<div className={styles.debugTrack}>
								<button
									type="button"
									className={`${styles.openTestBtn} ${
										inputSource === "camera" ? styles.active : ""
									}`}
									onClick={() => setInputSource("camera")}
								>
									CAM
								</button>
								<button
									type="button"
									className={`${styles.openTestBtn} ${
										inputSource === "simulator" ? styles.active : ""
									}`}
									onClick={() => setInputSource("simulator")}
								>
									SIM
								</button>
							</div>
						</div>
						{canUseTestPanel && (
							<div className={styles.debugGroup}>
								<span className={styles.debugLabel}>TEST</span>
								<div className={styles.debugTrack}>
									<button
										type="button"
										className={`${styles.openTestBtn} ${
											isTestPanelOpen ? styles.active : ""
										}`}
										onClick={() => setIsTestPanelOpen((prev) => !prev)}
									>
										Panel
									</button>
								</div>
							</div>
						)}
					</div>
				)}
				{shouldShowCameraShotControls && (
					<div className={styles.cameraShotPanel}>
						<label>
							<span>{`Power ${cameraShotInput.power.toFixed(1)}`}</span>
							<input
								type="range"
								min={POWER_MIN}
								max={POWER_MAX}
								step={POWER_STEP}
								value={cameraShotInput.power}
								onChange={(event) =>
									setCameraShotInput((prev) => ({
										...prev,
										power: Number(event.target.value),
									}))
								}
							/>
						</label>
						<label>
							<span>
								{`Spin side ${cameraShotInput.sideSpin}mm / top ${cameraShotInput.topSpin}mm`}
							</span>
							<div className={styles.cameraSpinPadRow}>
								<button
									type="button"
									className={styles.spinPad}
									onPointerDown={selectCameraSpinPoint}
									aria-label="Select camera shot hit point"
								>
									<span className={styles.spinGuideHorizontal} />
									<span className={styles.spinGuideVertical} />
									<span
										className={styles.spinMarker}
										style={{
											left: `${cameraSpinMarkerX}%`,
											top: `${cameraSpinMarkerY}%`,
										}}
									/>
								</button>
								<button
									type="button"
									className={styles.spinResetButton}
									onClick={resetCameraSpin}
								>
									Center
								</button>
							</div>
						</label>
					</div>
				)}
				{(shouldShowControlVisibilityButton || shouldShowARButton) && (
					<div className={styles.actionRow}>
						{shouldShowControlVisibilityButton && (
							<button
								type="button"
								className={styles.controlVisibilityButton}
								onClick={() => setIsControlUiHidden((prev) => !prev)}
							>
								{isControlUiHidden ? "UI \ud45c\uc2dc" : "UI \uc228\uae40"}
							</button>
						)}
						{shouldShowARButton && (
							<ARButton isARMode={isARMode} onClick={handleARButtonClick} />
						)}
					</div>
				)}
			</div>

			{false && inputSource === "camera" && (
				<button
					type="button"
					className={styles.controlVisibilityButton}
					onClick={() => setIsControlUiHidden((prev) => !prev)}
				>
					{isControlUiHidden ? "UI 표시" : "UI 숨김"}
				</button>
			)}

			<DevLog />
		</div>
	);
}

export default Main;
