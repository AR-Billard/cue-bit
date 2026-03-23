import styles from "./ARButton.module.css";

interface ARButtonProps {
	isARMode: boolean;
	onClick: () => void;
}

/**
 * AR 시작/종료 버튼
 */
function ARButton({ isARMode, onClick }: ARButtonProps) {
	return (
		<button
			className={`${styles.button} ${isARMode ? styles.active : styles.inactive}`}
			onClick={onClick}
		>
			{isARMode ? "⏹ AR 종료" : "▶️ AR 시작"}
		</button>
	);
}

export default ARButton;
