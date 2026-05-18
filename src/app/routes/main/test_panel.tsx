import React, { useEffect, useRef, useState } from "react";
import { calibratePowerTravel, estimatePowerValueTravel } from "@/lib/physics";
import { TABLE_HEIGHT_M, TABLE_WIDTH_M } from "@/lib/physics/physics_constants";
import type { BallPositions, MeterPoint } from "@/types/physics";
import styles from "./main.module.css";

interface BallControl {
	id: string;
	label: string;
}

interface TestPanelProps {
	balls: BallPositions;
	ballControls: readonly BallControl[];
	angleDeg: number;
	power: number;
	sideSpin: number;
	topSpin: number;
	cueTravelMeters: number;
	onBallChange: (ballId: string, pos: MeterPoint) => void;
	onAngleDegChange: (angleDeg: number) => void;
	onPowerChange: (power: number) => void;
	onSideSpinChange: (sideSpin: number) => void;
	onTopSpinChange: (topSpin: number) => void;
	onClose: () => void;
}

const MAX_SPIN_OFFSET_MM = 100;
const POWER_MIN = 0;
const POWER_MAX = 3;
const POWER_STEP = 0.1;
const POSITION_MIN_M = 0;
const POSITION_STEP_M = 0.01;
const ANGLE_MIN = 0;
const ANGLE_MAX = 360;
const FALLBACK_BALL_POSITION: MeterPoint = { x: 0, y: 0 };

function clampValue(value: number, min: number, max: number) {
	if (!Number.isFinite(value)) return min;
	return Math.max(min, Math.min(max, value));
}

