import { Application, Color, Container, Graphics } from "pixi.js";
import { useCallback, useEffect, useRef } from "react";
import HitControlPanel from "@/components/hit-params-panel";
import logger from "@/lib/logger";
import Simulator from "@/lib/custom_sim";

type CustomBallSnapshot = {
	readonly id: string;
	readonly position: {
		readonly x: number;
		readonly y: number;
	};
	readonly velocity: {
		readonly x: number;
		readonly y: number;
	};
	readonly sideSpin: number;
	readonly topSpin: number;
	readonly radius: number;
	readonly collided: boolean;
};

type CustomTrajectory = {
	readonly target: CustomBallSnapshot;
	readonly others: CustomBallSnapshot[];
};

const SCALE = 1000;
const CANVAS_WIDTH = 2844;
const CANVAS_HEIGHT = 1422;
const TRAJECTORY_STEP_COUNT = 300;

class WorldRenderer {
	private static readonly BALL_COLORS = [
		new Color([1, 0, 0, 0.5]),
		new Color([0, 1, 0, 0.5]),
		new Color([0, 0, 1, 0.5]),
		new Color([1, 1, 0, 0.5]),
		new Color([1, 0, 1, 0.5]),
		new Color([0, 1, 1, 0.5]),
		new Color([1, 0.5, 0, 0.5]),
		new Color([0.5, 0, 1, 0.5]),
		new Color([0, 0.5, 1, 0.5]),
		new Color([0.5, 1, 0, 0.5]),
	];

	private readonly container = new Container();
	private readonly scale: number;

	public constructor(parent: Container, scale: number) {
		this.scale = scale;
		parent.addChild(this.container);
	}

	private createColliderGfx(
		color: Color,
		snapshot: CustomBallSnapshot,
		scale: number,
	): Graphics {
		const strokeColor = new Color([1, 1, 1, 0.8]);

		return new Graphics()
			.circle(0, 0, snapshot.radius * scale)
			.fill(color)
			.stroke({ width: 4, color: strokeColor });
	}

	public sync(trajectory: CustomTrajectory) {
		const snapshots = [trajectory.target, ...trajectory.others];

		this.container.removeChildren().forEach((child) => child.destroy());

		snapshots.forEach((ball, index) => {
			const gfx = this.createColliderGfx(
				WorldRenderer.BALL_COLORS[
					index % WorldRenderer.BALL_COLORS.length
				],
				ball,
				this.scale,
			);

			gfx.position.set(
				ball.position.x * this.scale,
				ball.position.y * this.scale,
			);

			this.container.addChild(gfx);
		});
	}
}

