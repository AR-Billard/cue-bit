export interface Vec2 {
	x: number;
	y: number;
}

export function add(a: Vec2, b: Vec2): Vec2 {
	return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
	return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, scalar: number): Vec2 {
	return { x: v.x * scalar, y: v.y * scalar };
}

export function dot(a: Vec2, b: Vec2): number {
	return a.x * b.x + a.y * b.y;
}

export function length(v: Vec2): number {
	return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function normalize(v: Vec2): Vec2 {
	const len = length(v);
	if (!Number.isFinite(len) || len < 1e-8) return { x: 1, y: 0 };
	return { x: v.x / len, y: v.y / len };
}

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function distance(a: Vec2, b: Vec2): number {
	return length(sub(a, b));
}
