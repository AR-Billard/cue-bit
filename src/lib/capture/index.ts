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
		on: async (callback: (frame: Uint8ClampedArray) => Promise<void>) => {
			while (true) {
				const { value: frame, done } = await measureAsync(
					() => reader.read(),
					"Read Frame",
				);

				if (signal.aborted || done) {
					frame?.close();
                    // return;
					break;
				}

				measure(
					() => (context.fillStyle = "rgb(114, 114, 114)"),
					"Fill Style Set",
				);
				measure(() => context.fillRect(0, 0, width, height), "Fill Rect");
				measure(
					() =>
						context.drawImage(
							frame,
							0,
							0,
							frameWidth,
							frameHeight,
							offsetX,
							offsetY,
							scaledWidth,
							scaledHeight,
						),
					"Draw Image",
				);
				const data = measure(
					() => context.getImageData(0, 0, width, height),
					"Get Image Data",
				);

				await measureAsync(() => callback(data.data), "Process Callback");
				measure(() => frame.close(), "Close Frame");
			}
		},
	};
}

export default createFrameCapture;
