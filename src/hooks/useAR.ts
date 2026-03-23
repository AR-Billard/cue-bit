import { useState, useRef, useEffect, useCallback } from "react";
import type { RefObject } from "react";
import type { PhysicsResult, Point } from "@/types/physics";
import logger from "@/lib/logger";

interface UseAROptions {
    arCanvasRef: RefObject<HTMLCanvasElement | null>;
    minimapCanvasRef: RefObject<HTMLCanvasElement | null>;
    containerRef: RefObject<HTMLDivElement | null>;
}

interface UseARReturn {
    isARMode: boolean;
    toggleARMode: () => void;
    handlePointerEvent: (e: React.PointerEvent<HTMLDivElement>) => void;
    drawAR: (result: PhysicsResult | null) => void;
}

// 공 ID별 궤적선 색상
const BALL_COLORS: Record<string, string> = {
    cue:    "#ffffff", // 수구 — 흰색
    red:    "#ff4757", // 적구 — 빨간색
    yellow: "#ffd700", // 황구 — 노란색
};
const FALLBACK_COLOR = "#00e5ff";

function getBallColor(ballId: string): string {
    return BALL_COLORS[ballId] ?? FALLBACK_COLOR;
}

/**
 * AR 오버레이(궤적선, 쿠션 반사점, 미니맵)를 그리고,
 * 터치/마우스 이벤트로 수구 위치를 설정하는 훅.
 *
 * drawAR()에 PhysicsResult를 넘기면 모든 공의 궤적을 화면에 그려줍니다.
 * 물리엔진이 완성되기 전까지는 null을 넘기면 됩니다.
 */
function useAR({ arCanvasRef, minimapCanvasRef, containerRef }: UseAROptions): UseARReturn {
    const [isARMode, setIsARMode] = useState(false);
    const isARModeRef = useRef(false);

    // 사용자가 화면을 터치한 좌표 (수구 위치)
    const touchPosRef = useRef<Point | null>(null);

    // 캔버스 크기를 컨테이너에 맞게 조정
    useEffect(() => {
        const handleResize = () => {
            const canvas = arCanvasRef.current;
            if (canvas && containerRef.current) {
                canvas.width = containerRef.current.clientWidth;
                canvas.height = containerRef.current.clientHeight;
            }
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [arCanvasRef, containerRef]);

    const toggleARMode = useCallback(() => {
        setIsARMode((prev) => {
            const next = !prev;
            isARModeRef.current = next;
            if (next) {
                touchPosRef.current = null;
                logger.info("AR 모드 시작");
            } else {
                logger.info("AR 모드 종료");
            }
            return next;
        });
    }, []);

    const handlePointerEvent = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        if (target.tagName !== "CANVAS" && target.tagName !== "DIV") return;
        touchPosRef.current = { x: e.clientX, y: e.clientY };
    }, []);

    const drawAR = useCallback(
        (result: PhysicsResult | null) => {
            const canvas = arCanvasRef.current;
            const minimapCanvas = minimapCanvasRef.current;
            if (!canvas || !minimapCanvas) return;

            const ctx = canvas.getContext("2d");
            const mCtx = minimapCanvas.getContext("2d");
            if (!ctx || !mCtx) return;

            // AR 꺼져있거나 결과 없으면 캔버스 지우기
            if (!isARModeRef.current || !result) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
                return;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);

            const scaleX = minimapCanvas.width / canvas.width;
            const scaleY = minimapCanvas.height / canvas.height;

            // 각 공의 궤적을 순서대로 그리기
            for (const trajectory of result.trajectories) {
                if (trajectory.path.length < 2) continue;

                const color = getBallColor(trajectory.ballId);

                // 메인 캔버스: 궤적선
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 6]);
                ctx.shadowBlur = 10;
                ctx.shadowColor = color;
                ctx.beginPath();
                ctx.moveTo(trajectory.path[0].x, trajectory.path[0].y);
                for (const point of trajectory.path.slice(1)) {
                    ctx.lineTo(point.x, point.y);
                }
                ctx.stroke();
                ctx.restore();

                // 메인 캔버스: 쿠션 반사점 (다이아몬드 마커)
                for (const cp of trajectory.cushionPoints) {
                    ctx.save();
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.8;
                    ctx.beginPath();
                    ctx.moveTo(cp.x,     cp.y - 6);
                    ctx.lineTo(cp.x + 6, cp.y);
                    ctx.lineTo(cp.x,     cp.y + 6);
                    ctx.lineTo(cp.x - 6, cp.y);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }

                // 메인 캔버스: 시작점 원
                const start = trajectory.path[0];
                ctx.save();
                ctx.beginPath();
                ctx.arc(start.x, start.y, 12, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.shadowBlur = 10;
                ctx.shadowColor = color;
                ctx.globalAlpha = 0.9;
                ctx.fill();
                ctx.restore();

                // 미니맵: 궤적선
                mCtx.save();
                mCtx.strokeStyle = color;
                mCtx.lineWidth = 1;
                mCtx.beginPath();
                mCtx.moveTo(trajectory.path[0].x * scaleX, trajectory.path[0].y * scaleY);
                for (const point of trajectory.path.slice(1)) {
                    mCtx.lineTo(point.x * scaleX, point.y * scaleY);
                }
                mCtx.stroke();

                // 미니맵: 시작점 점
                mCtx.beginPath();
                mCtx.arc(start.x * scaleX, start.y * scaleY, 3, 0, 2 * Math.PI);
                mCtx.fillStyle = color;
                mCtx.fill();
                mCtx.restore();
            }

            // 득점 예상 시 화면 테두리 초록 강조
            if (result.isScoring) {
                ctx.save();
                ctx.strokeStyle = "#2ed573";
                ctx.lineWidth = 4;
                ctx.shadowBlur = 20;
                ctx.shadowColor = "#2ed573";
                ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
                ctx.restore();
            }
        },
        [arCanvasRef, minimapCanvasRef],
    );

    return { isARMode, toggleARMode, handlePointerEvent, drawAR };
}

export default useAR;