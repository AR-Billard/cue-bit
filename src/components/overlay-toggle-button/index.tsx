import styles from "./index.module.css";

interface OverlayToggleButtonProps {
	enabled: boolean;
	onClick: () => void;
}

/**
 * Overlay 토글 버튼
 */
function OverlayToggleButton({ enabled, onClick }: OverlayToggleButtonProps) {
	return (
		<button
			className={`${styles.button} ${enabled ? styles.active : styles.inactive}`}
			onClick={onClick}
		>
			{enabled ? "⏹ AR 종료" : "▶️ AR 시작"}
		</button>
	);
}

export default OverlayToggleButton;
