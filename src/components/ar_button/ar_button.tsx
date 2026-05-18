import styles from "./ar_button.module.css";

interface ARButtonProps {
	/** true면 AR 종료 버튼, false면 AR 시작 버튼으로 표시 */
	isARMode: boolean;
	/** AR 모드 토글 핸들러 */
	onClick: () => void;
}

/** AR 시작/종료 버튼 */
function ARButton({ isARMode, onClick }: ARButtonProps) {
	return (
		<button
			className={`${styles.button} ${isARMode ? styles.active : styles.inactive}`}
			onClick={onClick}
		>
			{isARMode ? "AR 종료" : "AR 시작"}
		</button>
	);
}

export default ARButton;
