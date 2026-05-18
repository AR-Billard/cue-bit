import { TABLE_HEIGHT_M, TABLE_WIDTH_M } from "@/lib/physics/physics_constants";
import { pixelToTableMeters, type PixelPoint } from "./table_coordinate";

export interface CameraDetectionResult {
	table: {
		/** Four billiards-table corners in screen pixel coordinates. */
		corners: PixelPoint[];
	};
	balls: {
		id: string;
		/** Ball x position in billiards-table meter coordinates. */
		tableX: number;
		/** Ball y position in billiards-table meter coordinates. */
		tableY: number;
	}[];
	cue: {
		/** Cue-stick angle calculated from camera/mock detection. */
		angleDeg: number;
	};
}

export interface CameraFrameInput {
	width: number;
	height: number;
	rgba?: Uint8ClampedArray;
	timestampMs?: number;
}

interface MockBallPixelRatio {
	id: string;
	x: number;
	y: number;
}

interface MockCameraScene {
	tableBoundsRatio: {
		left: number;
		right: number;
		top: number;
		bottom: number;
	};
	balls: MockBallPixelRatio[];
	cueAngleDeg: number;
}

const MOCK_CAMERA_SCENE: MockCameraScene = {
	tableBoundsRatio: {
		left: 0.12,
		right: 0.88,
		top: 0.18,
		bottom: 0.82,
	},
	balls: [
		{ id: "white", x: 0.57 / TABLE_WIDTH_M, y: 1.07 / TABLE_HEIGHT_M },
		{ id: "red", x: 1 / TABLE_WIDTH_M, y: 0.71 / TABLE_HEIGHT_M },
		{ id: "yellow", x: 1.23 / TABLE_WIDTH_M, y: 0.36 / TABLE_HEIGHT_M },
	],
	cueAngleDeg: 315,
};

function createMockTableCorners(
	width: number,
	height: number,
	scene: MockCameraScene,
): PixelPoint[] {
	const { tableBoundsRatio } = scene;
	const left = width * tableBoundsRatio.left;
	const right = width * tableBoundsRatio.right;
	const top = height * tableBoundsRatio.top;
	const bottom = height * tableBoundsRatio.bottom;

	return [
		{ x: left, y: top },
		{ x: right, y: top },
		{ x: right, y: bottom },
		{ x: left, y: bottom },
	];
}

function ratioToPixelPoint(
	ratio: MockBallPixelRatio,
	corners: readonly PixelPoint[],
): PixelPoint {
	const topLeft = corners[0];
	const topRight = corners[1];
	const bottomRight = corners[2];
	const bottomLeft = corners[3];
	const u = ratio.x;
	const v = ratio.y;

	return {
		x:
			topLeft.x * (1 - u) * (1 - v) +
			topRight.x * u * (1 - v) +
			bottomRight.x * u * v +
			bottomLeft.x * (1 - u) * v,
		y:
			topLeft.y * (1 - u) * (1 - v) +
			topRight.y * u * (1 - v) +
			bottomRight.y * u * v +
			bottomLeft.y * (1 - u) * v,
	};
}

function toCameraBall(
	ball: MockBallPixelRatio,
	corners: readonly PixelPoint[],
): CameraDetectionResult["balls"][number] | null {
	const tablePoint = pixelToTableMeters(
		ratioToPixelPoint(ball, corners),
		corners,
	);
	if (!tablePoint) return null;

	return {
		id: ball.id,
		tableX: tablePoint.x,
		tableY: tablePoint.y,
	};
}

export function createMockCameraDetectionResult(
	frame: Partial<CameraFrameInput> = {},
): CameraDetectionResult {
	const width = frame.width ?? 1280;
	const height = frame.height ?? 720;
	const scene = MOCK_CAMERA_SCENE;
	const corners = createMockTableCorners(width, height, scene);
	const balls = scene.balls.map((ball) => {
		const cameraBall = toCameraBall(ball, corners);
		if (cameraBall) return cameraBall;

		return {
			id: ball.id,
			tableX: ball.x * TABLE_WIDTH_M,
			tableY: ball.y * TABLE_HEIGHT_M,
		};
	});

	return {
		table: {
			corners,
		},
		balls,
		cue: {
			angleDeg: scene.cueAngleDeg,
		},
	};
}

export async function detectFromVideoFrame(
	_frame: CameraFrameInput,
): Promise<CameraDetectionResult | null> {
	// TODO: Connect YOLO/ONNXRuntime here.
	// Return CameraDetectionResult with:
	// - table.corners in screen pixel coordinates
	// - balls in table meter coordinates
	// - cue.angleDeg calculated from the detected cue stick
	return null;
}

export async function detectCameraFrame(
	frame: CameraFrameInput,
): Promise<CameraDetectionResult | null> {
	const detected = await detectFromVideoFrame(frame);
	return detected ?? createMockCameraDetectionResult(frame);
}
