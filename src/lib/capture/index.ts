import { measure } from "@/common";

/**
 * 프레임 캡처하는 유틸 생성
 * @param track
 * @returns
 */
async function createFrameCapture(
	signal: AbortSignal,
	track: MediaStreamVideoTrack,
) {
	const processor = new MediaStreamTrackProcessor({
		track,
	});
	const reader = processor.readable.getReader();

	return {
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
