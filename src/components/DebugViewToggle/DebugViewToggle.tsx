import type { DebugView } from "@/lib/cuebit";
import styles from "./DebugViewToggle.module.css";

interface DebugViewToggleProps {
	current: DebugView;
	onChange: (view: DebugView) => void;
}

const VIEWS: { id: DebugView; label: string }[] = [
	{ id: "original", label: "원본" },
	{ id: "hsv", label: "HSV" },
	{ id: "mask", label: "마스크" },
	{ id: "contour", label: "컨투어" },
];

/**
 * 디버그 뷰 전환 토글
 * 각 버튼을 누르면 카메라 화면이 해당 처리 단계로 바뀜
 */
function DebugViewToggle({ current, onChange }: DebugViewToggleProps) {
	return (
		<div className={styles.container}>
			<span className={styles.label}>DEBUG</span>
			<div className={styles.track}>
				{VIEWS.map(({ id, label }) => (
					<button
						key={id}
						className={`${styles.option} ${current === id ? styles.active : ""}`}
						onClick={() => onChange(id)}
					>
						{label}
					</button>
				))}
			</div>
		</div>
	);
}

export default DebugViewToggle;
