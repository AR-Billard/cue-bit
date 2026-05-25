import { Application, Color, Container, Graphics } from "pixi.js";
import { useEffect, useRef } from "react";
import { sleep } from "@/common";
import logger from "@/lib/logger";
import Simulator from "@/lib/simulator";
import styles from "./index.module.css";

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

				const renderer = new WorldRenderer(app.stage, SCALE);

				const count = 8;

				const simulator = new Simulator({
					table: {
						width: 2.844,
						height: 1.422,
					},
					ball: {
						count: count,
						radius: 0.05715 / 2,
					},
					physics: {
						timeStep: 1 / 60,
					},
				});

				const [initialTrajactory, step] = simulator.simulate(
					{ x: 1.422, y: 0.711 },
					[
						...Array.from({ length: count - 1 }, (_, i) => ({
							x: 1.422 + Math.cos((Math.PI / (count - 1)) * 2 * i) * 0.2,
							y: 0.711 + Math.sin((Math.PI / (count - 1)) * 2 * i) * 0.2,
						})),
					],
					Math.PI / 1.4,
					4,
					{ x: 0.5, y: 0.5 },
				);

				renderer.sync(initialTrajactory);

				await sleep(1000);

				app.ticker.add(() => {
					const trajectory = step();

					renderer.sync(trajectory);
				});
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
			ref={hostRef}
			className={styles.container}
			style={{
				width: "100vw",
				height: "100vh",
				containerType: "size",
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
			}}
		/>
	);
}

export default Physics;
