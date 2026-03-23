import { useState, useEffect, useCallback } from "react";
import type { RefObject } from "react";
import createFrameCapture from "@/lib/capture";
import { getOpenCv } from "@/lib/opencv";
import Cuebit from "@/lib/cuebit";
import { todo } from "@/common";
import type { PhysicsResult } from "@/types/physics";

interface UseCameraOptions {
    videoCanvasRef: RefObject<HTMLCanvasElement | null>;
    onFrame: (result: PhysicsResult | null) => void;
}

interface UseCameraReturn {
    cvLoaded: boolean;
    errorMsg: string;
}

/**
 * 카메라 스트림을 열고, 매 프레임마다 OpenCV로 처리한 뒤
 * onFrame 콜백으로 PhysicsResult를 전달하는 훅.
 *
 * 현재 팀 레포의 Cuebit.process()는 Uint8ClampedArray를 반환합니다.
 * 공 감지 로직이 Cuebit에 추가되면 아래 TODO 부분을 교체하면 됩니다.
 */
function useCamera({ videoCanvasRef, onFrame }: UseCameraOptions): UseCameraReturn {
    const [cvLoaded, setCvLoaded] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const createFrameDrawer = useCallback(
        (canvas: HTMLCanvasElement, width: number, height: number) => {
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) {
                throw new Error("Failed to get canvas context");
            }
            return {
                draw: (data: Uint8ClampedArray<ArrayBuffer>) => {
                    context.putImageData(
                        new ImageData(data, canvas.width, canvas.height),
                        0,
                        0,
                    );
                },
            };
        },
        [],
    );

    useEffect(() => {
        const ac = new AbortController();

        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        width: 1000,
                        height: 1000,
                        facingMode: { ideal: "environment" },
                    },
                });

                const [track] = stream.getVideoTracks();
                const frameCapture = await createFrameCapture(ac.signal, track);
                const buffer = new Uint8ClampedArray(
                    frameCapture.width * frameCapture.height * 4,
                );

                const canvas: HTMLCanvasElement =
                    videoCanvasRef.current ?? todo("canvas가 없음");
                const drawer = createFrameDrawer(
                    canvas,
                    frameCapture.width,
                    frameCapture.height,
                );

                await getOpenCv();
                setCvLoaded(true);

                const cuebit = new Cuebit(frameCapture.width, frameCapture.height);

                await frameCapture.on(async (frame) => {
                    await frame.copyTo(buffer, {
                        format: "RGBA",
                        layout: [{ offset: 0, stride: frameCapture.width * 4 }],
                    });

                    // Cuebit으로 프레임 처리 (현재는 HSV 변환 결과 반환)
                    cuebit.process(buffer);

                    // 원본 카메라 영상을 화면에 표시
                    drawer.draw(buffer);

                    // TODO: Cuebit에 공 감지 로직이 추가되면 여기서 결과를 받아서 처리
                    // 예시:
                    // const { ballPos } = cuebit.process(buffer);
                    // if (!ballPos) { onFrame(null); return; }
                    // const physicsResult: PhysicsResult = {
                    //     trajectories: [{
                    //         ballId: "red",
                    //         path: [{ x: ballPos.x, y: ballPos.y }],
                    //         cushionPoints: [],
                    //     }],
                    // };
                    // onFrame(physicsResult);

                    // 현재는 공 감지 없이 null 전달
                    onFrame(null);
                });
            } catch (err) {
                console.error("카메라 시작 에러:", err);
                setErrorMsg(
                    "카메라 또는 AI 엔진을 켜지 못했습니다. HTTPS 배포 환경에서 테스트해주세요.",
                );
            }
        };

        startCamera();
        return () => {
            ac.abort();
        };
    }, [createFrameDrawer, videoCanvasRef, onFrame]);

    return { cvLoaded, errorMsg };
}

export default useCamera;