import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import createFrameCapture from "@/lib/capture";
import {
	createCameraDetectedState,
	type CameraDetectedStateUiInput,
} from "@/lib/detection/camera_detected_state";
import {
	createMockCameraDetectionResult,
	detectCameraFrame,
	type CameraDetectionResult,
} from "@/lib/detection/camera_detector";
import {
	createDevDetectedState,
	type DevDetectedStateInput,
} from "@/lib/detection/dev_detected_state";
import logger from "@/lib/logger";
import type { DetectedState } from "@/types/detection";

export type DetectionMode = "camera" | "simulator";

interface UseCameraOptions {
	videoCanvasRef: RefObject<HTMLCanvasElement | null>;
	onFrame: (detected: DetectedState | null) => void;
	inputSource: DetectionMode;
	cameraUiInput: CameraDetectedStateUiInput;
	simulatorInput: DevDetectedStateInput;
}

interface UseCameraReturn {
	cameraReady: boolean;
	errorMsg: string;
}

function getCanvasFrameSize(canvas: HTMLCanvasElement): {
	width: number;
	height: number;
} {
	const rect = canvas.getBoundingClientRect();
	const devicePixelRatio = window.devicePixelRatio || 1;

	return {
		width: Math.max(
			1,
			Math.round((rect.width || window.innerWidth) * devicePixelRatio),
		),
		height: Math.max(
			1,
			Math.round((rect.height || window.innerHeight) * devicePixelRatio),
		),
	};
}

function clearVideoCanvas(canvas: HTMLCanvasElement) {
	const { width, height } = getCanvasFrameSize(canvas);
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}

	const context = canvas.getContext("2d");
	if (!context) return;

	context.clearRect(0, 0, width, height);
}

function useCamera({
	videoCanvasRef,
	onFrame,
	inputSource,
	cameraUiInput,
	simulatorInput,
}: UseCameraOptions): UseCameraReturn {
	const [cameraReady, setCameraReady] = useState(false);
	const [errorMsg, setErrorMsg] = useState("");

	const onFrameRef = useRef(onFrame);
	useEffect(() => {
		onFrameRef.current = onFrame;
	}, [onFrame]);

	const cameraUiInputRef = useRef(cameraUiInput);
	useEffect(() => {
		cameraUiInputRef.current = cameraUiInput;
	}, [cameraUiInput]);

	const simulatorInputRef = useRef(simulatorInput);
	useEffect(() => {
		simulatorInputRef.current = simulatorInput;
	}, [simulatorInput]);

	const createFrameDrawer = useCallback(
		(canvas: HTMLCanvasElement, width: number, height: number) => {
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Failed to get canvas context");

			return {
				draw: (data: Uint8ClampedArray<ArrayBuffer>) => {
					context.putImageData(new ImageData(data, width, height), 0, 0);
				},
			};
		},
		[],
	);

	useEffect(() => {
		const ac = new AbortController();
		let rAFId: number | undefined;
		let activeStream: MediaStream | undefined;

		setCameraReady(false);
		setErrorMsg("");

		const emitCameraResult = (cameraResult: CameraDetectionResult | null) => {
			onFrameRef.current(
				cameraResult
					? createCameraDetectedState(cameraResult, cameraUiInputRef.current)
					: null,
			);
		};

		const startSimulatorSource = () => {
			setCameraReady(true);
			logger.info("Running simulator input source");
			if (videoCanvasRef.current) {
				clearVideoCanvas(videoCanvasRef.current);
			}

			const loop = () => {
				if (ac.signal.aborted) return;
				onFrameRef.current(createDevDetectedState(simulatorInputRef.current));
				rAFId = requestAnimationFrame(loop);
			};
			rAFId = requestAnimationFrame(loop);
		};

		const startMockCameraSource = () => {
			setCameraReady(true);
			logger.info("[DEV] Running mock camera input source");

			const loop = () => {
				if (ac.signal.aborted) return;

				const canvas = videoCanvasRef.current;
				const frameSize = canvas
					? getCanvasFrameSize(canvas)
					: { width: 1280, height: 720 };
				const cameraResult = createMockCameraDetectionResult(frameSize);
				if (canvas) clearVideoCanvas(canvas);
				emitCameraResult(cameraResult);
				rAFId = requestAnimationFrame(loop);
			};
			rAFId = requestAnimationFrame(loop);
		};

		const startCameraSource = async () => {
			try {
				logger.info("Requesting camera stream");
				activeStream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: {
						width: { ideal: 1920 },
						height: { ideal: 1080 },
						facingMode: { ideal: "environment" },
					},
				});
				if (ac.signal.aborted) return;

				const [track] = activeStream.getVideoTracks();
				const frameCapture = await createFrameCapture(ac.signal, track);
				if (ac.signal.aborted) return;

				const buffer = new Uint8ClampedArray(
					frameCapture.width * frameCapture.height * 4,
				);
				const canvas = videoCanvasRef.current;
				if (!canvas) throw new Error("Video canvas not found");

				const drawer = createFrameDrawer(
					canvas,
					frameCapture.width,
					frameCapture.height,
				);
				setCameraReady(true);

				await frameCapture.on(async (frame) => {
					await frame.copyTo(buffer, {
						format: "RGBA",
						layout: [{ offset: 0, stride: frameCapture.width * 4 }],
					});
					drawer.draw(buffer);

					const cameraResult = await detectCameraFrame({
						width: frameCapture.width,
						height: frameCapture.height,
						rgba: buffer,
						timestampMs: frame.timestamp / 1000,
					});
					emitCameraResult(cameraResult);
				});
			} catch (err) {
				if (ac.signal.aborted) return;

				logger.error({ err }, "Failed to start camera");
				setCameraReady(false);
				setErrorMsg(
					"\uce74\uba54\ub77c \uad8c\ud55c\uc744 \ud655\uc778\ud574\uc8fc\uc138\uc694.",
				);
			}
		};

		if (inputSource === "simulator") {
			startSimulatorSource();
		} else if (import.meta.env.DEV) {
			startMockCameraSource();
		} else {
			startCameraSource();
		}

		return () => {
			ac.abort();
			if (rAFId !== undefined) cancelAnimationFrame(rAFId);
			activeStream?.getTracks().forEach((track) => track.stop());
		};
	}, [createFrameDrawer, inputSource, videoCanvasRef]);

	return { cameraReady, errorMsg };
}

export default useCamera;
