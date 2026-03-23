import styles from "./ModeToggle.module.css";

type BilliardMode = "3구" | "4구";

interface ModeToggleProps {
	mode: BilliardMode;
	onChange: (mode: BilliardMode) => void;
}

const MODES: BilliardMode[] = ["3구", "4구"];

/**
 * 3구 / 4구 모드 전환 토글
 */
function ModeToggle({ mode, onChange }: ModeToggleProps) {
	return (
		<div className={styles.track}>
			{MODES.map((m) => (
				<button
					key={m}
					className={`${styles.option} ${mode === m ? styles.active : ""}`}
					onClick={() => onChange(m)}
				>
					{m} 모드
				</button>
			))}
		</div>
	);
}

export default ModeToggle;
