import type { DetectedState } from "@/types/detection";
import type { PhysicsResult } from "@/types/physics";

import { toPredictShotInput } from "./detection_adapter";
import type { FinalBallPositions, PredictShotInput } from "./public_types";
import { Simulation2D, type Simulation2DTuning } from "./simulation_2d";

export {
	detectedStateToPredictShotInput,
	toPredictShotInput,
} from "./detection_adapter";
export {
	calculateRollingFrictionForTravel,
	calibratePowerTravel,
	estimatePowerTravel,
	estimatePowerValueTravel,
	getPowerTravelEstimates,
	POWER_LEVELS,
	type PowerCalibrationInput,
	type PowerCalibrationResult,
	type PowerLevel,
	type PowerTravelEstimate,
	type PowerValueTravelEstimate,
} from "./power_calibration";
export type {
	FinalBallPositions,
	PhysicsBallResult,
	PhysicsBallResults,
	PhysicsCollision,
	PredictShotInput,
} from "./public_types";
export {
	drawPhysicsResultImage,
	getImage,
	type PhysicsResultImageOptions,
} from "./result_image";
export {
	DEFAULT_SIMULATION_2D_TUNING,
	SIMULATION_2D_TUNING_VERSION,
} from "./simulation_2d";
export { Simulation2D, type Simulation2DTuning };

export type PhysicsResultInput = PredictShotInput | DetectedState;

export interface GetPhysicsResultOptions {
	tuning?: Partial<Simulation2DTuning>;
	maxSteps?: number;
}

function isDetectedState(input: PhysicsResultInput): input is DetectedState {
	return Array.isArray(input.balls);
}

export function getPhysicsResult(
	input: PhysicsResultInput,
	options: GetPhysicsResultOptions = {},
): PhysicsResult {
	if (isDetectedState(input)) {
		return predictDetectedState(input, options);
	}

	return predictShot(
		{
			...input,
			maxSteps: options.maxSteps ?? input.maxSteps,
		},
		options.tuning,
	);
}

export function predictDetectedState(
	detected: DetectedState,
	options: GetPhysicsResultOptions = {},
): PhysicsResult {
	return predictShot(
		toPredictShotInput(detected, options.maxSteps),
		options.tuning,
	);
}

export function predictShot(
	input: PredictShotInput,
	tuning: Partial<Simulation2DTuning> = {},
): PhysicsResult {
	const simulation = new Simulation2D(tuning);
	simulation.updateBallPositionsMeters(input.balls);
	return simulation.predict(
		input.angleDeg,
		input.power,
		input.maxSteps,
		input.sideSpin ?? 0,
		input.topSpin ?? 0,
	);
}

export function predictFinalPositions(
	input: PredictShotInput,
	tuning: Partial<Simulation2DTuning> = {},
): FinalBallPositions {
	return getFinalPositions(predictShot(input, tuning));
}

export function getFinalPositions(result: PhysicsResult): FinalBallPositions {
	const summary = result.summary as
		| { finalPositions?: FinalBallPositions }
		| undefined;
	return summary?.finalPositions ?? {};
}
