import {
	GRAVITY,
	clamp,
	distance,
	dot,
	length,
	normalize,
	scale,
	sub,
	type Vec2,
} from "./core";

type SimulationConfig = {
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

type SimulationTuning = {
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

type BallState = {
	id: string;
	position: Vec2;
	velocity: Vec2;
	sideSpin: number;
	topSpin: number;
	collided: boolean;
};

type BallSnapshot = {
	readonly id: string;
	readonly position: Vec2;
	readonly velocity: Vec2;
	readonly sideSpin: number;
	readonly topSpin: number;
	readonly radius: number;
	readonly collided: boolean;
};

type Trajectory = {
	readonly target: BallSnapshot;
	readonly others: BallSnapshot[];
};

type CushionSide = "top" | "bottom" | "left" | "right";

type SimulationEvent = {
	type: "ball-collision" | "cushion-hit";
	step: number;
	position: Vec2;
	ballId: string;
	otherBallId?: string;
	cushionSide?: CushionSide;
};

type BallAdvanceResult = {
	usedTime: number;
	collided: boolean;
};

const DEFAULT_TUNING: SimulationTuning = {
	impulseScale: 1.2,
	rollingFriction: 0.05,
	spinFriction: 0.001,
	ballRestitution: 0.8,
	cushionRestitution: 0.8,
	cushionSpinTransfer: 0.85,
	cushionFollowDrawTransfer: 0.03,
	ballSpinTransfer: 0.01,
	followDrawTransfer: 0.4,
	followDrawMotionTransfer: 0.04,
	cutThrowTransfer: 0.035,
	maxSpinCorrectionSpeed: 0.45,
	maxCushionSpinCorrectionRatio: 1,
	maxCushionFollowDrawCorrectionRatio: 0.06,
	cushionSpinRetention: 0.72,
	ballSpinRetention: 0.9,
	maxSpinRatio: 1,
	sideSpinStrength: 2.5,
	topSpinStrength: 1.5,
	stopSpeed: 0.005,
	spinStopSpeed: 0.01,
};

const INTERNAL_CUE_BALL_ID = "cueBall";
const MIN_POWER = 0;
const MAX_POWER = 3;
const MAX_COLLISIONS_PER_STEP = 4;

class CustomPhysicsSimulator {
	private config: SimulationConfig;
	private tuning: SimulationTuning;
	private activeContacts = new Set<string>();

	public constructor(config: SimulationConfig) {
		this.config = config;
		this.tuning = DEFAULT_TUNING;
	}

	public simulate(
		targetBallPosition: Vec2,
		otherBallPositions: Vec2[],
		angle: number,
		power: number,
		hitPoint: Vec2,
	): [Trajectory, () => Trajectory] {
		if (otherBallPositions.length > this.config.ball.count - 1) {
			throw new Error("Too many balls");
		}

		const shotDir = normalize({
			x: Math.cos(Number.isFinite(angle) ? angle : 0),
			y: Math.sin(Number.isFinite(angle) ? angle : 0),
		});
		const safePower = clamp(
			Number.isFinite(power) ? power : 0,
			MIN_POWER,
			MAX_POWER,
		);

		const balls = [
			this.createBall(
				INTERNAL_CUE_BALL_ID,
				targetBallPosition,
				scale(shotDir, safePower * this.tuning.impulseScale),
				this.normalizeHitPoint(hitPoint.x) * this.tuning.sideSpinStrength,
				this.normalizeHitPoint(hitPoint.y) * this.tuning.topSpinStrength,
			),
			...otherBallPositions.map((position, index) =>
				this.createBall(`ball${index + 1}`, position),
			),
		];
		let stepCount = 0;
		this.activeContacts.clear();

		return [
			this.createTrajectory(balls),
			() => {
				stepCount += 1;
				const events = this.stepSimulation(balls, shotDir, stepCount);
				this.applyCollisionFlags(balls, events);
				return this.createTrajectory(balls);
			},
		];
	}

	private createBall(
		id: string,
		position: Vec2,
		velocity: Vec2 = { x: 0, y: 0 },
		sideSpin = 0,
		topSpin = 0,
	): BallState {
		return {
			id,
			position: this.clampToTable(position),
			velocity,
			sideSpin,
			topSpin,
			collided: false,
		};
	}

	private stepSimulation(
		balls: BallState[],
		shotDir: Vec2,
		step: number,
	): SimulationEvent[] {
		const events: SimulationEvent[] = [];
		const lastPositions = new Map(
			balls.map((ball) => [ball.id, { ...ball.position }]),
		);

		for (const ball of balls) {
			ball.collided = false;
		}

		this.releaseInactiveContacts(balls);

		for (const ball of balls) {
			this.advanceBall(ball, this.config.physics.timeStep, step, events);
		}

		this.resolveBallCollisions(balls, step, events, shotDir, lastPositions);
		this.settleStoppedBalls(balls);

		return events;
	}

	private advanceBall(
		ball: BallState,
		duration: number,
		step: number,
		events: SimulationEvent[],
	): void {
		let remainingTime = duration;
		let collisionCount = 0;

		while (
			remainingTime > 1e-6 &&
			collisionCount <= MAX_COLLISIONS_PER_STEP
		) {
			const result = this.advanceBallSegment(
				ball,
				remainingTime,
				step,
				events,
			);
			this.decaySpin(ball, result.usedTime);
			remainingTime -= result.usedTime;

			if (!result.collided || !this.isBallMoving(ball)) {
				break;
			}

			collisionCount++;
		}

		if (remainingTime > 1e-6) {
			this.decaySpin(ball, remainingTime);
		}
	}

	private advanceBallSegment(
		ball: BallState,
		timeLeft: number,
		step: number,
		events: SimulationEvent[],
	): BallAdvanceResult {
		const speed = length(ball.velocity);
		if (speed <= 0) return { usedTime: timeLeft, collided: false };

		const direction = scale(ball.velocity, 1 / speed);
		const deceleration = this.rollingDecelerationFor(ball);
		const maxTravel = this.travelDistance(speed, deceleration, timeLeft);
		const impact = this.findNextCushionImpact(ball, direction, maxTravel);

		if (!impact) {
			ball.position = {
				x: ball.position.x + direction.x * maxTravel,
				y: ball.position.y + direction.y * maxTravel,
			};
			const nextSpeed = this.speedAfter(speed, deceleration, timeLeft);
			ball.velocity =
				nextSpeed > 0 ? scale(direction, nextSpeed) : { x: 0, y: 0 };
			return { usedTime: timeLeft, collided: false };
		}

		const impactTime = this.timeForTravel(speed, deceleration, impact.travel);
		ball.position = {
			x: ball.position.x + direction.x * impact.travel,
			y: ball.position.y + direction.y * impact.travel,
		};
		ball.velocity = scale(
			direction,
			this.speedAfter(speed, deceleration, impactTime),
		);
		this.reflectCushion(ball, impact.side, step, events);

		return {
			usedTime: Math.max(0, Math.min(timeLeft, impactTime)),
			collided: true,
		};
	}

	private findNextCushionImpact(
		ball: BallState,
		direction: Vec2,
		maxTravel: number,
	): { side: CushionSide; travel: number } | null {
		const minX = this.config.ball.radius;
		const maxX = this.config.table.width - this.config.ball.radius;
		const minY = this.config.ball.radius;
		const maxY = this.config.table.height - this.config.ball.radius;
		let closest: { side: CushionSide; travel: number } | null = null;

		if (direction.x < -1e-8) {
			closest = this.pickCloserImpact(closest, {
				side: "left",
				travel: (minX - ball.position.x) / direction.x,
			});
		} else if (direction.x > 1e-8) {
			closest = this.pickCloserImpact(closest, {
				side: "right",
				travel: (maxX - ball.position.x) / direction.x,
			});
		}

		if (direction.y < -1e-8) {
			closest = this.pickCloserImpact(closest, {
				side: "top",
				travel: (minY - ball.position.y) / direction.y,
			});
		} else if (direction.y > 1e-8) {
			closest = this.pickCloserImpact(closest, {
				side: "bottom",
				travel: (maxY - ball.position.y) / direction.y,
			});
		}

		if (!closest || closest.travel < 0 || closest.travel > maxTravel) {
			return null;
		}

		return closest;
	}

	private pickCloserImpact(
		current: { side: CushionSide; travel: number } | null,
		next: { side: CushionSide; travel: number },
	): { side: CushionSide; travel: number } | null {
		if (!Number.isFinite(next.travel) || next.travel < 0) return current;
		if (!current || next.travel < current.travel) return next;
		return current;
	}

	private reflectCushion(
		ball: BallState,
		side: CushionSide,
		step: number,
		events: SimulationEvent[],
	): void {
		if (side === "left" || side === "right") {
			this.reflectVerticalCushion(ball, side, step, events);
			return;
		}

		this.reflectHorizontalCushion(ball, side, step, events);
	}

	private reflectVerticalCushion(
		ball: BallState,
		side: CushionSide,
		step: number,
		events: SimulationEvent[],
	): void {
		if (
			(side === "left" && ball.velocity.x >= 0) ||
			(side === "right" && ball.velocity.x <= 0)
		) {
			return;
		}

		const normalSpeed = Math.abs(ball.velocity.x);
		const tangentSpeed = Math.abs(ball.velocity.y);
		ball.velocity.x = -ball.velocity.x * this.tuning.cushionRestitution;

		if (Math.abs(ball.sideSpin) > this.tuning.spinStopSpeed) {
			const sideSpinSign = side === "left" ? -1 : 1;
			ball.velocity.y +=
				sideSpinSign *
				this.cushionSpinCorrection(
					ball.sideSpin,
					normalSpeed,
					tangentSpeed,
				);
		}

		if (Math.abs(ball.topSpin) > this.tuning.spinStopSpeed) {
			ball.velocity.y += this.cushionFollowDrawCorrection(
				ball.topSpin,
				normalSpeed,
				ball.velocity.y,
			);
		}

		this.consumeCushionSpin(ball);
		this.recordCushionEvent(ball, side, step, events);
	}

	private reflectHorizontalCushion(
		ball: BallState,
		side: CushionSide,
		step: number,
		events: SimulationEvent[],
	): void {
		if (
			(side === "top" && ball.velocity.y >= 0) ||
			(side === "bottom" && ball.velocity.y <= 0)
		) {
			return;
		}

		const normalSpeed = Math.abs(ball.velocity.y);
		const tangentSpeed = Math.abs(ball.velocity.x);
		ball.velocity.y = -ball.velocity.y * this.tuning.cushionRestitution;

		if (Math.abs(ball.sideSpin) > this.tuning.spinStopSpeed) {
			const sideSpinSign = side === "bottom" ? -1 : 1;
			ball.velocity.x +=
				sideSpinSign *
				this.cushionSpinCorrection(
					ball.sideSpin,
					normalSpeed,
					tangentSpeed,
				);
		}

		if (Math.abs(ball.topSpin) > this.tuning.spinStopSpeed) {
			ball.velocity.x += this.cushionFollowDrawCorrection(
				ball.topSpin,
				normalSpeed,
				ball.velocity.x,
			);
		}

		this.consumeCushionSpin(ball);
		this.recordCushionEvent(ball, side, step, events);
	}

	private resolveBallCollisions(
		balls: BallState[],
		step: number,
		events: SimulationEvent[],
		shotDir: Vec2,
		lastPositions: Map<string, Vec2>,
	): void {
		for (let i = 0; i < balls.length; i++) {
			for (let j = i + 1; j < balls.length; j++) {
				const a = balls[i];
				const b = balls[j];
				const minDist = this.config.ball.radius * 2;
				const impact = this.findBallImpact(
					a,
					b,
					lastPositions.get(a.id) ?? a.position,
					lastPositions.get(b.id) ?? b.position,
					minDist,
				);

				if (!impact) continue;

				if (impact.time < 1) {
					a.position = this.interpolate(
						lastPositions.get(a.id) ?? a.position,
						a.position,
						impact.time,
					);
					b.position = this.interpolate(
						lastPositions.get(b.id) ?? b.position,
						b.position,
						impact.time,
					);
				}

				const remainingTime = (1 - impact.time) * this.config.physics.timeStep;
				const normal = impact.normal;
				const tangent = { x: -normal.y, y: normal.x };
				const overlap = Math.max(0, minDist - distance(a.position, b.position));

				if (overlap > 0) {
					a.position = {
						x: a.position.x - normal.x * overlap * 0.5,
						y: a.position.y - normal.y * overlap * 0.5,
					};
					b.position = {
						x: b.position.x + normal.x * overlap * 0.5,
						y: b.position.y + normal.y * overlap * 0.5,
					};
				}

				const relVel = sub(b.velocity, a.velocity);
				const normalSpeed = dot(relVel, normal);
				if (normalSpeed > 0) continue;

				const impactSpeed = -normalSpeed;
				const incomingVelocityA = { ...a.velocity };
				const incomingVelocityB = { ...b.velocity };
				const impulse = -((1 + this.tuning.ballRestitution) * normalSpeed) / 2;

				a.velocity = {
					x: a.velocity.x - impulse * normal.x,
					y: a.velocity.y - impulse * normal.y,
				};
				b.velocity = {
					x: b.velocity.x + impulse * normal.x,
					y: b.velocity.y + impulse * normal.y,
				};

				this.applyCutThrowToObjectBall(
					a,
					b,
					tangent,
					incomingVelocityA,
					impactSpeed,
				);
				this.applyCutThrowToObjectBall(
					b,
					a,
					scale(tangent, -1),
					incomingVelocityB,
					impactSpeed,
				);
				this.applyCueSpinAfterBallCollision(
					a,
					normal,
					tangent,
					shotDir,
					impactSpeed,
				);
				this.applyCueSpinAfterBallCollision(
					b,
					scale(normal, -1),
					scale(tangent, -1),
					shotDir,
					impactSpeed,
				);
				this.recordBallCollisionEvent(a, b, step, events);

				if (remainingTime > 1e-6) {
					this.advanceBall(a, remainingTime, step, events);
					this.advanceBall(b, remainingTime, step, events);
				}
			}
		}
	}

	private findBallImpact(
		a: BallState,
		b: BallState,
		prevA: Vec2,
		prevB: Vec2,
		minDist: number,
	): { time: number; normal: Vec2 } | null {
		const prevDelta = sub(prevB, prevA);
		const moveA = sub(a.position, prevA);
		const moveB = sub(b.position, prevB);
		const relativeMove = sub(moveB, moveA);
		const prevDist = length(prevDelta);

		if (prevDist > 1e-8 && prevDist <= minDist) {
			return { time: 0, normal: scale(prevDelta, 1 / prevDist) };
		}

		const aCoeff = dot(relativeMove, relativeMove);
		const currentDelta = sub(b.position, a.position);
		const currentDist = length(currentDelta);

		if (aCoeff < 1e-12) {
			if (currentDist > 1e-8 && currentDist <= minDist) {
				return { time: 1, normal: scale(currentDelta, 1 / currentDist) };
			}

			return null;
		}

		const bCoeff = 2 * dot(prevDelta, relativeMove);
		const cCoeff = dot(prevDelta, prevDelta) - minDist * minDist;
		if (cCoeff <= 0) return { time: 0, normal: normalize(prevDelta) };
		if (bCoeff >= 0) return null;

		const discriminant = bCoeff * bCoeff - 4 * aCoeff * cCoeff;
		if (discriminant >= 0) {
			const time = (-bCoeff - Math.sqrt(discriminant)) / (2 * aCoeff);

			if (time >= 0 && time <= 1) {
				const impactDelta = {
					x: prevDelta.x + relativeMove.x * time,
					y: prevDelta.y + relativeMove.y * time,
				};
				return { time, normal: normalize(impactDelta) };
			}
		}

		if (currentDist > 1e-8 && currentDist <= minDist) {
			return { time: 1, normal: scale(currentDelta, 1 / currentDist) };
		}

		return null;
	}

	private applyCutThrowToObjectBall(
		candidateCue: BallState,
		objectBall: BallState,
		tangent: Vec2,
		incomingVelocity: Vec2,
		impactSpeed: number,
	): void {
		if (
			candidateCue.id !== INTERNAL_CUE_BALL_ID ||
			objectBall.id === INTERNAL_CUE_BALL_ID
		) {
			return;
		}

		const incomingSpeed = length(incomingVelocity);
		if (
			incomingSpeed <= this.tuning.stopSpeed ||
			impactSpeed <= this.tuning.stopSpeed
		) {
			return;
		}

		const incomingDirection = scale(incomingVelocity, 1 / incomingSpeed);
		const cutAmount = dot(incomingDirection, tangent);
		if (Math.abs(cutAmount) <= 1e-4) return;

		const speedFactor = clamp(1.4 - impactSpeed / 3, 0.35, 1);
		const sideSpinFactor =
			Math.abs(candidateCue.sideSpin) > this.tuning.spinStopSpeed
				? candidateCue.sideSpin * 0.15
				: 0;
		const rawThrowSpeed =
			(cutAmount + sideSpinFactor) *
			this.tuning.cutThrowTransfer *
			impactSpeed *
			speedFactor;
		const throwSpeed = this.clampSpinCorrection(
			rawThrowSpeed,
			this.tuning.maxSpinCorrectionSpeed * 0.35,
		);

		objectBall.velocity = {
			x: objectBall.velocity.x + tangent.x * throwSpeed,
			y: objectBall.velocity.y + tangent.y * throwSpeed,
		};
	}

	private applyCueSpinAfterBallCollision(
		candidateCue: BallState,
		normalFromCueToOther: Vec2,
		tangent: Vec2,
		shotDir: Vec2,
		impactSpeed: number,
	): void {
		if (candidateCue.id !== INTERNAL_CUE_BALL_ID) return;

		let consumedSpin = false;
		if (Math.abs(candidateCue.sideSpin) > this.tuning.spinStopSpeed) {
			const tangentCorrection = this.clampSpinCorrection(
				candidateCue.sideSpin * this.tuning.ballSpinTransfer,
				this.tuning.maxSpinCorrectionSpeed * 0.5,
			);
			candidateCue.velocity = {
				x: candidateCue.velocity.x + tangent.x * tangentCorrection,
				y: candidateCue.velocity.y + tangent.y * tangentCorrection,
			};
			consumedSpin = true;
		}

		if (Math.abs(candidateCue.topSpin) <= this.tuning.spinStopSpeed) {
			if (consumedSpin) this.consumeBallCollisionSpin(candidateCue);
			return;
		}

		const headOnFactor = Math.abs(dot(normalFromCueToOther, shotDir));
		const spinSpeed =
			Math.abs(candidateCue.topSpin) *
			this.tuning.followDrawTransfer *
			impactSpeed *
			headOnFactor;

		if (spinSpeed <= 0) {
			if (consumedSpin) this.consumeBallCollisionSpin(candidateCue);
			return;
		}

		const currentNormalVelocity = dot(
			candidateCue.velocity,
			normalFromCueToOther,
		);
		const targetNormalVelocity =
			candidateCue.topSpin > 0
				? Math.min(spinSpeed, this.tuning.maxSpinCorrectionSpeed)
				: -Math.min(spinSpeed, this.tuning.maxSpinCorrectionSpeed);
		const correction = this.clampSpinCorrection(
			targetNormalVelocity - currentNormalVelocity,
		);

		candidateCue.velocity = {
			x: candidateCue.velocity.x + normalFromCueToOther.x * correction,
			y: candidateCue.velocity.y + normalFromCueToOther.y * correction,
		};
		this.consumeBallCollisionSpin(candidateCue);
	}

	private rollingDecelerationFor(ball: BallState): number {
		const baseDeceleration = this.tuning.rollingFriction * GRAVITY;
		if (Math.abs(ball.topSpin) <= this.tuning.spinStopSpeed) {
			return baseDeceleration;
		}

		const spinEffect = clamp(
			ball.topSpin * this.tuning.followDrawMotionTransfer,
			-0.75,
			0.5,
		);
		const decelerationFactor = clamp(1 - spinEffect, 0.5, 1.75);
		return baseDeceleration * decelerationFactor;
	}

	private travelDistance(
		speed: number,
		deceleration: number,
		duration: number,
	): number {
		if (duration <= 0 || speed <= 0) return 0;
		if (deceleration <= 0) return speed * duration;

		const stopTime = speed / deceleration;
		const t = Math.min(duration, stopTime);
		return speed * t - 0.5 * deceleration * t * t;
	}

	private speedAfter(
		speed: number,
		deceleration: number,
		duration: number,
	): number {
		if (deceleration <= 0) return speed;
		return Math.max(0, speed - deceleration * duration);
	}

	private timeForTravel(
		speed: number,
		deceleration: number,
		travel: number,
	): number {
		if (travel <= 0 || speed <= 0) return 0;
		if (deceleration <= 0) return travel / speed;

		const discriminant = speed * speed - 2 * deceleration * travel;
		if (discriminant <= 0) return speed / deceleration;
		return (speed - Math.sqrt(discriminant)) / deceleration;
	}

	private cushionSpinCorrection(
		sideSpin: number,
		normalSpeed: number,
		tangentSpeed: number,
	): number {
		if (normalSpeed <= this.tuning.stopSpeed) return 0;

		const incidenceFactor = normalSpeed / (normalSpeed + tangentSpeed + 1e-6);
		const speedFactor = clamp(1.25 - normalSpeed / 4, 0.45, 1);
		const rawCorrection =
			sideSpin *
			this.tuning.cushionSpinTransfer *
			normalSpeed *
			(0.4 + incidenceFactor * 0.6) *
			speedFactor;
		const maxCorrection =
			normalSpeed * this.tuning.maxCushionSpinCorrectionRatio;

		return clamp(rawCorrection, -maxCorrection, maxCorrection);
	}

	private cushionFollowDrawCorrection(
		topSpin: number,
		normalSpeed: number,
		tangentVelocity: number,
	): number {
		const tangentSpeed = Math.abs(tangentVelocity);
		if (
			normalSpeed <= this.tuning.stopSpeed ||
			tangentSpeed <= this.tuning.stopSpeed
		) {
			return 0;
		}

		const tangentSign = tangentVelocity >= 0 ? 1 : -1;
		const incidenceFactor =
			tangentSpeed / (normalSpeed + tangentSpeed + 1e-6);
		const speedFactor = clamp(1.25 - normalSpeed / 4, 0.45, 1);
		const rawMagnitude =
			Math.abs(topSpin) *
			this.tuning.cushionFollowDrawTransfer *
			normalSpeed *
			(0.35 + incidenceFactor * 0.65) *
			speedFactor;
		const maxOpenCorrection =
			normalSpeed * this.tuning.maxCushionFollowDrawCorrectionRatio;
		const maxNarrowCorrection = Math.min(
			tangentSpeed * 0.85,
			maxOpenCorrection,
		);
		const signedMagnitude = topSpin > 0 ? rawMagnitude : -rawMagnitude;

		return (
			tangentSign *
			clamp(signedMagnitude, -maxNarrowCorrection, maxOpenCorrection)
		);
	}

	private decaySpin(ball: BallState, duration: number): void {
		if (duration <= 0) return;

		const spinDecay = (5 / 2) * this.tuning.spinFriction * GRAVITY * duration;
		ball.sideSpin = this.decayTowardZero(ball.sideSpin, spinDecay);
		ball.topSpin = this.decayTowardZero(ball.topSpin, spinDecay);
	}

	private consumeCushionSpin(ball: BallState): void {
		ball.sideSpin *= this.tuning.cushionSpinRetention;
		ball.topSpin *= this.tuning.cushionSpinRetention;
		this.clearSmallSpin(ball);
	}

	private consumeBallCollisionSpin(ball: BallState): void {
		ball.sideSpin *= this.tuning.ballSpinRetention;
		ball.topSpin *= this.tuning.ballSpinRetention;
		this.clearSmallSpin(ball);
	}

	private clearSmallSpin(ball: BallState): void {
		if (Math.abs(ball.sideSpin) <= this.tuning.spinStopSpeed) {
			ball.sideSpin = 0;
		}
		if (Math.abs(ball.topSpin) <= this.tuning.spinStopSpeed) {
			ball.topSpin = 0;
		}
	}

	private settleStoppedBalls(balls: BallState[]): void {
		for (const ball of balls) {
			if (length(ball.velocity) > this.tuning.stopSpeed) continue;

			ball.velocity = { x: 0, y: 0 };
			ball.sideSpin = 0;
			ball.topSpin = 0;
		}
	}

	private releaseInactiveContacts(balls: BallState[]): void {
		const byId = new Map(balls.map((ball) => [ball.id, ball]));

		for (const key of [...this.activeContacts]) {
			const [type, first, second] = key.split(":");

			if (type === "cushion") {
				const ball = byId.get(first);
				if (
					!ball ||
					!this.isCushionContactActive(ball, second as CushionSide)
				) {
					this.activeContacts.delete(key);
				}
				continue;
			}

			if (type === "ball") {
				const a = byId.get(first);
				const b = byId.get(second);
				if (
					!a ||
					!b ||
					distance(a.position, b.position) >
						this.config.ball.radius * 2 + 1e-4
				) {
					this.activeContacts.delete(key);
				}
			}
		}
	}

	private isCushionContactActive(ball: BallState, side: CushionSide): boolean {
		const contactTolerance = 1e-4;
		const radius = this.config.ball.radius;

		switch (side) {
			case "left":
				return ball.position.x <= radius + contactTolerance;
			case "right":
				return (
					ball.position.x >=
					this.config.table.width - radius - contactTolerance
				);
			case "top":
				return ball.position.y <= radius + contactTolerance;
			case "bottom":
				return (
					ball.position.y >=
					this.config.table.height - radius - contactTolerance
				);
		}
	}

	private recordCushionEvent(
		ball: BallState,
		side: CushionSide,
		step: number,
		events: SimulationEvent[],
	): void {
		const key = `cushion:${ball.id}:${side}`;
		if (this.activeContacts.has(key)) return;

		this.activeContacts.add(key);
		events.push({
			type: "cushion-hit",
			step,
			position: { ...ball.position },
			ballId: ball.id,
			cushionSide: side,
		});
	}

	private recordBallCollisionEvent(
		a: BallState,
		b: BallState,
		step: number,
		events: SimulationEvent[],
	): void {
		const key = `ball:${[a.id, b.id].sort().join(":")}`;
		if (this.activeContacts.has(key)) return;

		this.activeContacts.add(key);
		const position = {
			x: (a.position.x + b.position.x) / 2,
			y: (a.position.y + b.position.y) / 2,
		};
		events.push({
			type: "ball-collision",
			step,
			position,
			ballId: a.id,
			otherBallId: b.id,
		});
		events.push({
			type: "ball-collision",
			step,
			position,
			ballId: b.id,
			otherBallId: a.id,
		});
	}

	private applyCollisionFlags(
		balls: BallState[],
		events: SimulationEvent[],
	): void {
		const collidedIds = new Set(
			events.flatMap((event) =>
				event.otherBallId
					? [event.ballId, event.otherBallId]
					: [event.ballId],
			),
		);

		for (const ball of balls) {
			ball.collided = collidedIds.has(ball.id);
		}
	}

	private createTrajectory(balls: BallState[]): Trajectory {
		const [target, ...others] = balls;

		return {
			target: this.createSnapshot(target),
			others: others.map((ball) => this.createSnapshot(ball)),
		};
	}

	private createSnapshot(ball: BallState): BallSnapshot {
		return {
			id: ball.id,
			position: { ...ball.position },
			velocity: { ...ball.velocity },
			sideSpin: ball.sideSpin,
			topSpin: ball.topSpin,
			radius: this.config.ball.radius,
			collided: ball.collided,
		};
	}

	private interpolate(from: Vec2, to: Vec2, time: number): Vec2 {
		return {
			x: from.x + (to.x - from.x) * time,
			y: from.y + (to.y - from.y) * time,
		};
	}

	private isBallMoving(ball: BallState): boolean {
		return length(ball.velocity) > this.tuning.stopSpeed;
	}

	private clampSpinCorrection(
		value: number,
		maxSpeed = this.tuning.maxSpinCorrectionSpeed,
	): number {
		return clamp(value, -maxSpeed, maxSpeed);
	}

	private clampToTable(position: Vec2): Vec2 {
		const margin = this.config.ball.radius + 0.005;

		return {
			x: clamp(position.x, margin, this.config.table.width - margin),
			y: clamp(position.y, margin, this.config.table.height - margin),
		};
	}

	private decayTowardZero(value: number, amount: number): number {
		if (value > 0) return Math.max(0, value - amount);
		if (value < 0) return Math.min(0, value + amount);
		return 0;
	}

	private normalizeHitPoint(offset: number): number {
		if (!Number.isFinite(offset)) return 0;
		return clamp(offset, -this.tuning.maxSpinRatio, this.tuning.maxSpinRatio);
	}
}

export default CustomPhysicsSimulator;
