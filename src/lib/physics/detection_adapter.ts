import type { DetectedState } from "@/types/detection";
import type {
	BallPositions,
	MeterPoint,
	PredictShotInput,
} from "@/types/physics";
import { TABLE_HEIGHT_M, TABLE_WIDTH_M } from "./physics_constants";

const INTERNAL_CUE_BALL_ID = "cueBall";
const COLLIDING_EXTERNAL_CUE_BALL_ID = "detected:cueBall";

// Detected hitPoint is normalized to -1..1. The current physics engine expects
// tip offset values in its legacy mm-like spin input scale.
const HIT_POINT_TO_SPIN_MM = 100;
const MIN_POWER = 0;
const MAX_POWER = 3;
const MIN_HIT_POINT = -1;
const MAX_HIT_POINT = 1;
const DEFAULT_MAX_STEPS = 2400;

function clamp(
	value: number,
	min: number,
	max: number,
	fallback = min,
): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.max(min, Math.min(max, value));
}

function normalizeAngleDeg(angleDeg: number): number {
	if (!Number.isFinite(angleDeg)) return 0;
	return ((angleDeg % 360) + 360) % 360;
}

function normalizePower(power: number): number {
	return clamp(power, MIN_POWER, MAX_POWER, 0);
}

function normalizeHitPointOffset(offset: number): number {
	return clamp(offset, MIN_HIT_POINT, MAX_HIT_POINT, 0);
}

function normalizeMaxSteps(maxSteps: number): number {
	if (!Number.isFinite(maxSteps) || maxSteps <= 0) return DEFAULT_MAX_STEPS;
	return Math.max(1, Math.floor(maxSteps));
}

function isFinitePoint(point: MeterPoint): boolean {
	return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function clampToTable(point: MeterPoint): MeterPoint {
	return {
		x: clamp(point.x, 0, TABLE_WIDTH_M, 0),
		y: clamp(point.y, 0, TABLE_HEIGHT_M, 0),
	};
}

function toInternalBallId(externalBallId: string, cueBallId: string): string {
	if (externalBallId === cueBallId) return INTERNAL_CUE_BALL_ID;

	// The physics engine reserves "cueBall" for the active cue ball. If another
	// detected object ball uses that id, keep it in the record without letting it
	// overwrite the real internal cue ball.
	if (externalBallId === INTERNAL_CUE_BALL_ID) {
		return COLLIDING_EXTERNAL_CUE_BALL_ID;
	}

	return externalBallId;
}

function detectedBallsToBallPositions(detected: DetectedState): BallPositions {
	const balls: BallPositions = {};

	for (const ball of detected.balls) {
		const point = { x: ball.x, y: ball.y };
		if (!isFinitePoint(point)) continue;

		const ballId = toInternalBallId(ball.id, detected.shot.cueBallId);
		balls[ballId] = clampToTable(point);
	}

	// If shot.cueBallId is missing from detected.balls, no internal "cueBall" ball
	// is created. Keep that non-throwing behavior for DEV/compatibility paths; the
	// simulation will return an empty result when it cannot find the cue ball.
	// Production detector integration should treat this as a detection miss and
	// skip prediction or log a warning before calling the physics API.
	return balls;
}

export function toPredictShotInput(
	detected: DetectedState,
	maxSteps = DEFAULT_MAX_STEPS,
): PredictShotInput {
	return {
		balls: detectedBallsToBallPositions(detected),
		angleDeg: normalizeAngleDeg(detected.cue.angleDeg),
		power: normalizePower(detected.cue.power),
		sideSpin:
			normalizeHitPointOffset(detected.cue.hitPoint.x) * HIT_POINT_TO_SPIN_MM,
		topSpin:
			normalizeHitPointOffset(detected.cue.hitPoint.y) * HIT_POINT_TO_SPIN_MM,
		maxSteps: normalizeMaxSteps(maxSteps),
	};
}

export function detectedStateToPredictShotInput(
	detected: DetectedState,
	maxSteps = DEFAULT_MAX_STEPS,
): PredictShotInput {
	return toPredictShotInput(detected, maxSteps);
}
