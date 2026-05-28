import type { Vec2 } from "./core";

export type { Vec2 };

export type SimulationConfig = {
	table: {
		width: number;
		height: number;
	};
	ball: {
		count: number;
		radius: number;
	};
	physics: {
		timeStep: number;
	};
};

export type SimulationTuning = {
	impulseScale: number;
	rollingFriction: number;
	spinFriction: number;
	ballRestitution: number;
	cushionRestitution: number;
	cushionSpinTransfer: number;
	cushionFollowDrawTransfer: number;
	ballSpinTransfer: number;
	followDrawTransfer: number;
	followDrawMotionTransfer: number;
	cutThrowTransfer: number;
	maxSpinCorrectionSpeed: number;
	maxCushionSpinCorrectionRatio: number;
	maxCushionFollowDrawCorrectionRatio: number;
	cushionSpinRetention: number;
	ballSpinRetention: number;
	maxSpinRatio: number;
	sideSpinStrength: number;
	topSpinStrength: number;
	stopSpeed: number;
	spinStopSpeed: number;
};

export type BallState = {
	id: string;
	position: Vec2;
	velocity: Vec2;
	sideSpin: number;
	topSpin: number;
	collided: boolean;
};

export type CustomBallSnapshot = {
	readonly id: string;
	readonly position: Vec2;
	readonly velocity: Vec2;
	readonly sideSpin: number;
	readonly topSpin: number;
	readonly radius: number;
	readonly collided: boolean;
};

export type CustomTrajectory = {
	readonly target: CustomBallSnapshot;
	readonly others: CustomBallSnapshot[];
};

export type CushionSide = "top" | "bottom" | "left" | "right";

export type SimulationEvent = {
	type: "ball-collision" | "cushion-hit";
	step: number;
	position: Vec2;
	ballId: string;
	otherBallId?: string;
	cushionSide?: CushionSide;
};

export type BallAdvanceResult = {
	usedTime: number;
	collided: boolean;
};
