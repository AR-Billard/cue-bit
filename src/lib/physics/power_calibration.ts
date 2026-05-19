import { GRAVITY } from "./physics_constants";
import {
	DEFAULT_SIMULATION_2D_TUNING,
	type Simulation2DTuning,
} from "./simulation_2d";

export const POWER_LEVELS = [
	{ id: "low", label: "\ud558", value: 0.5 },
	{ id: "medium", label: "\uc911", value: 1.5 },
	{ id: "high", label: "\uc0c1", value: 3 },
] as const;

export type PowerLevel = (typeof POWER_LEVELS)[number];

export interface PowerTravelEstimate {
	level: PowerLevel;
	initialSpeed: number;
	travelMeters: number;
	stopTimeSeconds: number;
}

export interface PowerValueTravelEstimate {
	power: number;
	initialSpeed: number;
	travelMeters: number;
	stopTimeSeconds: number;
}

export interface PowerCalibrationInput {
	power: number;
	targetTravelMeters: number;
	impulseScale?: number;
}

export interface PowerCalibrationResult {
	impulseScale: number;
	rollingFriction: number;
	targetTravelMeters: number;
	initialSpeed: number;
	stopTimeSeconds: number;
}

export function estimatePowerTravel(
	level: PowerLevel,
	tuning: Partial<Simulation2DTuning> = {},
): PowerTravelEstimate {
	const estimate = estimatePowerValueTravel(level.value, tuning);

	return {
		level,
		initialSpeed: estimate.initialSpeed,
		travelMeters: estimate.travelMeters,
		stopTimeSeconds: estimate.stopTimeSeconds,
	};
}

export function estimatePowerValueTravel(
	power: number,
	tuning: Partial<Simulation2DTuning> = {},
): PowerValueTravelEstimate {
	const resolvedTuning = { ...DEFAULT_SIMULATION_2D_TUNING, ...tuning };
	const initialSpeed = power * resolvedTuning.impulseScale;
	const deceleration = resolvedTuning.rollingFriction * GRAVITY;
	const travelMeters =
		deceleration > 0 ? (initialSpeed * initialSpeed) / (2 * deceleration) : 0;
	const stopTimeSeconds = deceleration > 0 ? initialSpeed / deceleration : 0;

	return {
		power,
		initialSpeed,
		travelMeters,
		stopTimeSeconds,
	};
}

export function getPowerTravelEstimates(
	tuning: Partial<Simulation2DTuning> = {},
): PowerTravelEstimate[] {
	return POWER_LEVELS.map((level) => estimatePowerTravel(level, tuning));
}

export function calculateRollingFrictionForTravel({
	power,
	targetTravelMeters,
	impulseScale = DEFAULT_SIMULATION_2D_TUNING.impulseScale,
}: PowerCalibrationInput): number {
	if (power <= 0 || targetTravelMeters <= 0 || impulseScale <= 0) {
		return DEFAULT_SIMULATION_2D_TUNING.rollingFriction;
	}

	const initialSpeed = power * impulseScale;
	return (initialSpeed * initialSpeed) / (2 * GRAVITY * targetTravelMeters);
}

export function calibratePowerTravel({
	power,
	targetTravelMeters,
	impulseScale = DEFAULT_SIMULATION_2D_TUNING.impulseScale,
}: PowerCalibrationInput): PowerCalibrationResult {
	const rollingFriction = calculateRollingFrictionForTravel({
		power,
		targetTravelMeters,
		impulseScale,
	});
	const initialSpeed = power * impulseScale;
	const deceleration = rollingFriction * GRAVITY;

	return {
		impulseScale,
		rollingFriction,
		targetTravelMeters,
		initialSpeed,
		stopTimeSeconds: deceleration > 0 ? initialSpeed / deceleration : 0,
	};
}
