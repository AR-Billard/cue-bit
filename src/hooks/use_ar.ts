import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import logger from "@/lib/logger";
import {
	BALL_RADIUS_M,
	TABLE_HEIGHT_M,
	TABLE_WIDTH_M,
} from "@/lib/physics/physics_constants";
import type { PhysicsResult, Point } from "@/types/physics";

interface UseAROptions {
	arCanvasRef: RefObject<HTMLCanvasElement | null>;
	minimapCanvasRef: RefObject<HTMLCanvasElement | null>;
	containerRef: RefObject<HTMLDivElement | null>;
}

interface UseARReturn {
	isARMode: boolean;
	toggleARMode: () => void;
	drawAR: (result: PhysicsResult | null, options?: DrawAROptions) => void;
}

interface DrawAROptions {
	showMainOverlay?: boolean;
	showMinimap?: boolean;
}

interface PixelPoint {
	x: number;
	y: number;
}

interface TableViewport {
	x: number;
	y: number;
	width: number;
	height: number;
	pixelsPerMeter: number;
}

const BALL_COLORS: Record<string, string> = {
	cueBall: "#ffffff",
	red: "#ff4757",
	yellow: "#ffd700",
};
const FALLBACK_COLOR = "#00e5ff";

function getBallColor(ballId: string): string {
	return BALL_COLORS[ballId] ?? FALLBACK_COLOR;
}

function getTableViewport(canvas: HTMLCanvasElement): TableViewport {
	const pixelsPerMeter = Math.min(
		canvas.width / TABLE_WIDTH_M,
		canvas.height / TABLE_HEIGHT_M,
	);
	const width = TABLE_WIDTH_M * pixelsPerMeter;
	const height = TABLE_HEIGHT_M * pixelsPerMeter;

	return {
		x: (canvas.width - width) / 2,
		y: (canvas.height - height) / 2,
		width,
		height,
		pixelsPerMeter,
	};
}

function toCanvasPoint(point: Point, viewport: TableViewport): PixelPoint {
	return {
		x: viewport.x + point.x * viewport.pixelsPerMeter,
		y: viewport.y + point.y * viewport.pixelsPerMeter,
	};
}

function useAR({
	arCanvasRef,
	minimapCanvasRef,
	containerRef,
}: UseAROptions): UseARReturn {
	const [isARMode, setIsARMode] = useState(false);
	const isARModeRef = useRef(false);

	useEffect(() => {
		const handleResize = () => {
			const canvas = arCanvasRef.current;
			if (canvas && containerRef.current) {
				canvas.width = containerRef.current.clientWidth;
				canvas.height = containerRef.current.clientHeight;
			}
		};
		handleResize();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [arCanvasRef, containerRef]);

	const toggleARMode = useCallback(() => {
		setIsARMode((prev) => {
			const next = !prev;
			isARModeRef.current = next;
			logger.info(next ? "AR mode enabled" : "AR mode disabled");
			return next;
		});
	}, []);

	const drawAR = useCallback(
		(result: PhysicsResult | null, options: DrawAROptions = {}) => {
			const canvas = arCanvasRef.current;
			const minimapCanvas = minimapCanvasRef.current;
			if (!canvas || !minimapCanvas) return;

			const ctx = canvas.getContext("2d");
			const mCtx = minimapCanvas.getContext("2d");
			if (!ctx || !mCtx) return;

			ctx.clearRect(0, 0, canvas.width, canvas.height);
			mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);

			const showMainOverlay = options.showMainOverlay ?? isARModeRef.current;
			const showMinimap = options.showMinimap ?? isARModeRef.current;
			if (!result || (!showMainOverlay && !showMinimap)) return;

			const arViewport = showMainOverlay ? getTableViewport(canvas) : null;
			const minimapViewport = showMinimap
				? getTableViewport(minimapCanvas)
				: null;

			if (minimapViewport) {
				drawTableBounds(mCtx, minimapViewport);
			}

			for (const trajectory of result.trajectories) {
				const color = getBallColor(trajectory.ballId);
				const arWaypoints = arViewport
					? trajectory.waypoints.map((point) =>
							toCanvasPoint(point, arViewport),
						)
					: [];
				const minimapWaypoints = minimapViewport
					? trajectory.waypoints.map((point) =>
							toCanvasPoint(point, minimapViewport),
						)
					: [];

				if (arViewport && arWaypoints.length >= 2) {
					const dashSize = Math.max(6, arViewport.pixelsPerMeter * 0.035);
					drawTrajectoryLine(ctx, arWaypoints, color, {
						dashed: true,
						dashPattern: [dashSize, dashSize],
						lineWidth: 2,
						glow: true,
					});
				}

				if (minimapViewport && minimapWaypoints.length >= 2) {
					const dashSize = Math.max(3, minimapViewport.pixelsPerMeter * 0.04);
					drawTrajectoryLine(mCtx, minimapWaypoints, color, {
						dashed: true,
						dashPattern: [dashSize, dashSize],
						lineWidth: 1,
					});
				}

				if (minimapViewport && minimapWaypoints.length > 0) {
					drawBallPoint(
						mCtx,
						minimapWaypoints[0],
						color,
						Math.max(2.5, minimapViewport.pixelsPerMeter * BALL_RADIUS_M),
						false,
					);
				}
			}
		},
		[arCanvasRef, minimapCanvasRef],
	);

	return { isARMode, toggleARMode, drawAR };
}

function drawTableBounds(
	ctx: CanvasRenderingContext2D,
	viewport: TableViewport,
) {
	ctx.save();
	ctx.strokeStyle = "rgba(0, 229, 255, 0.35)";
	ctx.lineWidth = 1;
	ctx.strokeRect(viewport.x, viewport.y, viewport.width, viewport.height);
	ctx.restore();
}

function drawTrajectoryLine(
	ctx: CanvasRenderingContext2D,
	points: PixelPoint[],
	color: string,
	options: {
		dashed?: boolean;
		dashPattern?: number[];
		lineWidth: number;
		glow?: boolean;
	},
) {
	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = options.lineWidth;
	if (options.dashed) {
		ctx.setLineDash(options.dashPattern || [6, 6]);
	}
	if (options.glow) {
		ctx.shadowBlur = 10;
		ctx.shadowColor = color;
	}

	ctx.beginPath();
	ctx.moveTo(points[0].x, points[0].y);
	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i].x, points[i].y);
	}
	ctx.stroke();
	ctx.restore();
}

function drawBallPoint(
	ctx: CanvasRenderingContext2D,
	point: PixelPoint,
	color: string,
	radius: number,
	glow: boolean,
) {
	ctx.save();
	ctx.beginPath();
	ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
	ctx.fillStyle = color;
	if (glow) {
		ctx.shadowBlur = 10;
		ctx.shadowColor = color;
		ctx.globalAlpha = 0.9;
	}
	ctx.fill();
	ctx.restore();
}

export default useAR;
