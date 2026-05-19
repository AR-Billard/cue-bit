import { type Ref, useState } from "react";
import styles from "./minimap.module.css";

interface MinimapProps {
	/** 미니맵 표시 여부 */
	visible: boolean;
	/** 미니맵 캔버스 ref */
	ref?: Ref<HTMLCanvasElement>;
}

/**
 * 정규화된 공 위치를 표시하는 우측 상단 미니맵 패널
 */
function Minimap({ visible, ref }: MinimapProps) {
	const [isEnlarged, setIsEnlarged] = useState(false);

	// 기본 70x120, 확대 시 2.5배 (175x300)
	const width = isEnlarged ? 300 : 120;
	const height = isEnlarged ? 150 : 60;

	return (
		<div
			className={`${styles.container} ${visible ? styles.visible : styles.dim} ${
				isEnlarged ? styles.enlarged : ""
			}`}
			onClick={() => setIsEnlarged(!isEnlarged)}
		>
			<p className={styles.label}>{isEnlarged ? "CLOSE" : "MINIMAP"}</p>
			<canvas
				ref={ref}
				width={width}
				height={height}
				className={styles.canvas}
			/>
		</div>
	);
}

export default Minimap;
