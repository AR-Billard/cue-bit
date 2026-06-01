import styles from "./index.module.css";

interface OverlayToggleButtonProps {
	enabled: boolean;
	onClick: () => void;
}

function OverlayToggleButton({ enabled, onClick }: OverlayToggleButtonProps) {
	return (
		<button
			type="button"
			className={`${styles.button} ${enabled ? styles.active : styles.inactive}`}
			onClick={onClick}
		>
			{enabled ? "AR 종료" : "AR 시작"}
		</button>
	);
}

export default OverlayToggleButton;
