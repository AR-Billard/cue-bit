import { measure, measureAsync, todo } from "@/common";

/**
 * 프레임 캡처하는 유틸 생성
 * @param track
 * @returns
 */
async function createFrameCapture(
	signal: AbortSignal,
	track: MediaStreamVideoTrack,
	width: number,
	height: number,
) {
	const processor = new MediaStreamTrackProcessor({
		track,
	});
	const reader = processor.readable.getReader();
	const canvas = new OffscreenCanvas(width, height);
	const context =
		canvas.getContext("2d", {
			willReadFrequently: true,
		}) ?? todo("Failed to get canvas context");

	const frame =
		(await reader.read()).value ?? todo("Failed to read initial frame");
	const frameWidth = frame.displayWidth;
	const frameHeight = frame.displayHeight;
	frame.close();

	const scale = Math.min(width / frameWidth, height / frameHeight);
	const scaledWidth = frameWidth * scale;
	const scaledHeight = frameHeight * scale;
	const offsetX = (width - scaledWidth) / 2;
	const offsetY = (height - scaledHeight) / 2;

	return {
		on: async (callback: (frame: VideoFrame) => Promise<void>) => {
			while (true) {
            // for (let i = 0; i < 1; i++) {
				const { value: frame, done } = await measureAsync(
					() => reader.read(),
					"Read Frame",
				);

				if (signal.aborted || done) {
					frame?.close();
					// return;
					break;
				}

				await callback(frame);
                frame.close();
			}
		},
	};
}

export default createFrameCapture;
