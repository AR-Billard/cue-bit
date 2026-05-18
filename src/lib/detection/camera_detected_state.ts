import type { DetectedState } from "@/types/detection";
import type { CameraDetectionResult } from "./camera_detector";

export interface CameraDetectedStateUiInput {
	power: number;
	/** Normalized left/right hit point, -1 to 1. */
	sideSpin: number;
	/** Normalized top/bottom hit point, -1 to 1. */
	topSpin: number;
	cueBallId?: string;
}

const DEFAULT_CAMERA_CUE_BALL_ID = "white";
const MIN_HIT_POINT = -1;
const MAX_HIT_POINT = 1;

function clampHitPoint(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(MIN_HIT_POINT, Math.min(MAX_HIT_POINT, value));
}

export function createCameraDetectedState(
	camera: CameraDetectionResult,
	ui: CameraDetectedStateUiInput,
): DetectedState {
	// CAM mode value sources:
	// - angleDeg comes from camera/mock cue detection.
	// - power comes from the UI control.
	// - hitPoint comes from the UI spin controls.
	// - balls come from camera/mock detection in table meter coordinates.
	return {
		cue: {
			angleDeg: camera.cue.angleDeg,
			power: ui.power,
			hitPoint: {
				x: clampHitPoint(ui.sideSpin),
				y: clampHitPoint(ui.topSpin),
			},
		},
		shot: {
			cueBallId: ui.cueBallId ?? DEFAULT_CAMERA_CUE_BALL_ID,
		},
		balls: camera.balls
			.filter(
				(ball) => Number.isFinite(ball.tableX) && Number.isFinite(ball.tableY),
			)
			.map((ball) => ({
				id: ball.id,
				x: ball.tableX,
				y: ball.tableY,
			})),
	};
}
