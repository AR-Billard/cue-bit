import cv from "@techstark/opencv-js";

export function todo<T>(message: string): NonNullable<T> {
	throw new Error(`TODO: ${message}`);
}

export function measure<T>(fn: () => Promise<T>, tag?: string): Promise<T>;
export function measure<T>(fn: () => T, tag?: string): T;
export function measure<T>(
	fn: () => T | Promise<T>,
	tag?: string,
): T | Promise<T> {
	const start = performance.now();
	const result = fn();

	if (result instanceof Promise) {
		return result.then((val) => {
			console.log(
				`Execution time${tag ? ` (${tag})` : ""}: ${(performance.now() - start).toFixed(2)} ms`,
			);
			return val;
		});
	}

	console.log(
		`Execution time${tag ? ` (${tag})` : ""}: ${(performance.now() - start).toFixed(2)} ms`,
	);
	return result;
}

/**
 * 16배수 정렬
 */
export function alignTo16(size: number): number {
	return Math.ceil(size / 16) * 16;
}

/**
 * Mat의 수명 관리를 도와주는 유틸리티 함수
 * @param fn
 * @returns
 */
export function withMatScope<T>(
	fn: (track: <M extends { delete(): void }>(m: M) => M) => T,
): T {
	const allocated: { delete(): void }[] = [];
	const track = <M extends { delete(): void }>(m: M) => {
		allocated.push(m);
		return m;
	};
	try {
		return fn(track);
	} finally {
		for (const m of allocated) m.delete();
	}
}

/**
 * Mat을 JS에서 관리할 수 있도록 직렬화
 * @param mat
 * @returns
 */
export function snapshotMat(mat: cv.Mat): MatSnapshot {
	// mat.data는 항상 Uint8Array view (byte-level)
	// 하지만 byteLength가 element 수가 아니라 실제 바이트 수
	const bytes = new Uint8Array(
		mat.data.buffer,
		mat.data.byteOffset,
		mat.rows * mat.cols * mat.elemSize(),
	);
	return {
		rows: mat.rows,
		cols: mat.cols,
		type: mat.type(),
		data: bytes.slice().buffer,
	};
}

/**
 * snapshotMat으로 직렬화된 Mat을 복원
 * @param snap
 * @returns
 */
export function restoreMat(snap: MatSnapshot): cv.Mat {
	const mat = new cv.Mat(snap.rows, snap.cols, snap.type);
	mat.data.set(new Uint8Array(snap.data));
	return mat;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
