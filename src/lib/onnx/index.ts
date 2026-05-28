import * as ort from "onnxruntime-web/webgpu";
import { todo } from "@/common";
import logger from "@/lib/logger";

/**
 * Segmentation ONNX 세션 정보
 */
interface ONNXSegmentationSession {
	session: ort.InferenceSession;
	input: {
		feeds: {
			/**
			 * ONNX 모델의 입력 피드 이름
			 */
			image: {
				name: string;
				channel: number;
				width: number;
				height: number;
				size: number;
				shape: [1, number, number, number];
			};
		};
	};
	output: {
		fetchs: {
			/**
			 * ONNX 모델의 output0 피드. 객체 감지 결과를 담고있음
			 */
			detections: {
				name: string;
				count: number;
				stride: number;
				size: number;
				shape: [1, number, number];
			};
			/**
			 * ONNX 모델의 output1 피드. 객체의 프로토타입 마스크 정보를 담고있음
			 */
			protos: {
				name: string;
				count: number;
				width: number;
				height: number;
				size: number;
				shape: [1, number, number, number];
			};
		};
	};
}

interface ONNX {
	segementation: ONNXSegmentationSession;
}

/**
 * Segmentation 모델 파싱
 * @param session
 * @returns
 */
function parseSegmentationSession(
	session: ort.InferenceSession,
): ONNXSegmentationSession {
	const inputMeta = session.inputMetadata[0];

	if (!inputMeta.isTensor) {
		return todo<ONNXSegmentationSession>("input is not a tensor");
	}

	const [inputChannel, inputWidth, inputHeight] = [
		inputMeta.shape[1],
		inputMeta.shape[2],
		inputMeta.shape[3],
	];

	if (
		typeof inputChannel !== "number" ||
		typeof inputWidth !== "number" ||
		typeof inputHeight !== "number"
	) {
		return todo<ONNXSegmentationSession>(
			"input channel, width or height is undefined",
		);
	}

	const [detections, protos] = [
		session.outputMetadata[0],
		session.outputMetadata[1],
	];

	if (!detections.isTensor || !protos.isTensor) {
		return todo<ONNXSegmentationSession>("output is not a tensor");
	}

	const [detectionCount, detectionStride] = [
		detections.shape[1],
		detections.shape[2],
	];

	if (
		typeof detectionCount !== "number" ||
		typeof detectionStride !== "number"
	) {
		return todo<ONNXSegmentationSession>(
			"detection count or stride is undefined",
		);
	}

	const [protoCount, protoWidth, protoHeight] = [
		protos.shape[1],
		protos.shape[2],
		protos.shape[3],
	];

	if (
		typeof protoCount !== "number" ||
		typeof protoWidth !== "number" ||
		typeof protoHeight !== "number"
	) {
		return todo<ONNXSegmentationSession>(
			"proto count, width or height is undefined",
		);
	}

	return {
		session,
		input: {
			feeds: {
				image: {
					name: inputMeta.name,
					channel: inputChannel,
					width: inputWidth,
					height: inputHeight,
					size: inputChannel * inputWidth * inputHeight,
					shape: [1, inputChannel, inputWidth, inputHeight],
				},
			},
		},
		output: {
			fetchs: {
				detections: {
					name: detections.name,
					count: detectionCount,
					stride: detectionStride,
					size: detectionCount * detectionStride,
					shape: [1, detectionCount, detectionStride],
				},
				protos: {
					name: protos.name,
					count: protoCount,
					width: protoWidth,
					height: protoHeight,
					size: protoCount * protoWidth * protoHeight,
					shape: [1, protoCount, protoWidth, protoHeight],
				},
			},
		},
	};
}

const onnx: ONNX = {
	segementation: parseSegmentationSession(
		// await ort.InferenceSession.create("/backup/seg32.onnx", {
		await ort.InferenceSession.create("/models/ball table cue/best.onnx", {
			executionProviders: ["webgpu"],
			// logSeverityLevel: 0,
		}),
	),
};

logger.info("ONNX Segmentation Session 생성");
logger.debug(`Session details: ${JSON.stringify(onnx.segementation, null, 2)}`);

// 사용중인 WebGPU 디바이스
const device = await ort.env.webgpu.device;

// 어댑터 정보 출력 (디버깅 용도)
const adapter = await navigator.gpu.requestAdapter();
logger.info(
	adapter
		? [
				`WebGPU Architecture: ${adapter.info.architecture}`,
				`WebGPU Vendor: ${adapter.info.vendor}`,
				`WebGPU Device: ${adapter.info.device}`,
				`isFallbackAdapter: ${adapter.info.isFallbackAdapter}`,
			].join("\n")
		: "WebGPU Adapter를 찾을 수 없음",
);

export { device, type ONNX, type ONNXSegmentationSession as ONNXSession, onnx };
