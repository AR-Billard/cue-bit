// Project-wide billiards table coordinates use meter units.
// Origin is the table's top-left corner. x grows right, y grows down.
// Standard table size is 2.84m x 1.42m.
export interface Point {
	x: number;
	y: number;
}

export type MeterPoint = Point;

export type BallPositions = Record<string, MeterPoint>;

/**
 * @deprecated Use BallPositions for integration code. This fixed 3-ball shape is
 * only kept as a legacy helper while older callers are migrated.
 */
export type LegacyRequiredBallPositions = BallPositions & {
	cueBall: MeterPoint;
	red: MeterPoint;
	yellow: MeterPoint;
};

/**
 * @deprecated Use LegacyRequiredBallPositions only for older 3-ball-only code,
 * and prefer BallPositions for new multi-ball integrations.
 */
export type RequiredBallPositions = LegacyRequiredBallPositions;

export type {
	DetectedBall,
	DetectedCue,
	DetectedHitPoint,
	DetectedShot,
	DetectedState,
} from "./detection";

export interface BallTrajectory {
	ballId: string;
	waypoints: MeterPoint[];
}

export type PhysicsEventType = "ball-collision" | "cushion-hit";

export type CushionSide = "top" | "bottom" | "left" | "right";

export interface PhysicsEvent {
	type: PhysicsEventType;
	step: number;
	position: MeterPoint;
	ballId: string;
	otherBallId?: string;
	cushionSide?: CushionSide;
}

export type FinalBallPositions = Record<string, MeterPoint>;

export interface PhysicsBallResult {
	start: MeterPoint;
	end: MeterPoint;
}

export type PhysicsBallResults = Record<string, PhysicsBallResult>;

export type PhysicsCollision = Omit<PhysicsEvent, "step"> & {
	step?: number;
};

export interface PhysicsSummary {
	stepCount: number;
	stopped: boolean;
	firstHitBallId?: string;
	firstCushionSide?: CushionSide;
	travelDistanceByBall: Record<string, number>;
	trajectoryDistanceByBall?: Record<string, number>;
	finalPositions: FinalBallPositions;
}

export interface PhysicsResult {
	/** Public, human-readable ball result: start and final position by ball id. */
	balls: PhysicsBallResults;
	/** Public collision/cushion records. Use position for the event point. */
	collisions: PhysicsCollision[];
	/** Detailed trajectory points kept for getImage() and advanced rendering. */
	trajectories: BallTrajectory[];
	/** Detailed event records kept for debugging and compatibility. */
	events: PhysicsEvent[];
	summary: PhysicsSummary;
}

export interface PredictShotInput {
	balls: BallPositions;
	/** Shot angle in degrees. 0=right, 90=down, 180=left, 270=up. */
	angleDeg: number;
	power: number;
	maxSteps?: number;
	sideSpin?: number;
	topSpin?: number;
}
