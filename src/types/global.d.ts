import type { Quaternion, Vector3 } from "@dimforge/rapier3d";

declare module "*.wgsl";

declare global {
	type ContextMap = {
		"2d": CanvasRenderingContext2D;
		webgpu: GPUCanvasContext;
	};

	type Pass2D = (
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
	) => void;

	type PassWebGPU = (
		device: GPUDevice,
		context: GPUCanvasContext,
		width: number,
		height: number,
	) => void;

	type CanvasSpec = {
		width: number;
		height: number;
		onMount: (canvas: HTMLCanvasElement) => void;
	};

	type CanvasHandle<T extends keyof ContextMap> = {
		canvas: HTMLCanvasElement;
		draw: (pass: T extends "2d" ? Pass2D : PassWebGPU) => void;
	};

	/**
	 * OpenCV Mat의 JS 복사본
	 */
	type MatSnapshot = {
		readonly rows: number;
		readonly cols: number;
		readonly type: number;
		readonly data: ArrayBufferLike;
	};

	type Vector2 = {
		readonly x: number;
		readonly y: number;
	};

	type BallSnapshot = {
		readonly position: Vector3;
		readonly rotation: Quaternion;
		readonly linvel: Vector3;
		readonly angvel: Vector3;
		readonly radius: number;
		readonly collided: boolean;
	};

	type Trajectory = {
		readonly cueBall: BallSnapshot;
		readonly objectBalls: BallSnapshot[];
	};
}
