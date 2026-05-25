import {
	type ChangeEventHandler,
	type PointerEventHandler,
	useCallback,
	useState,
} from "react";

type HitControlPanelProps = {
	/**
	 *
	 * @param point [-1, 1] 범위
	 * @returns
	 */
	onHitPointChange: (point: Vector2) => void;
	onHitPowerChange: (power: number) => void;
	style: React.CSSProperties;
};

/**
 * hit point와 hit power를 조절할 수 있는 컨트롤 패널 컴포넌트
 * @param props
 * @returns
 */
function HitControlPanel(props: HitControlPanelProps) {
	const [hitPoint, setHitPoint] = useState<Vector2>({ x: 0, y: 0 });
	const [hitPower, setHitPower] = useState(0.5);

	const onHitPointChange = useCallback<PointerEventHandler<HTMLDivElement>>(
		(event) => {
			const rect = event.currentTarget.getBoundingClientRect();
			const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
			const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

			const angle = Math.atan2(y, x);
			const maxX = Math.abs(Math.cos(angle));
			const maxY = Math.abs(Math.sin(angle));

			console.log(
				`Max hit point for angle ${((angle * 180) / Math.PI).toFixed(2)} deg: (${maxX.toFixed(2)}, ${maxY.toFixed(2)})`,
			);

			console.log(`Raw hit point: (${x.toFixed(2)}, ${y.toFixed(2)})`);
			console.log(`Hit angle: ${((angle * 180) / Math.PI).toFixed(2)} deg`);
			console.log(`Clamping to max: (${maxX.toFixed(2)}, ${maxY.toFixed(2)})`);

			const clampedX = Math.max(-maxX, Math.min(maxX, x));
			const clampedY = Math.max(-maxY, Math.min(maxY, y));

			setHitPoint({ x: clampedX, y: clampedY });
			props.onHitPointChange({ x: clampedX, y: clampedY });
		},
		[props],
	);
	const onHitPowerChange = useCallback<
		ChangeEventHandler<HTMLInputElement, HTMLInputElement>
	>(
		(event) => {
			const power = parseFloat(event.target.value);
			setHitPower(power);
			props.onHitPowerChange(power);
		},
		[props],
	);

	return (
		<div style={props.style}>
			<div
				style={{
					widows: "100%",
					height: "auto",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "12px",
				}}
			>
				<div
					style={{
						width: "60%",
						height: "auto",
						aspectRatio: "1 / 1",
						borderRadius: "50%",
						background:
							"radial-gradient(circle at 38% 32%, rgba(255, 255, 255, 0.95), rgba(230, 238, 242, 0.9) 35%, rgba(165, 181, 190, 0.92) 100%)",
						boxShadow:
							"inset -10px -12px 18px rgba(0, 0, 0, 0.2), inset 8px 8px 14px rgba(255, 255, 255, 0.65), 0 0 0 2px rgba(255, 255, 255, 0.18)",
						position: "relative",
						touchAction: "none",
					}}
					onPointerDown={onHitPointChange}
					onPointerMove={onHitPointChange}
				>
					<div
						style={{
							position: "absolute",
							width: "64%",
							height: "60%",
							top: "50%",
							left: "50%",
							transform: "translate(-50%, -50%)",
							border: "1px dashed rgba(0, 0, 0, 0.28)",
							borderRadius: "50%",
						}}
					/>
					<div
						style={{
							position: "absolute",
							width: "72%",
							height: "1px",
							top: "50%",
							left: "50%",
							transform: "translate(-50%, -50%)",
							border: "1px dashed rgba(0, 0, 0, 0.28)",
						}}
					/>
					<div
						style={{
							position: "absolute",
							width: "1px",
							height: "72%",
							top: "50%",
							left: "50%",
							transform: "translate(-50%, -50%)",
							border: "1px dashed rgba(0, 0, 0, 0.28)",
						}}
					/>
					<div
						style={{
							position: "absolute",
							width: "10%",
							height: "10%",
							borderRadius: "50%",
							backgroundColor: "rgba(255, 0, 0, 0.8)",
							border: "2px solid rgba(255, 255, 255, 1)",
							top: `${-hitPoint.y * 50 + 50}%`,
							left: `${hitPoint.x * 50 + 50}%`,
							transform: "translate(-50%, -50%)",
						}}
					/>
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: "row",
						alignItems: "center",
						gap: "4px",
					}}
				>
					<span>Power</span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={hitPower}
						onChange={onHitPowerChange}
					/>
				</div>
			</div>
		</div>
	);
}

export default HitControlPanel;
