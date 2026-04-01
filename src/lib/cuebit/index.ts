import { measure, measureAsync } from "@/common";
import type { InferenceSession } from "onnxruntime-web";
import * as ort from "onnxruntime-web/webgpu";

const session = await ort.InferenceSession.create("/best.onnx", {
    executionProviders: ["wasm"],
	// logSeverityLevel: 0,
});

console.log("session created", session);

export interface Prediction {
	dummy: string;
}

/**
 * Float32Array를 내부적으로 재사용하여 Tensor로 변환하기 위한 클래스
 */
class TensorConverter {
	private tensorData: Float32Array;

	constructor(width: number, height: number) {
		this.tensorData = new Float32Array(3 * width * height);
	}

	public convert(frame: Uint8ClampedArray): ort.Tensor {
		// TODO: compute shader 사용해서 최적화
		for (let i = 0; i < 640 * 640; i++) {
			const ptr = i * 4;

			this.tensorData[i] = frame[ptr] / 255.0;
			this.tensorData[i + 640 * 640] = frame[ptr + 1] / 255.0;
			this.tensorData[i + 2 * 640 * 640] = frame[ptr + 2] / 255.0;
		}

		return new ort.Tensor("float32", this.tensorData, [1, 3, 640, 640]);
	}
}

/**
 * 이미지 프로세싱을 담당할 클래스
 */
class Cuebit {
	private tensorConverter: TensorConverter;

	constructor(width: number, height: number) {
		this.tensorConverter = new TensorConverter(width, height);
	}

	public async process(
		frame: Uint8ClampedArray,
	): Promise<InferenceSession.OnnxValueMapType> {
		const tensor = measure(
			() => this.tensorConverter.convert(frame),
			"Tensor Conversion",
		);

		const result = await measureAsync(() =>
			session.run({
				[session.inputNames[0]]: tensor,
			}),
		);

		return result;
	}
}

export default Cuebit;
