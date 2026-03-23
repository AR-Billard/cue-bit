import { forwardRef } from "react";
import styles from "./Minimap.module.css";

interface MinimapProps {
	/** true면 선명하게, false면 흐리게 표시 (AR 모드 꺼져있을 때 흐림) */
	visible: boolean;
}

/**
 * 우측 상단 미니맵 패널.
 * 캔버스는 ref로 접근해야 하므로 forwardRef 사용.
 */
const Minimap = forwardRef<HTMLCanvasElement, MinimapProps>(
	({ visible }, ref) => {
		return (
			<div
				className={`${styles.container} ${visible ? styles.visible : styles.dim}`}
			>
				<p className={styles.label}>MINIMAP</p>
				<canvas ref={ref} width={70} height={120} className={styles.canvas} />
			</div>
		);
	},
);

Minimap.displayName = "Minimap";

export default Minimap;
