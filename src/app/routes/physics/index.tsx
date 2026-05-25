import { Application, Color, Container, Graphics } from "pixi.js";
import { useCallback, useEffect, useRef } from "react";
import HitControlPanel from "@/components/hit-params-panel";
import logger from "@/lib/logger";
import Simulator from "@/lib/simulator";

const SCALE = 1000;
const CANVAS_WIDTH = 2844;
const CANVAS_HEIGHT = 1422;

class WorldRenderer {
	private static readonly FACE_POINTS: Array<[number, number, number, Color]> =
		[
			[1, 0, 0, new Color([1, 0.2, 0.2, 1])], // +X
			[-1, 0, 0, new Color([0.4, 0, 0, 1])], // -X
			[0, 1, 0, new Color([0.2, 1, 0.2, 1])], // +Y
			[0, -1, 0, new Color([0, 0.4, 0, 1])], // -Y
			[0, 0, 1, new Color([0.4, 0.6, 1, 1])], // +Z
			[0, 0, -1, new Color([0, 0.1, 0.5, 1])], // -Z
		];
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

	private createColliderGfx(color: Color, ball: Ball, scale: number): Graphics {
		const strokeColor = new Color([1, 1, 1, 0.8]);

		const gfx = new Graphics()
			.circle(0, 0, ball.radius * scale)
			.fill(color)
			.stroke({ width: 4, color: strokeColor });

		const q = ball.rotation;
		const surfaceR = ball.radius * scale;
		const baseDotR = surfaceR * 0.18;

		for (const [lx, ly, lz, color] of WorldRenderer.FACE_POINTS) {
			// v' = v + 2 * q.xyz × (q.xyz × v + q.w * v)
			const tx = 2 * (q.y * lz - q.z * ly);
			const ty = 2 * (q.z * lx - q.x * lz);
			const tz = 2 * (q.x * ly - q.y * lx);
			const wx = lx + q.w * tx + (q.y * tz - q.z * ty);
			const wy = ly + q.w * ty + (q.z * tx - q.x * tz);
			const wz = lz + q.w * tz + (q.x * ty - q.y * tx);

			if (wy < 0) continue;

			const sx = wx * surfaceR;
			const sy = wz * surfaceR;
			const dotR = baseDotR * (0.4 + 0.6 * wy);

			gfx.circle(sx, sy, dotR).fill(color);
		}

		return gfx;
	}

	public sync(trajectory: Trajectory) {
		const balls: Ball[] = [trajectory.target, ...trajectory.others];

		this.container.removeChildren().forEach((child) => child.destroy());

		balls.forEach((ball, index) => {
			const gfx = this.createColliderGfx(
				WorldRenderer.BALL_COLORS[index],
				ball,
				this.scale,
			);
			gfx.position.set(
				ball.position.x * this.scale,
				ball.position.z * this.scale,
			);
			this.container.addChild(gfx);
		});
	}
}

/**
 * 물리 테스트 페이지.
 */
function Physics() {
	const hostRef = useRef<HTMLDivElement>(null);

	const hitPointRef = useRef<Vector2>({ x: 0.5, y: 0.5 });
	const hitPowerRef = useRef(0.5);

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
				radius: 0.05715 / 2,
			},
			physics: {
				timeStep: 1 / 60,
			},
		}),
	);
	const previousTickRef = useRef<() => void | null>(null);

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

		const [initialTrajactory, step] = simulator.simulate(
			{ x: 1.422, y: 0.711 },
			[
				...Array.from({ length: 3 }, (_, i) => ({
					x: 1.422 + Math.cos((Math.PI / 3) * 2 * i) * 0.2,
					y: 0.711 + Math.sin((Math.PI / 3) * 2 * i) * 0.2,
				})),
			],
			Math.PI / 3,
			hitPowerRef.current,
			hitPointRef.current,
		);

		renderer.sync(initialTrajactory);

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
			console.error("Host element not found");
			return;
		}

		const host = hostRef.current;
		const app = new Application();

		(async () => {
			try {
				await app.init({
					width: CANVAS_WIDTH,
					height: CANVAS_HEIGHT,
					background: new Color([0, 0, 0]),
					antialias: true,
				});

				if (ac.signal.aborted) {
					app.destroy(true, { children: true });
					return;
				}

				const pixiCanvas = app.canvas;
				pixiCanvas.style.width = "100cqw";
				pixiCanvas.style.height = "auto";
				pixiCanvas.style.aspectRatio = "2 / 1";
				host.appendChild(pixiCanvas);

				appRef.current = app;
				rendererRef.current = new WorldRenderer(app.stage, SCALE);
			} catch (err) {
				logger.error(err);
			}
		})();

		return () => {
			ac.abort();
			// app.destroy(true, { children: true });
		};
	}, []);

	return (
		<div
			style={{
				width: "100vw",
				height: "100vh",
				containerType: "size",
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
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

			<HitControlPanel
				style={{
					position: "absolute",
					bottom: "20px",
					left: "20px",
				}}
				onHitPointChange={(point) => {
					hitPointRef.current = point;
				}}
				onHitPowerChange={(power) => {
					hitPowerRef.current = power;
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

export default Physics;
