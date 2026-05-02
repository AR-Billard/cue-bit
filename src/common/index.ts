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

	// console.log(
	// 	`Execution time${tag ? ` (${tag})` : ""}: ${(performance.now() - start).toFixed(2)} ms`,
	// );
	return result;
}

/**
 * 16배수 정렬
 */
export function alignTo16(size: number): number {
	return Math.ceil(size / 16) * 16;
}
