import * as ort from "onnxruntime-web/webgpu";

const session = await ort.InferenceSession.create("/best16.onnx", {
	executionProviders: ["webgpu"],
	// logSeverityLevel: 0,
});
console.log("session created", session);

const device = await ort.env.webgpu.device;

const adapter = await navigator.gpu.requestAdapter();
console.log(adapter?.info);

export { session, device };
