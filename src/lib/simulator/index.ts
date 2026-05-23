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
	private table: CubitObject[];
	private targetBall: CubitObject;
	private otherBalls: CubitObject[];

	public constructor(config: SimulationConfig) {
		this.config = config;
		this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
		this.table = [
			// ground
			this.createWall(
				new RAPIER.Vector3(
					config.table.width / 2,
					-0.5,
					config.table.height / 2,
				),
				new RAPIER.Vector3(config.table.width, 1, config.table.height),
			),
			// left
			this.createWall(
				new RAPIER.Vector3(-1, 0, config.table.height / 2),
				new RAPIER.Vector3(1, 1, config.table.height),
			),
			// right
			this.createWall(
				new RAPIER.Vector3(config.table.width + 1, 0, config.table.height / 2),
				new RAPIER.Vector3(1, 1, config.table.height),
			),
			// top
			this.createWall(
				new RAPIER.Vector3(config.table.width / 2, 0, -1),
				new RAPIER.Vector3(config.table.width, 1, 1),
			),
			// bottom
			this.createWall(
				new RAPIER.Vector3(config.table.width / 2, 0, config.table.height + 1),
				new RAPIER.Vector3(config.table.width, 1, 1),
			),
		];
		this.targetBall = this.createBall(config.ball.radius);
		this.otherBalls = Array.from({ length: config.ball.count - 1 }, () =>
			this.createBall(config.ball.radius),
		);
	}

	private createWall(position: RAPIER.Vector3, size: RAPIER.Vector3) {
		const rigidbody = this.world.createRigidBody(
			RAPIER.RigidBodyDesc.fixed().setTranslation(
				position.x,
				position.y,
				position.z,
			),
		);
		const collider = this.world.createCollider(
			RAPIER.ColliderDesc.cuboid(size.x, size.y, size.z)
				.setRestitution(0.7)
				.setFriction(0.25),
			rigidbody,
		);

		return { rigidbody, collider };
	}

	private createBall(radius: number) {
		const rigidbody = this.world.createRigidBody(
			RAPIER.RigidBodyDesc.dynamic()
				.setCcdEnabled(true)
				.setTranslation(0, 0, 0),
		);

		const collider = this.world.createCollider(
			RAPIER.ColliderDesc.ball(radius)
				.setRestitution(0.9)
				.setFriction(0.2)
				.setDensity(1700),
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
				this.config.ball.radius / 2,
				targetBallPosition.y,
			),
			true,
		);
		this.targetBall.rigidbody.setLinvel(new Vector3(0, 0, 0), true);
		this.targetBall.rigidbody.setAngvel(new Vector3(0, 0, 0), true);
		this.targetBall.rigidbody.resetForces(true);
		this.targetBall.rigidbody.resetTorques(true);
		this.otherBalls.forEach((ball, i) => {
			if (i < otherBallPositions.length) {
				const position = otherBallPositions[i];
				ball.rigidbody.setTranslation(
					new Vector3(position.x, this.config.ball.radius / 2, position.y),
					true,
				);
				ball.rigidbody.setLinvel(new Vector3(0, 0, 0), true);
				ball.rigidbody.setAngvel(new Vector3(0, 0, 0), true);
				ball.rigidbody.resetForces(true);
				ball.rigidbody.resetTorques(true);
			} else {
				// 테이블 아래로 이동시켜서 시뮬레이션에 영향 안끼치도록
				ball.rigidbody.setTranslation(new Vector3(0, -100, 0), false);
			}
		});

		// this.targetBall.rigidbody.applyImpulseAtPoint(
		// 	new Vector3(power * Math.cos(angle), 0, power * Math.sin(angle)),
		// 	new Vector3(point.x, this.config.ball.radius / 2, point.y),
		// 	true,
		// );
		//
		const initialTrajectory: Trajectory = {
			target: this.targetBall.rigidbody.translation(),
			others: this.otherBalls.map((ball) => ball.rigidbody.translation()),
		};
		this.targetBall.rigidbody.applyImpulse(
			new Vector3(power * Math.cos(angle), 0, power * Math.sin(angle)),
			true,
		);

		return [
			initialTrajectory,
			() => {
				this.world.step();

				return {
					target: this.targetBall.rigidbody.translation(),
					others: this.otherBalls.map((ball) => ball.rigidbody.translation()),
				};
			},
		];
	}
}

export default Simulator;
