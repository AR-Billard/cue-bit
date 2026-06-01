import type { Ref } from "react";
import styles from "./index.module.css";

interface MinimapProps {
	/** true면 선명하게, false면 흐리게 표시 */
	visible: boolean;
	/** 미니맵 캔버스 ref */
	ref?: Ref<HTMLCanvasElement>;
}

/**
 * 우측 상단 미니맵 패널.
 * ref를 prop으로 직접 받아 캔버스에 전달합니다. (React 19)
 */
function Minimap({ visible, ref }: MinimapProps) {
	return (
		<div
			className={`${styles.container} ${visible ? styles.visible : styles.dim}`}
		>
			<p className={styles.label}>MINIMAP</p>
			<canvas ref={ref} width={240} height={120} className={styles.canvas} />
		</div>
	);
}

export default Minimap;
