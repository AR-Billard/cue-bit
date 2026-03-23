import { useState, useEffect, useCallback, useRef } from "react";
import type { RefObject } from "react";
import createFrameCapture from "@/lib/capture";
import { getOpenCv } from "@/lib/opencv";
import Cuebit from "@/lib/cuebit";
import type { DebugView } from "@/lib/cuebit";
import { todo } from "@/common";
import type { PhysicsResult } from "@/types/physics";
import logger from "@/lib/logger";

interface UseCameraOptions {
    videoCanvasRef: RefObject<HTMLCanvasElement | null>;
    debugView: DebugView;
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
 * debugView 값에 따라 화면에 표시되는 이미지가 바뀜:
 *   original → 원본 카메라
 *   hsv      → HSV 변환
 *   mask     → 마스킹 결과
 *   contour  → 컨투어 검출
 */
function useCamera({ videoCanvasRef, debugView, onFrame }: UseCameraOptions): UseCameraReturn {
    const [cvLoaded, setCvLoaded] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // debugView, onFrame이 바뀌어도 프레임 루프를 재시작하지 않기 위해 ref로 관리
    const debugViewRef = useRef<DebugView>(debugView);
    useEffect(() => {
        debugViewRef.current = debugView;
    }, [debugView]);

    const onFrameRef = useRef(onFrame);
    useEffect(() => {
        onFrameRef.current = onFrame;
    }, [onFrame]);

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
                logger.info("카메라 스트림 요청 중...");
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        width: 1000,
                        height: 1000,
                        facingMode: { ideal: "environment" },
                    },
                });
                logger.info("카메라 스트림 획득 완료");

                const [track] = stream.getVideoTracks();
                const frameCapture = await createFrameCapture(ac.signal, track);
                logger.debug(
                    `프레임 캡처 생성 완료 — ${frameCapture.width}x${frameCapture.height}`,
                );

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

                logger.info("OpenCV 초기화 중...");
                await getOpenCv();
                setCvLoaded(true);
                logger.info("OpenCV 초기화 완료");

                const cuebit = new Cuebit(frameCapture.width, frameCapture.height);
                logger.debug("Cuebit 인스턴스 생성 완료");

                logger.info("프레임 루프 시작");
                await frameCapture.on(async (frame) => {
                    await frame.copyTo(buffer, {
                        format: "RGBA",
                        layout: [{ offset: 0, stride: frameCapture.width * 4 }],
                    });

                    // Cuebit으로 프레임 처리 — 단계별 이미지 + 공 위치 반환
                    const { frames, ballPos } = cuebit.process(buffer);

                    // 현재 선택된 디버그 뷰에 맞는 이미지를 화면에 표시
                    drawer.draw(frames[debugViewRef.current]);

                    // 공이 감지되면 PhysicsResult 구성해서 전달
                    if (!ballPos) {
                        onFrameRef.current(null);
                        return;
                    }

                    logger.debug(`공 감지 — x:${ballPos.x.toFixed(0)}, y:${ballPos.y.toFixed(0)}`);

                    // TODO: 물리엔진 완성되면 여기서 physicsEngine.simulate() 호출
                    const tempResult: PhysicsResult = {
                        trajectories: [{
                            ballId: "red",
                            path: [{ x: ballPos.x, y: ballPos.y }],
                            cushionPoints: [],
                        }],
                    };
                    onFrameRef.current(tempResult);
                });

                logger.info("프레임 루프 종료");
                cuebit.destroy();
                logger.debug("Cuebit 메모리 해제 완료");
            } catch (err) {
                logger.error({ err }, "카메라 시작 에러");
                setErrorMsg(
                    "카메라 또는 AI 엔진을 켜지 못했습니다. HTTPS 배포 환경에서 테스트해주세요.",
                );
            }
        };

        startCamera();
        return () => {
            logger.info("카메라 스트림 종료 (컴포넌트 언마운트)");
            ac.abort();
        };
    }, [createFrameDrawer, videoCanvasRef]); // onFrame, debugView는 ref로 관리하므로 의존성에서 제외

    return { cvLoaded, errorMsg };
}

export default useCamera;