const TestPanel: React.FC<TestPanelProps> = ({
	balls,
	ballControls,
	angleDeg,
	power,
	sideSpin,
	topSpin,
	cueTravelMeters,
	onBallChange,
	onAngleDegChange,
	onPowerChange,
	onSideSpinChange,
	onTopSpinChange,
	onClose,
}) => {
	const [position, setPosition] = useState({ x: 15, y: 150 });
	const isDragging = useRef(false);
	const offset = useRef({ x: 0, y: 0 });
	const panelRef = useRef<HTMLDivElement>(null);
	const baselineTravel = estimatePowerValueTravel(power);
	const [targetTravelMeters, setTargetTravelMeters] = useState(() =>
		Number(baselineTravel.travelMeters.toFixed(2)),
	);
	const targetTravelForCalibration = Math.max(0.01, targetTravelMeters);
	const calibration = calibratePowerTravel({
		power,
		targetTravelMeters: targetTravelForCalibration,
	});

	const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
		const target = e.target as HTMLElement;
		const targetTag = target.tagName;
		if (
			targetTag === "INPUT" ||
			targetTag === "BUTTON" ||
			target.closest("[data-no-panel-drag]")
		) {
			return;
		}

		isDragging.current = true;
		const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
		const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

		if (panelRef.current) {
			const rect = panelRef.current.getBoundingClientRect();
			offset.current = {
				x: clientX - rect.left,
				y: clientY - rect.top,
			};
		}
	};

	useEffect(() => {
		const handleMove = (e: MouseEvent | TouchEvent) => {
			if (!isDragging.current) return;
			const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
			const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
			setPosition({
				x: clientX - offset.current.x,
				y: clientY - offset.current.y,
			});
		};
		const handleEnd = () => {
			isDragging.current = false;
		};

		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleEnd);
		window.addEventListener("touchmove", handleMove, { passive: false });
		window.addEventListener("touchend", handleEnd);
		return () => {
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleEnd);
			window.removeEventListener("touchmove", handleMove);
			window.removeEventListener("touchend", handleEnd);
		};
	}, []);

	const selectSpinPoint = (event: React.PointerEvent<HTMLButtonElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		const radius = rect.width / 2;
		const rawX = (event.clientX - centerX) / radius;
		const rawY = (event.clientY - centerY) / radius;
		const distance = Math.hypot(rawX, rawY);
		const clampedX = distance > 1 ? rawX / distance : rawX;
		const clampedY = distance > 1 ? rawY / distance : rawY;

		onSideSpinChange(Math.round(clampedX * MAX_SPIN_OFFSET_MM));
		onTopSpinChange(Math.round(-clampedY * MAX_SPIN_OFFSET_MM));
	};

	const updateSideSpin = (value: number) => {
		onSideSpinChange(
			Math.round(clampValue(value, -MAX_SPIN_OFFSET_MM, MAX_SPIN_OFFSET_MM)),
		);
	};

	const updateTopBottomSpin = (value: number) => {
		onTopSpinChange(
			Math.round(clampValue(value, -MAX_SPIN_OFFSET_MM, MAX_SPIN_OFFSET_MM)),
		);
	};

	const updatePower = (value: number) => {
		onPowerChange(Number(clampValue(value, POWER_MIN, POWER_MAX).toFixed(1)));
	};

	const updateAngle = (value: number) => {
		onAngleDegChange(Math.round(clampValue(value, ANGLE_MIN, ANGLE_MAX)));
	};

	const updateBallCoordinate = (
		ballId: string,
		ball: MeterPoint,
		axis: keyof MeterPoint,
		value: number,
	) => {
		const max = axis === "x" ? TABLE_WIDTH_M : TABLE_HEIGHT_M;
		onBallChange(ballId, {
			...ball,
			[axis]: Number(clampValue(value, POSITION_MIN_M, max).toFixed(2)),
		});
	};

	const renderBallCoordinateControls = ({ id, label }: BallControl) => {
		const ball = balls[id] ?? FALLBACK_BALL_POSITION;

		return (
			<div key={id} className={styles.testGroup}>
				<label>{`${label} X: ${ball.x.toFixed(2)}m / Y: ${ball.y.toFixed(2)}m`}</label>
				<div className={styles.sliderInputRow}>
					<input
						type="range"
						min={POSITION_MIN_M}
						max={TABLE_WIDTH_M}
						step={POSITION_STEP_M}
						value={ball.x}
						onChange={(e) =>
							updateBallCoordinate(id, ball, "x", Number(e.target.value))
						}
					/>
					<input
						className={styles.compactNumberInput}
						type="number"
						min={POSITION_MIN_M}
						max={TABLE_WIDTH_M}
						step={POSITION_STEP_M}
						value={ball.x.toFixed(2)}
						onChange={(e) =>
							updateBallCoordinate(id, ball, "x", Number(e.target.value))
						}
					/>
				</div>
				<div className={styles.sliderInputRow}>
					<input
						type="range"
						min={POSITION_MIN_M}
						max={TABLE_HEIGHT_M}
						step={POSITION_STEP_M}
						value={ball.y}
						onChange={(e) =>
							updateBallCoordinate(id, ball, "y", Number(e.target.value))
						}
					/>
					<input
						className={styles.compactNumberInput}
						type="number"
						min={POSITION_MIN_M}
						max={TABLE_HEIGHT_M}
						step={POSITION_STEP_M}
						value={ball.y.toFixed(2)}
						onChange={(e) =>
							updateBallCoordinate(id, ball, "y", Number(e.target.value))
						}
					/>
				</div>
			</div>
		);
	};

	const resetSpin = () => {
		onSideSpinChange(0);
		onTopSpinChange(0);
	};

	const spinMarkerX =
		50 +
		(clampValue(sideSpin, -MAX_SPIN_OFFSET_MM, MAX_SPIN_OFFSET_MM) /
			MAX_SPIN_OFFSET_MM) *
			50;
	const spinMarkerY =
		50 -
		(clampValue(topSpin, -MAX_SPIN_OFFSET_MM, MAX_SPIN_OFFSET_MM) /
			MAX_SPIN_OFFSET_MM) *
			50;

	return (
		<div
			ref={panelRef}
			className={styles.testPanel}
			style={{
				left: `${position.x}px`,
				top: `${position.y}px`,
				right: "auto",
				maxHeight: "80vh",
				overflowY: "auto",
			}}
			onMouseDown={handleStart}
			onTouchStart={handleStart}
		>
			<div className={styles.testPanelHeader}>
				<h3>{"\ubb3c\ub9ac \ud14c\uc2a4\ud2b8"}</h3>
				<button type="button" onClick={onClose}>
					x
				</button>
			</div>

			{ballControls.map(renderBallCoordinateControls)}

			<div className={styles.testGroup}>
				<label>{`\ud0c0\uaca9 \uac01\ub3c4: ${angleDeg}\u00b0`}</label>
				<div className={styles.sliderInputRow}>
					<input
						type="range"
						min={ANGLE_MIN}
						max={ANGLE_MAX}
						value={angleDeg}
						onChange={(e) => updateAngle(Number(e.target.value))}
					/>
					<input
						className={styles.compactNumberInput}
						type="number"
						min={ANGLE_MIN}
						max={ANGLE_MAX}
						step="1"
						value={angleDeg}
						onChange={(e) => updateAngle(Number(e.target.value))}
					/>
				</div>
			</div>

			<div className={styles.testGroup}>
				<label>{`\ud0c0\uaca9 \uac15\ub3c4: ${power.toFixed(1)}`}</label>
				<input
					type="range"
					min={POWER_MIN}
					max={POWER_MAX}
					step={POWER_STEP}
					value={power}
					onChange={(e) => updatePower(Number(e.target.value))}
				/>
				<input
					className={styles.numberInput}
					type="number"
					min={POWER_MIN}
					max={POWER_MAX}
					step={POWER_STEP}
					value={power.toFixed(1)}
					onChange={(e) => updatePower(Number(e.target.value))}
				/>
				<div className={styles.powerSliderMeta}>
					<span>{POWER_MIN}</span>
					<span>{POWER_MAX}</span>
				</div>
			</div>

			<div className={styles.testGroup}>
				<label>
					{`\uc608\uc0c1 \uc218\uad6c \uc774\ub3d9\uac70\ub9ac: ${cueTravelMeters.toFixed(2)}m`}
				</label>
				<label>
					{`\uae30\uc900 \uc774\ub3d9\uac70\ub9ac: ${baselineTravel.travelMeters.toFixed(2)}m`}
				</label>
			</div>

			<div className={styles.testGroup}>
				<label>
					{`\uc2e4\uce21 \ubaa9\ud45c \uac70\ub9ac: ${targetTravelMeters.toFixed(2)}m`}
				</label>
				<input
					className={styles.numberInput}
					type="number"
					min="0.01"
					max="20"
					step="0.01"
					value={targetTravelMeters.toFixed(2)}
					onChange={(e) => setTargetTravelMeters(Number(e.target.value))}
				/>
				<label>
					{`\uad8c\uc7a5 rollingFriction: ${calibration.rollingFriction.toFixed(4)}`}
				</label>
			</div>

			<div className={styles.testGroup}>
				<label>
					{`\uc2a4\ud540: \uc88c/\uc6b0 ${sideSpin}mm, \uc0c1/\ud558 ${topSpin}mm`}
				</label>
				<div className={styles.spinPadRow} data-no-panel-drag>
					<button
						type="button"
						className={styles.spinPad}
						onPointerDown={selectSpinPoint}
						aria-label="스핀 타격 지점 선택"
					>
						<span className={styles.spinGuideHorizontal} />
						<span className={styles.spinGuideVertical} />
						<span
							className={styles.spinMarker}
							style={{
								left: `${spinMarkerX}%`,
								top: `${spinMarkerY}%`,
							}}
						/>
					</button>
					<button
						type="button"
						className={styles.spinResetButton}
						onClick={resetSpin}
					>
						{"\uc911\uc559"}
					</button>
				</div>
				<div className={styles.spinInputGrid} data-no-panel-drag>
					<label>
						<span>{"\uc88c/\uc6b0 mm"}</span>
						<input
							className={styles.numberInput}
							type="number"
							min={-MAX_SPIN_OFFSET_MM}
							max={MAX_SPIN_OFFSET_MM}
							step="1"
							value={sideSpin}
							onChange={(e) => updateSideSpin(Number(e.target.value))}
						/>
					</label>
					<label>
						<span>{"\uc0c1/\ud558 mm"}</span>
						<input
							className={styles.numberInput}
							type="number"
							min={-MAX_SPIN_OFFSET_MM}
							max={MAX_SPIN_OFFSET_MM}
							step="1"
							value={topSpin}
							onChange={(e) => updateTopBottomSpin(Number(e.target.value))}
						/>
					</label>
				</div>
			</div>
		</div>
	);
};

export default TestPanel;
