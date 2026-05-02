declare module "*.wgsl";

type ContextMap = {
	"2d": CanvasRenderingContext2D;
	webgpu: GPUCanvasContext;
};

type CanvasHandle<T extends keyof ContextMap> = {
	canvas: HTMLCanvasElement;
	context: ContextMap[T];
};
