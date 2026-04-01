export function todo<T>(message: string): NonNullable<T> {
	throw new Error(`TODO: ${message}`);
}

export async function measureAsync<T>(
	fn: () => Promise<T>,
	tag?: string,
): Promise<T> {
	const start = performance.now();
	const result = await fn();
	const end = performance.now();
	const time = end - start;

	console.log(`Execution time${tag ? `(${tag})` : ""}: ${time.toFixed(2)} ms`);

	return result;
}

export function measure<T>(fn: () => T, tag?: string): T {
	const start = performance.now();
	const result = fn();
	const end = performance.now();
	const time = end - start;

	console.log(`Execution time${tag ? `(${tag})` : ""}: ${time.toFixed(2)} ms`);

	return result;
}
