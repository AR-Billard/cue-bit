/**
 * MediaStreamTrackProcessor를 사용하여 비디오 트랙에서 프레임을 캡처하는 유틸리티
 */
async function createFrameCapture(
	signal: AbortSignal,
	track: MediaStreamVideoTrack,
) {
	const processor = new MediaStreamTrackProcessor({
		track,
	});
	const reader = processor.readable.getReader();

	// 초기 프레임을 읽어 크기 및 할당 사이즈 결정
	const { value: frame, done } = await reader.read();
	if (done || !frame) {
		throw new Error("Failed to read video frame");
	}
	const allocationSize = frame.allocationSize({ format: "RGBA" });
	const [width, height] = [frame.codedWidth, frame.codedHeight];
	frame.close();

	return {
		width,
		height,
		allocationSize,
		/**
		 * 유입되는 각 비디오 프레임을 처리할 콜백 등록
		 */
		on: async (callback: (frame: VideoFrame) => Promise<void>) => {
			while (!signal.aborted) {
				const { value: frame, done } = await reader.read();
				if (done) {
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
