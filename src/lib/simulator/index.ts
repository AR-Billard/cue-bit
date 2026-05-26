import RAPIER, { Vector3 } from "@dimforge/rapier3d";

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

type CubitObject = {
	rigidbody: RAPIER.RigidBody;
	collider: RAPIER.Collider;
};

class Simulator {
	private config: SimulationConfig;
	private world: RAPIER.World;
	private eventQueue: RAPIER.EventQueue;
    // @ts-expect-error - table 아직 쓸 일이 없음
	private table: CubitObject[];
	private targetBall: CubitObject;
	private otherBalls: CubitObject[];

	public constructor(config: SimulationConfig) {
		this.config = config;
		this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
		this.world.timestep = config.physics.timeStep;
		this.eventQueue = new RAPIER.EventQueue(true);
		this.table = [
			// ground
			this.createWall(
				new RAPIER.Vector3(config.table.width / 2, -1, config.table.height / 2),
				new RAPIER.Vector3(config.table.width / 2, 1, config.table.height / 2),
			),
			// left
			this.createWall(
				new RAPIER.Vector3(-1, 0, config.table.height / 2),
				new RAPIER.Vector3(1, 5, config.table.height / 2),
			),
			// right
			this.createWall(
				new RAPIER.Vector3(config.table.width + 1, 0, config.table.height / 2),
				new RAPIER.Vector3(1, 5, config.table.height / 2),
			),
			// top
			this.createWall(
				new RAPIER.Vector3(config.table.width / 2, 0, -1),
				new RAPIER.Vector3(config.table.width / 2, 5, 1),
			),
			// bottom
			this.createWall(
				new RAPIER.Vector3(config.table.width / 2, 0, config.table.height + 1),
				new RAPIER.Vector3(config.table.width / 2, 5, 1),
			),
		];
		this.targetBall = this.createBall(config.ball.radius);
		this.otherBalls = Array.from({ length: config.ball.count - 1 }, () =>
			this.createBall(config.ball.radius),
		);
	}

	private createWall(position: RAPIER.Vector3, halfSize: RAPIER.Vector3) {
		const rigidbody = this.world.createRigidBody(
			RAPIER.RigidBodyDesc.fixed().setTranslation(
				position.x,
				position.y,
				position.z,
			),
		);
		const collider = this.world.createCollider(
			RAPIER.ColliderDesc.cuboid(halfSize.x, halfSize.y, halfSize.z)
				.setRestitution(0.7)
				.setFriction(0.2),
			rigidbody,
		);

		return { rigidbody, collider };
	}

	private createBall(radius: number) {
		const rigidbody = this.world.createRigidBody(
			RAPIER.RigidBodyDesc.dynamic()
				.setCcdEnabled(true)
				.setLinearDamping(0.4)
				.setAngularDamping(0.6)
				.setTranslation(0, 0, 0)
				.setCanSleep(false),
		);

		const collider = this.world.createCollider(
			RAPIER.ColliderDesc.ball(radius)
				.setRestitution(0.95)
				.setFriction(0.03)
				.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
				.setDensity(1700)
				.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
			rigidbody,
		);

		return { rigidbody, collider };
	}

	public simulate(
		targetBallPosition: Vector2,
		otherBallPositions: Vector2[],
		angle: number,
		power: number,
		hitPoint: Vector2,
	): [Trajectory, () => Trajectory] {
		if (otherBallPositions.length > this.otherBalls.length) {
			throw new Error("Too many balls");
		}

		this.targetBall.rigidbody.setTranslation(
			new Vector3(
				targetBallPosition.x,
				this.config.ball.radius,
				targetBallPosition.y,
			),
			true,
		);
		this.targetBall.rigidbody.setLinvel(new Vector3(0, 0, 0), true);
		this.targetBall.rigidbody.setAngvel(new Vector3(0, 0, 0), true);
		this.targetBall.rigidbody.setRotation(
			new RAPIER.Quaternion(0, 0, 0, 1),
			true,
		);
		this.targetBall.rigidbody.resetForces(true);
		this.targetBall.rigidbody.resetTorques(true);
		this.otherBalls.forEach((ball, i) => {
			if (i < otherBallPositions.length) {
				const position = otherBallPositions[i];
				ball.rigidbody.setTranslation(
					new Vector3(position.x, this.config.ball.radius, position.y),
					true,
				);
				ball.rigidbody.setLinvel(new Vector3(0, 0, 0), true);
				ball.rigidbody.setAngvel(new Vector3(0, 0, 0), true);
				ball.rigidbody.setRotation(new RAPIER.Quaternion(0, 0, 0, 1), true);
				ball.rigidbody.resetForces(true);
				ball.rigidbody.resetTorques(true);
			} else {
				// 테이블 아래로 이동시켜서 시뮬레이션에 영향 안끼치도록
				ball.rigidbody.setTranslation(new Vector3(0, -100, 0), false);
			}
		});

		const initialTrajectory: Trajectory = {
			target: {
				position: this.targetBall.rigidbody.translation(),
				rotation: this.targetBall.rigidbody.rotation(),
				linvel: this.targetBall.rigidbody.linvel(),
				angvel: this.targetBall.rigidbody.angvel(),
				radius: this.config.ball.radius,
				collided: false,
			},
			others: this.otherBalls.map((ball) => ({
				position: ball.rigidbody.translation(),
				rotation: ball.rigidbody.rotation(),
				linvel: ball.rigidbody.linvel(),
				angvel: ball.rigidbody.angvel(),
				radius: this.config.ball.radius,
				collided: false,
			})),
		};

		const ballCenter = this.targetBall.rigidbody.translation();

		// 임펄스 방향
		const dirX = Math.cos(angle);
		const dirZ = Math.sin(angle);

		// 수평 평면상 임펄스에 수직인 방향
		const perpX = -Math.sin(angle);
		const perpZ = Math.cos(angle);

		const contactPoint = new Vector3(
			ballCenter.x + perpX * this.config.ball.radius * hitPoint.x,
			ballCenter.y + this.config.ball.radius * hitPoint.y,
			ballCenter.z + perpZ * this.config.ball.radius * hitPoint.x,
		);

		this.targetBall.rigidbody.applyImpulseAtPoint(
			new Vector3(power * dirX, 0, power * dirZ),
			contactPoint,
			true,
		);

		return [
			initialTrajectory,
			() => {
				this.world.step(this.eventQueue);

				const collidedHandles = new Set<number>();
				this.eventQueue.drainCollisionEvents((h1, h2, started) => {
					if (!started) return;
					collidedHandles.add(h1);
					collidedHandles.add(h2);
				});

				return {
					target: {
						position: this.targetBall.rigidbody.translation(),
						rotation: this.targetBall.rigidbody.rotation(),
						linvel: this.targetBall.rigidbody.linvel(),
						angvel: this.targetBall.rigidbody.angvel(),
						radius: this.config.ball.radius,
						collided: collidedHandles.has(this.targetBall.collider.handle),
					},
					others: this.otherBalls.map((ball) => ({
						position: ball.rigidbody.translation(),
						rotation: ball.rigidbody.rotation(),
						linvel: ball.rigidbody.linvel(),
						angvel: ball.rigidbody.angvel(),
						radius: this.config.ball.radius,
						collided: collidedHandles.has(ball.collider.handle),
					})),
				};
			},
		];
	}
}

export default Simulator;
