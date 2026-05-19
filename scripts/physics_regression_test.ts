import {
	Simulation2D,
	detectedStateToPredictShotInput,
	getFinalPositions,
	getPhysicsResult,
	predictDetectedState,
	predictFinalPositions,
	predictShot,
	toPredictShotInput,
} from "../src/lib/physics";
import { createCameraDetectedState } from "../src/lib/detection/camera_detected_state";
import { createMockCameraDetectionResult } from "../src/lib/detection/camera_detector";
import { createDevDetectedState } from "../src/lib/detection/dev_detected_state";
import { pixelToTableMeters } from "../src/lib/detection/table_coordinate";
import {
	BALL_RADIUS_M,
	TABLE_HEIGHT_M,
	TABLE_WIDTH_M,
} from "../src/lib/physics/physics_constants";
import type {
	BallPositions,
	PhysicsEvent,
	PhysicsResult,
	Point,
} from "../src/types/physics";

const EPSILON_M = 1e-6;

interface TestAssert {
	ok(value: unknown, message?: string): void;
	equal<T>(actual: T, expected: T, message?: string): void;
	deepEqual<T>(actual: T, expected: T, message?: string): void;
}

const assert: TestAssert = {
	ok(value: unknown, message = "Assertion failed"): void {
		if (!value) throw new Error(message);
	},
	equal<T>(actual: T, expected: T, message = "Values should be equal"): void {
		if (actual !== expected) {
			throw new Error(
				`${message}: expected ${String(expected)}, got ${String(actual)}`,
			);
		}
	},
	deepEqual<T>(
		actual: T,
		expected: T,
		message = "Values should be deeply equal",
	): void {
		if (JSON.stringify(actual) !== JSON.stringify(expected)) {
			throw new Error(
				`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
			);
		}
	},
};

function getTrajectory(result: PhysicsResult, ballId: string): Point[] {
	const trajectory = result.trajectories.find((item) => item.ballId === ballId);
	if (!trajectory) {
		throw new Error(`${ballId} trajectory should exist`);
	}
	return trajectory.waypoints;
}

function lastWaypoint(result: PhysicsResult, ballId: string): Point {
	const waypoints = getTrajectory(result, ballId);
	if (waypoints.length === 0) {
		throw new Error(`${ballId} should have waypoints`);
	}
	return waypoints.at(-1) as Point;
}

function firstEvent(
	result: PhysicsResult,
	type: PhysicsEvent["type"],
	ballId: string,
): PhysicsEvent | undefined {
	return getEvents(result).find(
		(event) => event.type === type && event.ballId === ballId,
	);
}

function getEvents(result: PhysicsResult): PhysicsEvent[] {
	return result.events ?? [];
}

function getSummary(
	result: PhysicsResult,
): NonNullable<PhysicsResult["summary"]> {
	if (!result.summary) {
		throw new Error("Physics result summary should exist");
	}
	return result.summary;
}

function assertAlmostEqual(
	actual: number,
	expected: number,
	tolerance: number,
	message: string,
): void {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`${message}: expected ${expected}, got ${actual}`,
	);
}

{
	const mapped = pixelToTableMeters({ x: 320, y: 180 }, [
		{ x: 0, y: 0 },
		{ x: 640, y: 0 },
		{ x: 640, y: 360 },
		{ x: 0, y: 360 },
	]);

	assert.ok(!!mapped, "pixelToTableMeters should map a valid table quad");
	assertAlmostEqual(
		mapped?.x ?? Number.NaN,
		TABLE_WIDTH_M / 2,
		EPSILON_M,
		"pixel x should convert to table meter x",
	);
	assertAlmostEqual(
		mapped?.y ?? Number.NaN,
		TABLE_HEIGHT_M / 2,
		EPSILON_M,
		"pixel y should convert to table meter y",
	);
}

{
	const sim = new Simulation2D();
	sim.updateBallPositionsMeters({
		cueBall: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
	});

	const result = sim.predict(0, 0.5, 120, 0, 0);
	const cueEnd = lastWaypoint(result, "cueBall");

	assertAlmostEqual(
		cueEnd.y,
		TABLE_HEIGHT_M / 2,
		EPSILON_M,
		"No-spin straight shot should not change y",
	);
	assert.equal(
		getEvents(result).length,
		0,
		"Short shot with no collision should not emit events",
	);
	assertAlmostEqual(
		getFinalPositions(result)["cueBall"]?.y ?? Number.NaN,
		TABLE_HEIGHT_M / 2,
		EPSILON_M,
		"finalPositions should include final cueBall y",
	);
}

{
	const sim = new Simulation2D();
	sim.updateBallPositionsMeters({
		cueBall: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
	});

	const result = sim.predict(0, 0, 1200, 100, 100);
	const cueEnd = lastWaypoint(result, "cueBall");

	assert.equal(
		getSummary(result).stepCount,
		1,
		"Stationary spin should be settled immediately",
	);
	assertAlmostEqual(
		cueEnd.x,
		0.6,
		EPSILON_M,
		"Zero-power spin input should not move the cue ball",
	);
	assertAlmostEqual(
		cueEnd.y,
		TABLE_HEIGHT_M / 2,
		EPSILON_M,
		"Zero-power spin input should not move the cue ball sideways",
	);
}

{
	const sim = new Simulation2D();
	sim.updateBallPositionsMeters({
		cueBall: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
	});

	const result = sim.predict(
		Number.NaN,
		Number.NaN,
		Number.NaN,
		Number.NaN,
		Number.NaN,
	);
	const cueEnd = lastWaypoint(result, "cueBall");

	assert.ok(
		getSummary(result).stopped,
		"Invalid prediction input should stop safely",
	);
	assertAlmostEqual(
		cueEnd.x,
		0.6,
		EPSILON_M,
		"Invalid prediction input should not create NaN x movement",
	);
	assertAlmostEqual(
		cueEnd.y,
		TABLE_HEIGHT_M / 2,
		EPSILON_M,
		"Invalid prediction input should not create NaN y movement",
	);
}

{
	const makeTravel = (topSpin: number): number => {
		const sim = new Simulation2D();
		sim.updateBallPositionsMeters({
			cueBall: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
		});
		const result = sim.predict(0, 0.8, 2400, 0, topSpin);
		return getSummary(result).travelDistanceByBall["cueBall"] ?? 0;
	};

	const drawTravel = makeTravel(-100);
	const noSpinTravel = makeTravel(0);
	const followTravel = makeTravel(100);

	assert.ok(
		drawTravel < noSpinTravel - 0.03,
		"Draw spin should shorten pre-collision travel",
	);
	assert.ok(
		followTravel > noSpinTravel + 0.03,
		"Follow spin should extend pre-collision travel",
	);
}

{
	const sim = new Simulation2D();
	sim.updateBallPositionsMeters({
		cueBall: { x: TABLE_WIDTH_M - 0.45, y: TABLE_HEIGHT_M / 2 },
	});

	const result = sim.predict(0, 1.4, 900, 0, 0);
	const cueEnd = lastWaypoint(result, "cueBall");
	const event = firstEvent(result, "cushion-hit", "cueBall");

	assert.equal(event?.cushionSide, "right");
	assertAlmostEqual(
		cueEnd.y,
		TABLE_HEIGHT_M / 2,
		EPSILON_M,
		"No-spin vertical cushion hit should preserve tangent y",
	);
}

{
	const sim = new Simulation2D();
	sim.updateBallPositionsMeters({
		cueBall: { x: TABLE_WIDTH_M / 2, y: TABLE_HEIGHT_M - 0.35 },
	});

	const result = sim.predict(90, 1.1, 900, 0, 0);
	const cueEnd = lastWaypoint(result, "cueBall");
	const event = firstEvent(result, "cushion-hit", "cueBall");

	assert.equal(event?.cushionSide, "bottom");
	assertAlmostEqual(
		cueEnd.x,
		TABLE_WIDTH_M / 2,
		EPSILON_M,
		"No-spin horizontal cushion hit should preserve tangent x",
	);
}

{
	const sim = new Simulation2D();
	sim.updateBallPositionsMeters({
		cueBall: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
		red: { x: 1.15, y: TABLE_HEIGHT_M / 2 },
	});

	const result = sim.predict(0, 1.0, 900, 0, 0);
	const firstHit = firstEvent(result, "ball-collision", "cueBall");
	const redEnd = lastWaypoint(result, "red");

	assert.equal(firstHit?.otherBallId, "red");
	assert.ok(
		redEnd.x > 1.15 + BALL_RADIUS_M,
		"Object ball should move forward after head-on collision",
	);
	assertAlmostEqual(
		redEnd.y,
		TABLE_HEIGHT_M / 2,
		1e-5,
		"No-spin head-on collision should not move object ball sideways",
	);
}

{
	const makeResult = (topSpin: number): PhysicsResult => {
		const sim = new Simulation2D();
		sim.updateBallPositionsMeters({
			cueBall: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
			red: { x: 1.15, y: TABLE_HEIGHT_M / 2 },
		});
		return sim.predict(0, 1.2, 1200, 0, topSpin);
	};

	const noSpinCueEnd = lastWaypoint(makeResult(0), "cueBall");
	const drawCueEnd = lastWaypoint(makeResult(-100), "cueBall");

	assert.ok(
		drawCueEnd.x < noSpinCueEnd.x - 0.05,
		"Draw spin should pull cue ball backward after a head-on collision",
	);
}

{
	const makeCueEnd = (maxSpinCorrectionSpeed: number): Point => {
		const tuning = {
			followDrawTransfer: 0.28,
			maxSpinCorrectionSpeed,
		};
		const sim = new Simulation2D(tuning);
		sim.updateBallPositionsMeters({
			cueBall: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
			red: { x: 1.15, y: TABLE_HEIGHT_M / 2 },
		});
		return lastWaypoint(sim.predict(0, 1.5, 1200, 0, -120), "cueBall");
	};

	const limitedDrawEnd = makeCueEnd(0.05);
	const normalDrawEnd = makeCueEnd(0.45);

	assert.ok(
		normalDrawEnd.x < limitedDrawEnd.x - 0.02,
		"maxSpinCorrectionSpeed should limit excessive draw correction",
	);
}

{
	const makeRedEnd = (cutThrowTransfer: number): Point => {
		const tuning = {
			ballRestitution: 0.95,
			cutThrowTransfer,
		};
		const sim = new Simulation2D(tuning);
		sim.updateBallPositionsMeters({
			cueBall: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
			red: { x: 1.15, y: TABLE_HEIGHT_M / 2 + BALL_RADIUS_M },
		});
		return lastWaypoint(sim.predict(0, 1.0, 900, 0, 0), "red");
	};

	const noThrowRedEnd = makeRedEnd(0);
	const throwRedEnd = makeRedEnd(0.035);

	assert.ok(
		Math.abs(throwRedEnd.y - noThrowRedEnd.y) > 0.001,
		"Cut throw should slightly change object ball angle on cut shots",
	);
}

{
	const makeResult = (offsetSide: number): PhysicsResult => {
		const sim = new Simulation2D();
		sim.updateBallPositionsMeters({
			cueBall: { x: TABLE_WIDTH_M - 0.5, y: TABLE_HEIGHT_M / 2 },
		});
		return sim.predict(0, 1.5, 900, offsetSide, 0);
	};

	const leftSpinEnd = lastWaypoint(makeResult(-60), "cueBall");
	const rightSpinEnd = lastWaypoint(makeResult(60), "cueBall");

	assert.ok(
		Math.abs(leftSpinEnd.y - rightSpinEnd.y) > 0.02,
		"Left/right spin should create distinguishable y deflection after cushion",
	);
}

{
	const result = predictShot({
		balls: {
			cueBall: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
			red: { x: 1.15, y: TABLE_HEIGHT_M / 2 },
		},
		angleDeg: 0,
		power: 1,
		maxSteps: 900,
	});

	assert.equal(
		getSummary(result).firstHitBallId,
		"red",
		"predictShot should accept one-shot physics input",
	);
}

{
	const result = getPhysicsResult({
		balls: {
			cueBall: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
			red: { x: 1.15, y: TABLE_HEIGHT_M / 2 },
		},
		angleDeg: 0,
		power: 1,
		maxSteps: 900,
	});

	assert.equal(
		getSummary(result).firstHitBallId,
		"red",
		"getPhysicsResult should accept direct physics input",
	);
	assert.deepEqual(
		result.balls["cueBall"]?.start,
		{ x: 0.6, y: TABLE_HEIGHT_M / 2 },
		"getPhysicsResult should expose cueBall start position",
	);
	assert.ok(
		(result.balls["red"]?.end.x ?? Number.NEGATIVE_INFINITY) > 1.15,
		"getPhysicsResult should expose object ball final position",
	);
	assert.equal(
		result.collisions[0]?.type,
		"ball-collision",
		"getPhysicsResult should expose collision records",
	);
	assert.equal(
		result.collisions[0]?.ballId,
		"cueBall",
		"collision records should use cueBall id",
	);
}

{
	const finalPositions = predictFinalPositions({
		balls: {
			cueBall: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
			red: { x: 1.15, y: TABLE_HEIGHT_M / 2 },
		},
		angleDeg: 0,
		power: 1,
		maxSteps: 900,
	});

	assert.ok(
		(finalPositions.red?.x ?? Number.NEGATIVE_INFINITY) > 1.15,
		"predictFinalPositions should expose final ball positions directly",
	);
}

{
	const balls: BallPositions = {
		cueBall: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
		red: { x: 1.15, y: TABLE_HEIGHT_M / 2 },
		yellow: { x: 1.7, y: TABLE_HEIGHT_M / 2 },
	};
	const detected = createDevDetectedState({
		balls,
		angleDeg: 35,
		power: 1.2,
		sideSpin: 50,
		topSpin: -25,
		cueBallId: "cueBall",
	});

	assert.equal(detected.cue.angleDeg, 35);
	assert.equal(detected.cue.power, 1.2);
	assert.deepEqual(detected.cue.hitPoint, { x: 0.5, y: -0.25 });
	assert.equal(detected.shot.cueBallId, "cueBall");
	assert.deepEqual(detected.balls, [
		{ id: "cueBall", x: 0.6, y: TABLE_HEIGHT_M / 2 },
		{ id: "red", x: 1.15, y: TABLE_HEIGHT_M / 2 },
		{ id: "yellow", x: 1.7, y: TABLE_HEIGHT_M / 2 },
	]);
}

{
	const detected = createCameraDetectedState(
		{
			table: {
				corners: [
					{ x: 0, y: 0 },
					{ x: 640, y: 0 },
					{ x: 640, y: 360 },
					{ x: 0, y: 360 },
				],
			},
			cue: {
				angleDeg: 90,
			},
			balls: [
				{ id: "white", tableX: 0.6, tableY: TABLE_HEIGHT_M / 2 },
				{ id: "red", tableX: 1.15, tableY: TABLE_HEIGHT_M / 2 },
			],
		},
		{
			power: 1.4,
			sideSpin: 0.25,
			topSpin: -0.5,
		},
	);
	const input = toPredictShotInput(detected);

	assert.equal(
		detected.cue.angleDeg,
		90,
		"camera state should use camera cue angle",
	);
	assert.equal(detected.cue.power, 1.4, "camera state should use UI power");
	assert.deepEqual(
		detected.cue.hitPoint,
		{ x: 0.25, y: -0.5 },
		"camera state should use UI hit point",
	);
	assert.equal(
		detected.shot.cueBallId,
		"white",
		"camera state should default cue ball id to white",
	);
	assert.deepEqual(
		detected.balls[0],
		{ id: "white", x: 0.6, y: TABLE_HEIGHT_M / 2 },
		"camera balls should be meter-space DetectedState balls",
	);
	assert.deepEqual(
		input.balls["cueBall"],
		{ x: 0.6, y: TABLE_HEIGHT_M / 2 },
		"camera cue ball should enter the common physics adapter",
	);
}

{
	const mockDetected = createCameraDetectedState(
		createMockCameraDetectionResult({ width: 1280, height: 720 }),
		{
			power: 1,
			sideSpin: 0,
			topSpin: 0,
		},
	);
	const result = predictDetectedState(mockDetected);

	assert.equal(mockDetected.shot.cueBallId, "white");
	assert.ok(
		mockDetected.balls.every(
			(ball) =>
				ball.x >= 0 &&
				ball.x <= TABLE_WIDTH_M &&
				ball.y >= 0 &&
				ball.y <= TABLE_HEIGHT_M,
		),
		"mock camera balls should already be table meter coordinates",
	);
	assert.ok(
		!!getSummary(result).finalPositions.cueBall,
		"mock camera state should run through the shared physics engine",
	);
}

{
	const input = detectedStateToPredictShotInput({
		cue: {
			angleDeg: 0,
			power: 1,
			hitPoint: { x: 0.5, y: -0.25 },
		},
		shot: {
			cueBallId: "white",
		},
		balls: [
			{ id: "white", x: 0.6, y: TABLE_HEIGHT_M / 2 },
			{ id: "red", x: 1.15, y: TABLE_HEIGHT_M / 2 },
		],
	});

	assert.deepEqual(input.balls["cueBall"], { x: 0.6, y: TABLE_HEIGHT_M / 2 });
	assert.equal(input.balls["white"], undefined);
	assert.equal(input.sideSpin, 50);
	assert.equal(input.topSpin, -25);
}

{
	const input = toPredictShotInput({
		cue: {
			angleDeg: 15,
			power: 1,
			hitPoint: { x: 0, y: 0 },
		},
		shot: {
			cueBallId: "white",
		},
		balls: [
			{ id: "white", x: 0.6, y: TABLE_HEIGHT_M / 2 },
			{ id: "cueBall", x: 1.0, y: TABLE_HEIGHT_M / 2 },
			{ id: "red", x: 1.4, y: TABLE_HEIGHT_M / 2 },
		],
	});

	assert.deepEqual(
		input.balls["cueBall"],
		{ x: 0.6, y: TABLE_HEIGHT_M / 2 },
		"cueBallId should map the active cue ball to internal cueBall id",
	);
	assert.equal(input.balls["white"], undefined);
	assert.deepEqual(
		input.balls["detected:cueBall"],
		{ x: 1.0, y: TABLE_HEIGHT_M / 2 },
		"non-cue detected ball with cueBall id should avoid internal cueBall collision",
	);
	assert.deepEqual(input.balls["red"], { x: 1.4, y: TABLE_HEIGHT_M / 2 });
}

{
	const missingCueBallState = {
		cue: {
			angleDeg: 0,
			power: 1,
			hitPoint: { x: 0, y: 0 },
		},
		shot: {
			cueBallId: "white",
		},
		balls: [
			{ id: "red", x: 1.15, y: TABLE_HEIGHT_M / 2 },
			{ id: "yellow", x: 1.7, y: TABLE_HEIGHT_M / 2 },
		],
	};
	const input = toPredictShotInput(missingCueBallState);
	const result = predictDetectedState(missingCueBallState);

	assert.equal(
		input.balls["cueBall"],
		undefined,
		"missing cueBallId should not synthesize an internal cue ball",
	);
	assert.deepEqual(input.balls["red"], { x: 1.15, y: TABLE_HEIGHT_M / 2 });
	assert.equal(
		getSummary(result).stepCount,
		0,
		"missing internal cue ball should return a safe empty result",
	);
	assert.deepEqual(
		getSummary(result).finalPositions,
		{},
		"missing internal cue ball should not report final positions",
	);
}

{
	const input = toPredictShotInput({
		cue: {
			angleDeg: 0,
			power: Number.POSITIVE_INFINITY,
			hitPoint: { x: 2, y: -2 },
		},
		shot: {
			cueBallId: "white",
		},
		balls: [
			{ id: "white", x: -1, y: TABLE_HEIGHT_M + 1 },
			{ id: "red", x: Number.NaN, y: 0.5 },
			{ id: "yellow", x: 0.5, y: Number.POSITIVE_INFINITY },
			{ id: "blue", x: TABLE_WIDTH_M + 1, y: -1 },
		],
	});

	assert.equal(input.power, 0);
	assert.equal(input.sideSpin, 100);
	assert.equal(input.topSpin, -100);
	assert.deepEqual(input.balls["cueBall"], { x: 0, y: TABLE_HEIGHT_M });
	assert.equal(input.balls["red"], undefined);
	assert.equal(input.balls["yellow"], undefined);
	assert.deepEqual(input.balls["blue"], { x: TABLE_WIDTH_M, y: 0 });
}

{
	const negativePowerInput = toPredictShotInput({
		cue: {
			angleDeg: 0,
			power: -1,
			hitPoint: { x: 0, y: 0 },
		},
		shot: {
			cueBallId: "white",
		},
		balls: [{ id: "white", x: 0.6, y: TABLE_HEIGHT_M / 2 }],
	});
	const highPowerInput = toPredictShotInput({
		cue: {
			angleDeg: 0,
			power: 4,
			hitPoint: { x: 0, y: 0 },
		},
		shot: {
			cueBallId: "white",
		},
		balls: [{ id: "white", x: 0.6, y: TABLE_HEIGHT_M / 2 }],
	});

	assert.equal(negativePowerInput.power, 0);
	assert.equal(highPowerInput.power, 3);
}

{
	const result = getPhysicsResult({
		cue: {
			angleDeg: 0,
			power: 1,
			hitPoint: { x: 0, y: 0 },
		},
		shot: {
			cueBallId: "white",
		},
		balls: [
			{ id: "white", x: 0.6, y: TABLE_HEIGHT_M / 2 },
			{ id: "red", x: 1.15, y: TABLE_HEIGHT_M / 2 },
		],
	});

	assert.equal(
		getSummary(result).firstHitBallId,
		"red",
		"getPhysicsResult should accept DetectedState input",
	);
}

{
	const result = predictDetectedState({
		cue: {
			angleDeg: 0,
			power: 1,
			hitPoint: { x: 0, y: 0 },
		},
		shot: {
			cueBallId: "white",
		},
		balls: [
			{ id: "white", x: 0.6, y: TABLE_HEIGHT_M / 2 },
			{ id: "red", x: 1.15, y: TABLE_HEIGHT_M / 2 },
		],
	});

	assert.equal(
		getSummary(result).firstHitBallId,
		"red",
		"predictDetectedState should run DetectedState through the public prediction path",
	);
	assert.ok(
		!!getSummary(result).finalPositions.cueBall,
		"predictDetectedState should return final cueBall position",
	);
}

{
	const input = detectedStateToPredictShotInput(
		{
			cue: {
				angleDeg: -10,
				power: Number.NaN,
				hitPoint: { x: Number.NaN, y: Number.NaN },
			},
			shot: {
				cueBallId: "white",
			},
			balls: [{ id: "white", x: 0.6, y: TABLE_HEIGHT_M / 2 }],
		},
		Number.NaN,
	);

	assert.equal(input.angleDeg, 350);
	assert.equal(input.power, 0);
	assert.equal(input.sideSpin, 0);
	assert.equal(input.topSpin, 0);
	assert.equal(input.maxSteps, 2400);

	const fractionalStepInput = detectedStateToPredictShotInput(
		{
			cue: {
				angleDeg: 0,
				power: 1,
				hitPoint: { x: 0, y: 0 },
			},
			shot: {
				cueBallId: "white",
			},
			balls: [{ id: "white", x: 0.6, y: TABLE_HEIGHT_M / 2 }],
		},
		0.5,
	);

	assert.equal(fractionalStepInput.maxSteps, 1);
}

console.log("physics regression tests passed");
