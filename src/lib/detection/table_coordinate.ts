import { TABLE_HEIGHT_M, TABLE_WIDTH_M } from "@/lib/physics/physics_constants";
import type { MeterPoint, Point } from "@/types/physics";

export type PixelPoint = Point;

export interface TableSizeMeters {
	width: number;
	height: number;
}

export interface TableCoordinateMapper {
	pixelToTable(point: PixelPoint): MeterPoint | null;
}

const DEFAULT_TABLE_SIZE: TableSizeMeters = {
	width: TABLE_WIDTH_M,
	height: TABLE_HEIGHT_M,
};

type Homography = [
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
];

function solveLinearSystem(matrix: number[][]): number[] | null {
	const size = 8;

	for (let col = 0; col < size; col++) {
		let pivotRow = col;
		let pivotAbs = Math.abs(matrix[col][col]);

		for (let row = col + 1; row < size; row++) {
			const candidateAbs = Math.abs(matrix[row][col]);
			if (candidateAbs > pivotAbs) {
				pivotAbs = candidateAbs;
				pivotRow = row;
			}
		}

		if (pivotAbs < 1e-10) return null;

		if (pivotRow !== col) {
			[matrix[col], matrix[pivotRow]] = [matrix[pivotRow], matrix[col]];
		}

		const pivot = matrix[col][col];
		for (let item = col; item <= size; item++) {
			matrix[col][item] /= pivot;
		}

		for (let row = 0; row < size; row++) {
			if (row === col) continue;

			const factor = matrix[row][col];
			for (let item = col; item <= size; item++) {
				matrix[row][item] -= factor * matrix[col][item];
			}
		}
	}

	return matrix.map((row) => row[size]);
}

function createPixelToTableHomography(
	corners: readonly PixelPoint[],
	tableSize: TableSizeMeters,
): Homography | null {
	if (corners.length !== 4) return null;

	const destinationCorners: MeterPoint[] = [
		{ x: 0, y: 0 },
		{ x: tableSize.width, y: 0 },
		{ x: tableSize.width, y: tableSize.height },
		{ x: 0, y: tableSize.height },
	];
	const matrix: number[][] = [];

	for (let index = 0; index < 4; index++) {
		const source = corners[index];
		const destination = destinationCorners[index];

		matrix.push([
			source.x,
			source.y,
			1,
			0,
			0,
			0,
			-destination.x * source.x,
			-destination.x * source.y,
			destination.x,
		]);
		matrix.push([
			0,
			0,
			0,
			source.x,
			source.y,
			1,
			-destination.y * source.x,
			-destination.y * source.y,
			destination.y,
		]);
	}

	const solution = solveLinearSystem(matrix);
	if (!solution) return null;

	return [
		solution[0],
		solution[1],
		solution[2],
		solution[3],
		solution[4],
		solution[5],
		solution[6],
		solution[7],
		1,
	];
}

function applyHomography(
	point: PixelPoint,
	homography: Homography,
): MeterPoint | null {
	const denominator =
		homography[6] * point.x + homography[7] * point.y + homography[8];
	if (Math.abs(denominator) < 1e-10) return null;

	return {
		x:
			(homography[0] * point.x + homography[1] * point.y + homography[2]) /
			denominator,
		y:
			(homography[3] * point.x + homography[4] * point.y + homography[5]) /
			denominator,
	};
}

export function createTableCoordinateMapper(
	corners: readonly PixelPoint[],
	tableSize: TableSizeMeters = DEFAULT_TABLE_SIZE,
): TableCoordinateMapper | null {
	const homography = createPixelToTableHomography(corners, tableSize);
	if (!homography) return null;

	return {
		pixelToTable: (point) => applyHomography(point, homography),
	};
}

export function pixelToTableMeters(
	point: PixelPoint,
	corners: readonly PixelPoint[],
	tableSize: TableSizeMeters = DEFAULT_TABLE_SIZE,
): MeterPoint | null {
	return (
		createTableCoordinateMapper(corners, tableSize)?.pixelToTable(point) ?? null
	);
}