function CustomPhysics() {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const contextRef = useRef<CanvasRenderingContext2D | null>(null);

	const hitPointRef = useRef({ x: 0, y: 0 });
	const hitPowerRef = useRef(0.5);
	const hitAngleRef = useRef(0);

	const appRef = useRef<Application | null>(null);
	const rendererRef = useRef<WorldRenderer | null>(null);
	const simulatorRef = useRef<Simulator>(
		new Simulator({
			table: {
				width: 2.844,
				height: 1.422,
			},
			ball: {
				count: 4,
				radius: 0.0655 / 2,
			},
			physics: {
				timeStep: 1 / 120,
			},
		}),
	);
	const previousTickRef = useRef<(() => void) | null>(null);

	const simulate = useCallback(() => {
		if (!appRef.current || !rendererRef.current) {
			logger.error("App or Renderer not initialized");
			return;
		}

		if (previousTickRef.current) {
			appRef.current.ticker.remove(previousTickRef.current);
		}

		const app = appRef.current;
		const renderer = rendererRef.current;
		const simulator = simulatorRef.current;

		const [initialTrajectory, step] = simulator.simulate(
			{ x: 1.422, y: 0.711 },
			[
				...Array.from({ length: 3 }, (_, i) => ({
					x: 1.422 + Math.cos((Math.PI / 3) * 2 * i) * 0.2,
					y: 0.711 + Math.sin((Math.PI / 3) * 2 * i) * 0.2,
				})),
			],
			-hitAngleRef.current,
			hitPowerRef.current,
			hitPointRef.current,
		);

		renderer.sync(initialTrajectory);

		const tick = () => {
			const trajectory = step();

			renderer.sync(trajectory);
		};
		app.ticker.add(tick);
		previousTickRef.current = tick;
	}, []);

	useEffect(() => {
		const ac = new AbortController();

		if (!hostRef.current) {
			logger.error("Host element not found");
			return;
		}

		const host = hostRef.current;
		const app = new Application();
		let initialized = false;

		(async () => {
			try {
				await app.init({
					width: CANVAS_WIDTH,
					height: CANVAS_HEIGHT,
					background: new Color([0, 0, 0]),
					antialias: true,
				});
				initialized = true;

				if (ac.signal.aborted) {
					app.destroy(true, { children: true });
					return;
				}

				const pixiCanvas = app.canvas;
				pixiCanvas.style.width = "100cqw";
				pixiCanvas.style.height = "auto";
				pixiCanvas.style.aspectRatio = `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`;
				host.appendChild(pixiCanvas);

				appRef.current = app;
				rendererRef.current = new WorldRenderer(app.stage, SCALE);
			} catch (err) {
				logger.error(err);
			}
		})();

		return () => {
			ac.abort();

			if (previousTickRef.current) {
				app.ticker.remove(previousTickRef.current);
				previousTickRef.current = null;
			}

			if (initialized) {
				app.destroy(true, { children: true });
			}
			appRef.current = null;
			rendererRef.current = null;
		};
	}, []);

	const refreshCanvas = useCallback(() => {
		if (!contextRef.current) {
			return;
		}

		const context = contextRef.current;
		const simulator = simulatorRef.current;

		const [initialTrajectory, step] = simulator.simulate(
			{ x: 1.422, y: 0.711 },
			[
				...Array.from({ length: 3 }, (_, i) => ({
					x: 1.422 + Math.cos((Math.PI / 3) * 2 * i) * 0.2,
					y: 0.711 + Math.sin((Math.PI / 3) * 2 * i) * 0.2,
				})),
			],
			-hitAngleRef.current,
			hitPowerRef.current,
			hitPointRef.current,
		);

		const trajectories = [initialTrajectory];
		for (let i = 0; i < TRAJECTORY_STEP_COUNT; i++) {
			trajectories.push(step());
		}

		context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		context.setLineDash([8, 8]);

		context.strokeStyle = "rgba(255, 255, 255, 0.8)";
		context.lineWidth = 2;
		context.beginPath();
		context.moveTo(
			initialTrajectory.target.position.x * SCALE,
			initialTrajectory.target.position.y * SCALE,
		);

		for (const trajectory of trajectories) {
			const { target } = trajectory;
			const x = target.position.x * SCALE;
			const y = target.position.y * SCALE;

			context.lineTo(x, y);
		}
		context.stroke();

		for (let i = 0; i < initialTrajectory.others.length; i++) {
			context.strokeStyle = "rgba(0, 125, 255, 1)";
			context.lineWidth = 2;
			context.beginPath();
			context.moveTo(
				initialTrajectory.others[i].position.x * SCALE,
				initialTrajectory.others[i].position.y * SCALE,
			);

			for (const trajectory of trajectories) {
				const { others } = trajectory;
				const x = others[i].position.x * SCALE;
				const y = others[i].position.y * SCALE;

				context.lineTo(x, y);
			}
			context.stroke();
		}

		context.setLineDash([]);
	}, []);

	useEffect(() => {
		refreshCanvas();
	}, [refreshCanvas]);

	return (
		<div
			style={{
				width: "100vw",
				height: "100vh",
				containerType: "size",
				display: "flex",
				justifyContent: "top",
				alignItems: "start",
			}}
		>
			<div
				style={{
					position: "relative",
					width: "100cqw",
					height: "auto",
				}}
			>
				<div
					ref={hostRef}
					style={{
						width: "100cqw",
						height: "auto",
						display: "flex",
						justifyContent: "center",
						alignItems: "center",
					}}
				/>
				<canvas
					ref={(canvas) => {
						if (canvas) {
							contextRef.current = canvas.getContext("2d");
						}
					}}
					width={CANVAS_WIDTH}
					height={CANVAS_HEIGHT}
					style={{
						width: "100cqw",
						height: "auto",
						aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
						position: "absolute",
						top: 0,
						left: 0,
					}}
				/>
			</div>

			<HitControlPanel
				style={{
					position: "absolute",
					bottom: "20px",
					left: "20px",
					backgroundColor: "rgba(255, 255, 255, 0.9)",
					padding: "12px",
					borderRadius: "8px",
					boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
				}}
				onHitPointChange={(point) => {
					hitPointRef.current = point;
					refreshCanvas();
				}}
				onHitPowerChange={(power) => {
					hitPowerRef.current = power;
					refreshCanvas();
				}}
				onHitAngleChange={(angle) => {
					hitAngleRef.current = angle;
					refreshCanvas();
				}}
			/>

			<button
				style={{
					position: "absolute",
					bottom: "20px",
					right: "20px",
				}}
				onClick={() => {
					simulate();
				}}
			>
				Simulate
			</button>
		</div>
	);
}

export default CustomPhysics;
