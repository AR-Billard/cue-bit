import type { Vector3 } from "@dimforge/rapier3d";
import { Application, Color, Container, Graphics } from "pixi.js";
import { useEffect, useRef } from "react";
import { measure, sleep } from "@/common";
import logger from "@/lib/logger";
import Simulator from "@/lib/simulator";
import styles from "./index.module.css";

const SCALE = 1000;
const CANVAS_WIDTH = 2844;
const CANVAS_HEIGHT = 1422;

class WorldRenderer {
	private readonly container = new Container();
	private readonly gfxMap = new Map<number, Graphics>();
	private readonly scale: number;
	private readonly ballRadius: number;
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

	public constructor(parent: Container, scale: number, ballRadius: number) {
		this.scale = scale;
		this.ballRadius = ballRadius;
		parent.addChild(this.container);
	}

	private createColliderGfx(
		color: Color,
		radius: number,
		scale: number,
	): Graphics {
		const strokeColor = new Color([1, 1, 1, 0.8]);

		return new Graphics()
			.circle(0, 0, radius * scale)
			.fill(color)
			.stroke({ width: 4, color: strokeColor });
	}

	public sync(trajectory: Trajectory) {
		const positions: Vector3[] = [trajectory.target, ...trajectory.others];

		positions.forEach((position, index) => {
			const gfx =
				this.gfxMap.get(index) ??
				(() => {
					const gfx = this.createColliderGfx(
						WorldRenderer.BALL_COLORS[index],
						this.ballRadius,
						this.scale,
					);
					this.gfxMap.set(index, gfx);
					this.container.addChild(gfx);
					return gfx;
				})();

			gfx.position.set(position.x * this.scale, position.z * this.scale);
		});

		for (const [id, gfx] of this.gfxMap) {
			if (id >= positions.length) {
				gfx.destroy();
				this.gfxMap.delete(id);
			}
		}
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

				const renderer = new WorldRenderer(app.stage, SCALE, 0.05715 / 2);

				const count = 4;

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
					0.001,
					{ x: 0.5, y: 0.5 },
				);

				measure(() => {
					for (let i = 0; i < 60 * 10; i++) {
						step();
					}
				}, "Simulation 600 frames");

				renderer.sync(initialTrajactory);

				await sleep(1000);

				// app.ticker.add(() => {
				// 	const trajectory = step();

				// 	renderer.sync(trajectory);
				// });
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
