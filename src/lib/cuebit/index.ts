import type { Mat } from "@techstark/opencv-js";
import { getOpenCv } from "../opencv";

const { cv } = await getOpenCv();

/**
 * 이미지 프로세싱을 담당할 클래스
 */
class Cuebit {
    private mat: Mat;
    private hsv: Mat;
    private result: Uint8ClampedArray<ArrayBuffer>;

    constructor(width: number, height: number) {
        this.mat = new cv.Mat(height, width, cv.CV_8UC4);
        this.hsv = new cv.Mat(height, width, cv.CV_8UC3);
        this.result = new Uint8ClampedArray(width * height * 4);
    }

    public process(data: Uint8ClampedArray) {
        this.mat.data.set(data);

        cv.cvtColor(this.mat, this.hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(this.hsv, this.hsv, cv.COLOR_RGB2HSV);

        // HSV 3채널을 RGBA 4채널로 펴서 넣기 (H→R, S→G, V→B, A=255)
        const hsv = this.hsv.data;
        const result = this.result;
        const pixels = hsv.length / 3;
        for (let i = 0; i < pixels; i++) {
            result[i * 4] = hsv[i * 3]; // H → R
            result[i * 4 + 1] = hsv[i * 3 + 1]; // S → G
            result[i * 4 + 2] = hsv[i * 3 + 2]; // V → B
            result[i * 4 + 3] = 255; // A
        }

        return this.result;
    }
}

export default Cuebit;
