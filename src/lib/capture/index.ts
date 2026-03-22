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

    // 프레임 하나 읽어서 실제데이터 크기 계산
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
