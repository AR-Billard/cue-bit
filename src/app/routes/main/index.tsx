import { useRef, useCallback, useState } from "react";
import type { PhysicsResult } from "@/types/physics";
import type { DebugView } from "@/lib/cuebit";
import useCamera from "@/hooks/useCamera";
import useAR from "@/hooks/useAR";
import ARButton from "@/components/ARButton/ARButton";
import ModeToggle from "@/components/ModeToggle/ModeToggle";
import Minimap from "@/components/Minimap/Minimap";
import DebugViewToggle from "@/components/DebugViewToggle/DebugViewToggle";
import styles from "./Main.module.css";

type BilliardMode = "3구" | "4구";

function Main() {
    const videoCanvasRef = useRef<HTMLCanvasElement>(null);
    const arCanvasRef = useRef<HTMLCanvasElement>(null);
    const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [mode, setMode] = useState<BilliardMode>("4구");
    const [debugView, setDebugView] = useState<DebugView>("original");

    const { isARMode, toggleARMode, handlePointerEvent, drawAR } = useAR({
        arCanvasRef,
        minimapCanvasRef,
        containerRef,
    });

    const handleFrame = useCallback(
        (result: PhysicsResult | null) => {
            drawAR(result);
        },
        [drawAR],
    );

    const { cvLoaded, errorMsg } = useCamera({
        videoCanvasRef,
        debugView,
        onFrame: handleFrame,
    });

    return (
        <div
            ref={containerRef}
            className={styles.container}
            onPointerDown={handlePointerEvent}
            onPointerMove={handlePointerEvent}
        >
            {/* 레이어 1: 카메라 영상 */}
            <canvas ref={videoCanvasRef} className={styles.videoCanvas} />

            {/* 레이어 2: OpenCV 로딩 오버레이 */}
            {!cvLoaded && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.spinner} />
                    <p className={styles.loadingText}>AI 비전 엔진 로딩 중...</p>
                </div>
            )}

            {/* 레이어 3: 에러 메시지 */}
            {errorMsg && <div className={styles.error}>{errorMsg}</div>}

            {/* 레이어 4: AR 궤적 오버레이 */}
            <canvas ref={arCanvasRef} className={styles.arCanvas} />

            {/* 레이어 5: 상단 헤더 */}
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>
                        Cue<span className={styles.titleAccent}>bit</span>
                    </h1>
                    <p className={styles.subtitle}>Real-time Trajectory</p>
                </div>
                {isARMode && cvLoaded && (
                    <div className={styles.analyzingBadge}>
                        <div className={styles.analyzingDot} />
                        <span className={styles.analyzingText}>실시간 분석 중...</span>
                    </div>
                )}
            </div>

            {/* 레이어 6: 미니맵 */}
            <Minimap ref={minimapCanvasRef} visible={isARMode && cvLoaded} />

            {/* 레이어 7: 하단 컨트롤 패널 */}
            <div className={styles.controls}>
                <ModeToggle mode={mode} onChange={setMode} />
                <DebugViewToggle current={debugView} onChange={setDebugView} />
                <ARButton isARMode={isARMode} onClick={toggleARMode} />
            </div>
        </div>
    );
}

export default Main;
