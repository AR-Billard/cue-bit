export function todo<T>(message: string): T {
	throw new Error(`TODO: ${message}`);
}
