import { Application, Color, Container, Graphics } from "pixi.js";
import { useCallback, useEffect, useRef } from "react";
import HitControlPanel from "@/components/hit-params-panel";
import usePlanarCanvas from "@/hooks/use-planar-canvas";
import logger from "@/lib/logger";
import { drawTrajectory } from "@/lib/painter";
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

	private createColliderGfx(
		color: Color,
		snapshot: BallSnapshot,
		scale: number,
	): Graphics {
		const strokeColor = new Color([1, 1, 1, 0.8]);

		const gfx = new Graphics()
			.circle(0, 0, snapshot.radius * scale)
			.fill(color)
			.stroke({ width: 4, color: strokeColor });

		const q = snapshot.rotation;
		const surfaceR = snapshot.radius * scale;
		const baseDotR = surfaceR * 0.25;

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
		const snapshots: BallSnapshot[] = [trajectory.cueBall, ...trajectory.objectBalls];

		this.container.removeChildren().forEach((child) => {
			child.destroy();
		});

		snapshots.forEach((ball, index) => {
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
	const [createCanvas, canvasSpec] = usePlanarCanvas();
	const canvasHandleRef = useRef<CanvasHandle<"2d"> | null>(null);

	const hitPointRef = useRef<Vector2<"unit">>({ x: 0, y: 0 });
	const hitPowerRef = useRef(0.5);
	const hitAngleRef = useRef(0);

	const appRef = useRef<Application>(null);
	const rendererRef = useRef<WorldRenderer>(null);
	const simulatorRef = useRef<Simulator>(
		new Simulator(),
	);
	const previousTickRef = useRef<() => void>(null);

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
			-hitAngleRef.current,
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
				canvasHandleRef.current = await createCanvas(
					CANVAS_WIDTH,
					CANVAS_HEIGHT,
				);
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
			// app.destroy(true, { children: true });
		};
	}, [createCanvas]);

	const refreshCanvas = useCallback(() => {
		if (!canvasHandleRef.current) {
			return;
		}
		const canvasHandle = canvasHandleRef.current;

		const simulator = simulatorRef.current;

		const [initialTrajactory, step] = simulator.simulate(
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

		const trajectries: Trajectory[] = [initialTrajactory];
		for (let i = 0; i < 300; i++) {
			const trajactory = step();
			trajectries.push(trajactory);
		}

		drawTrajectory(canvasHandle, trajectries);
	}, []);

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
				{canvasSpec && (
					<canvas
						ref={(element) => {
							if (element) {
								canvasSpec.onMount(element);
							}
						}}
						width={canvasSpec.width}
						height={canvasSpec.height}
						style={{
							width: "100cqw",
							height: "auto",
							aspectRatio: `${canvasSpec.width} / ${canvasSpec.height}`,
							position: "absolute",
							top: 0,
							left: 0,
						}}
					/>
				)}
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
				type="button"
			>
				Simulate
			</button>
		</div>
	);
}

export default Physics;
