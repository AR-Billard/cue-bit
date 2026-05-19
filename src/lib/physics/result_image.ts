import type { PhysicsResult, Point } from "@/types/physics";
import {
	BALL_RADIUS_M,
	TABLE_HEIGHT_M,
	TABLE_WIDTH_M,
} from "./physics_constants";

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

export interface PhysicsResultImageOptions {
	width?: number;
	height?: number;
	background?: string | null;
	mimeType?: "image/png" | "image/jpeg" | "image/webp";
	quality?: number;
	drawTableBounds?: boolean;
	drawBallStarts?: boolean;
	glow?: boolean;
	lineWidth?: number;
}

const DEFAULT_IMAGE_WIDTH = 960;
const DEFAULT_IMAGE_HEIGHT = 480;
const DEFAULT_BACKGROUND = "rgba(0, 0, 0, 0)";
const BALL_COLORS: Record<string, string> = {
	cueBall: "#ffffff",
	red: "#ff4757",
	yellow: "#ffd700",
};
const FALLBACK_COLOR = "#00e5ff";

function getBallColor(ballId: string): string {
	return BALL_COLORS[ballId] ?? FALLBACK_COLOR;
}

function getTableViewport(width: number, height: number): TableViewport {
	const pixelsPerMeter = Math.min(
		width / TABLE_WIDTH_M,
		height / TABLE_HEIGHT_M,
	);
	const tableWidth = TABLE_WIDTH_M * pixelsPerMeter;
	const tableHeight = TABLE_HEIGHT_M * pixelsPerMeter;

	return {
		x: (width - tableWidth) / 2,
		y: (height - tableHeight) / 2,
		width: tableWidth,
		height: tableHeight,
		pixelsPerMeter,
	};
}

function toCanvasPoint(point: Point, viewport: TableViewport): PixelPoint {
	return {
		x: viewport.x + point.x * viewport.pixelsPerMeter,
		y: viewport.y + point.y * viewport.pixelsPerMeter,
	};
}

export function drawPhysicsResultImage(
	ctx: CanvasRenderingContext2D,
	result: PhysicsResult,
	options: PhysicsResultImageOptions = {},
): void {
	const width = ctx.canvas.width;
	const height = ctx.canvas.height;
	const viewport = getTableViewport(width, height);
	const background = options.background ?? DEFAULT_BACKGROUND;

	ctx.clearRect(0, 0, width, height);
	if (background) {
		ctx.fillStyle = background;
		ctx.fillRect(0, 0, width, height);
	}

	if (options.drawTableBounds ?? false) {
		drawTableBounds(ctx, viewport);
	}

	for (const trajectory of result.trajectories) {
		const color = getBallColor(trajectory.ballId);
		const points = trajectory.waypoints.map((point) =>
			toCanvasPoint(point, viewport),
		);

		if (points.length >= 2) {
			drawTrajectoryLine(ctx, points, color, viewport.pixelsPerMeter, {
				glow: options.glow ?? true,
				lineWidth: options.lineWidth ?? 2,
			});
		}

		if ((options.drawBallStarts ?? false) && points.length > 0) {
			drawBallPoint(
				ctx,
				points[0],
				color,
				Math.max(4, viewport.pixelsPerMeter * BALL_RADIUS_M),
			);
		}
	}
}

export function getImage(
	result: PhysicsResult,
	options: PhysicsResultImageOptions = {},
): string {
	if (typeof document === "undefined") {
		throw new Error("getImage() can only be used in a browser environment.");
	}

	const canvas = document.createElement("canvas");
	canvas.width = options.width ?? DEFAULT_IMAGE_WIDTH;
	canvas.height = options.height ?? DEFAULT_IMAGE_HEIGHT;

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Failed to create 2D canvas context.");
	}

	drawPhysicsResultImage(ctx, result, options);
	return canvas.toDataURL(options.mimeType ?? "image/png", options.quality);
}

function drawTableBounds(
	ctx: CanvasRenderingContext2D,
	viewport: TableViewport,
): void {
	ctx.save();
	ctx.strokeStyle = "rgba(0, 229, 255, 0.45)";
	ctx.lineWidth = 1;
	ctx.strokeRect(viewport.x, viewport.y, viewport.width, viewport.height);
	ctx.restore();
}

function drawTrajectoryLine(
	ctx: CanvasRenderingContext2D,
	points: PixelPoint[],
	color: string,
	pixelsPerMeter: number,
	options: {
		glow: boolean;
		lineWidth: number;
	},
): void {
	const dashSize = Math.max(6, pixelsPerMeter * 0.035);

	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = options.lineWidth;
	ctx.setLineDash([dashSize, dashSize]);
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
): void {
	ctx.save();
	ctx.beginPath();
	ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
	ctx.fillStyle = color;
	ctx.shadowBlur = 8;
	ctx.shadowColor = color;
	ctx.globalAlpha = 0.95;
	ctx.fill();
	ctx.restore();
}
