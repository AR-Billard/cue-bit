declare module "*.wgsl";

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

type CanvasHandle<T extends keyof ContextMap> = {
	canvas: HTMLCanvasElement;
	draw: (pass: T extends "2d" ? Pass2D : PassWebGPU) => void;
};

/**
 * OpenCV Mat의 JS 복사본
 */
type MatSnapshot = {
  rows: number;
  cols: number;
  type: number;
  data: ArrayBufferLike;
};
