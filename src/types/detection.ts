/**
 * Official vision-to-physics input contract.
 *
 * Ball coordinates are meter-space table coordinates:
 * - origin: top-left corner of the billiards table
 * - x: left to right
 * - y: top to bottom
 * - table size: 2.84m x 1.42m
 */
export interface DetectedBall {
	id: string;
	/** Meter x coordinate in table space. */
	x: number;
	/** Meter y coordinate in table space. */
	y: number;
}

export interface DetectedHitPoint {
	/** Tip offset from center, -1 to 1. Negative is left, positive is right. */
	x: number;
	/** Tip offset from center, -1 to 1. Negative is draw/bottom, positive is follow/top. */
	y: number;
}

export interface DetectedCue {
	/** Shot angle in degrees. 0=right, 90=down, 180=left, 270=up. */
	angleDeg: number;
	/** Shot power in the project input range, currently 0 to 3. */
	power: number;
	hitPoint: DetectedHitPoint;
}

export interface DetectedShot {
	/** External ball id that should be treated as the cue ball for this shot. */
	cueBallId: string;
}

/**
 * Canonical detected state. Use cue.angleDeg, not cue.angle.
 */
export interface DetectedState {
	cue: DetectedCue;
	shot: DetectedShot;
	balls: DetectedBall[];
}
