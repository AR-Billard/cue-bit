import { measure } from "@/common";

export interface FrameInfo {
	readonly width: number;
	readonly height: number;
}

export interface FrameCapture {
	readonly frameInfo: FrameInfo;
	readonly on: (
		callback: (frame: VideoFrame) => Promise<void>,
	) => Promise<void>;
}

/**
 * 프레임 캡처하는 유틸 생성
 * @param track
 * @returns
 */
async function createFrameCapture(
	signal: AbortSignal,
	track: MediaStreamVideoTrack,
): Promise<FrameCapture> {
	const processor = new MediaStreamTrackProcessor({
		track,
	});
	const reader = processor.readable.getReader();

	// 실제 프레임 크기를 얻기 위해 첫 프레임을 미리 읽음
	const { value: firstFrame } = await reader.read();
	if (!firstFrame) {
		throw new Error("첫 프레임을 읽지 못함");
	}
	const width = firstFrame.displayWidth;
	const height = firstFrame.displayHeight;
	firstFrame.close();

	const frameInfo: FrameInfo = {
		width,
		height,
	};

	return {
		frameInfo,
		on: async (callback: (frame: VideoFrame) => Promise<void>) => {
			while (true) {
				const { value: frame, done } = await measure(
					() => reader.read(),
					"Read Frame",
				);

				if (signal.aborted || done) {
					console.log("Frame capture stopped.");
					console.log("Aborted:", signal.aborted, "Done:", done);
					frame?.close();

					break;
				}

				await callback(frame);
				frame.close();
			}
		},
	};
}

export default createFrameCapture;
