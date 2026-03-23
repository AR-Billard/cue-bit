import type { Mat } from "@techstark/opencv-js";
import { getOpenCv } from "../opencv";

const { cv } = await getOpenCv();

/** 디버그 뷰 종류 */
export type DebugView = "original" | "hsv" | "mask" | "contour";

/** Cuebit.process()의 반환값 */
export interface CuebitResult {
	/** 각 디버그 뷰의 RGBA 이미지 데이터 */
	frames: Record<DebugView, Uint8ClampedArray<ArrayBuffer>>;
	/** 감지된 공의 좌표 (없으면 null) */
	ballPos: { x: number; y: number } | null;
}

/**
 * 이미지 프로세싱을 담당하는 클래스
 *
 * process()를 호출하면 각 단계별 이미지와 공 위치를 반환합니다.
 * DebugView를 통해 각 단계를 화면에 표시할 수 있습니다.
 *
 * ⚠️ 사용이 끝나면 반드시 destroy()를 호출해주세요.
 *    OpenCV Mat은 C++ 기반 메모리를 사용하므로 GC가 자동으로 해제하지 않습니다.
 */
class Cuebit {
	private mat: Mat;
	private hsv: Mat;
	private mask: Mat;
	private contourOutput: Mat;

	private frameOriginal: Uint8ClampedArray<ArrayBuffer>;
	private frameHsv: Uint8ClampedArray<ArrayBuffer>;
	private frameMask: Uint8ClampedArray<ArrayBuffer>;
	private frameContour: Uint8ClampedArray<ArrayBuffer>;

	constructor(width: number, height: number) {
		this.mat = new cv.Mat(height, width, cv.CV_8UC4);
		this.hsv = new cv.Mat(height, width, cv.CV_8UC3);
		this.mask = new cv.Mat(height, width, cv.CV_8UC1);
		this.contourOutput = new cv.Mat(height, width, cv.CV_8UC4);

		this.frameOriginal = new Uint8ClampedArray(width * height * 4);
		this.frameHsv = new Uint8ClampedArray(width * height * 4);
		this.frameMask = new Uint8ClampedArray(width * height * 4);
		this.frameContour = new Uint8ClampedArray(width * height * 4);
	}

	public process(data: Uint8ClampedArray): CuebitResult {
		const pixels = data.length / 4;

		// ── 뷰 1: 원본 ──────────────────────────────────────
		this.frameOriginal.set(data);

		// ── 뷰 2: HSV 변환 ───────────────────────────────────
		this.mat.data.set(data);
		cv.cvtColor(this.mat, this.hsv, cv.COLOR_RGBA2RGB);
		cv.cvtColor(this.hsv, this.hsv, cv.COLOR_RGB2HSV);

		const hsv = this.hsv.data;
		for (let i = 0; i < pixels; i++) {
			this.frameHsv[i * 4] = hsv[i * 3]; // H → R
			this.frameHsv[i * 4 + 1] = hsv[i * 3 + 1]; // S → G
			this.frameHsv[i * 4 + 2] = hsv[i * 3 + 2]; // V → B
			this.frameHsv[i * 4 + 3] = 255;
		}

		// ── 뷰 3: 마스크 (빨간색 범위 추출) ────────────────────
		// TODO: 당구장 환경에 맞게 HSV 범위 조정 필요
		const lowRed = new cv.Mat(
			this.hsv.rows,
			this.hsv.cols,
			this.hsv.type(),
			[0, 120, 70, 0],
		);
		const highRed = new cv.Mat(
			this.hsv.rows,
			this.hsv.cols,
			this.hsv.type(),
			[10, 255, 255, 0],
		);
		cv.inRange(this.hsv, lowRed, highRed, this.mask);
		lowRed.delete();
		highRed.delete();

		const mask = this.mask.data;
		for (let i = 0; i < pixels; i++) {
			const v = mask[i]; // 255(흰색) or 0(검정)
			this.frameMask[i * 4] = v;
			this.frameMask[i * 4 + 1] = v;
			this.frameMask[i * 4 + 2] = v;
			this.frameMask[i * 4 + 3] = 255;
		}

		// ── 뷰 4: 컨투어 (윤곽선 검출) + 공 위치 감지 ───────────
		let ballPos: { x: number; y: number } | null = null;

		const contours = new cv.MatVector();
		const hierarchy = new cv.Mat();
		cv.findContours(
			this.mask,
			contours,
			hierarchy,
			cv.RETR_EXTERNAL,
			cv.CHAIN_APPROX_SIMPLE,
		);

		// 원본 이미지 위에 컨투어를 그리기 위해 복사
		this.mat.copyTo(this.contourOutput);

		if (contours.size() > 0) {
			let maxArea = 0;
			let maxIdx = -1;

			for (let i = 0; i < contours.size(); i++) {
				const cnt = contours.get(i);
				const area = cv.contourArea(cnt);
				if (area > maxArea) {
					maxArea = area;
					maxIdx = i;
				}
				cnt.delete();
			}

			// 노이즈 무시: 300px² 이상인 덩어리만 공으로 인식
			if (maxArea > 300 && maxIdx !== -1) {
				const maxContour = contours.get(maxIdx);

				// 공 중심 좌표 계산 (모멘트 이용)
				const moments = cv.moments(maxContour);
				ballPos = {
					x: moments.m10 / moments.m00,
					y: moments.m01 / moments.m00,
				};

				// 감지된 컨투어를 초록색으로 그리기
				const color = new cv.Scalar(0, 255, 0, 255);
				cv.drawContours(this.contourOutput, contours, maxIdx, color, 2);
				maxContour.delete();
			}
		}

		contours.delete();
		hierarchy.delete();

		// contourOutput(RGBA)을 frameContour에 복사
		this.frameContour.set(this.contourOutput.data);

		return {
			frames: {
				original: this.frameOriginal,
				hsv: this.frameHsv,
				mask: this.frameMask,
				contour: this.frameContour,
			},
			ballPos,
		};
	}

	/**
	 * OpenCV Mat 메모리 해제
	 * 카메라 스트림 종료 시 반드시 호출해야 합니다.
	 */
	public destroy(): void {
		this.mat.delete();
		this.hsv.delete();
		this.mask.delete();
		this.contourOutput.delete();
	}
}

export default Cuebit;
