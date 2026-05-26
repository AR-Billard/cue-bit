import { useEffect, useRef, useState } from "react";
import styles from "./DevLog.module.css";

interface LogEntry {
	id: number;
	level: "warn" | "error";
	message: string;
	timestamp: string;
}

/**
 * 개발 모드에서만 표시되는 로그 토스트 패널.
 *
 * pino 로거의 warn/error 레벨 로그를 화면 하단에 실시간으로 표시합니다.
 * 스마트폰 테스트 시 브라우저 콘솔 없이도 오류를 확인할 수 있습니다.
 *
 * ⚠️ import.meta.env.DEV가 true인 개발 환경에서만 렌더링됩니다.
 *    배포 시에는 아무것도 표시되지 않습니다.
 */
function DevLog() {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const idRef = useRef(0);

	useEffect(() => {
		// 개발 환경에서만 console.warn, console.error를 가로채서 UI에 표시
		const originalWarn = console.warn;
		const originalError = console.error;

		const addLog = (level: "warn" | "error", args: unknown[]) => {
			const message = args
				.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
				.join(" ");

			const now = new Date();
			const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

			setLogs((prev) => [
				// 최대 5개까지만 표시
				...prev.slice(-4),
				{ id: idRef.current++, level, message, timestamp },
			]);
		};

		console.warn = (...args) => {
			originalWarn(...args);
			addLog("warn", args);
		};

		console.error = (...args) => {
			originalError(...args);
			addLog("error", args);
		};

		return () => {
			// 컴포넌트 언마운트 시 원래 console 복원
			console.warn = originalWarn;
			console.error = originalError;
		};
	}, []);

	// 로그 항목 3초 후 자동 제거
	useEffect(() => {
		if (logs.length === 0) return;
		const timer = setTimeout(() => {
			setLogs((prev) => prev.slice(1));
		}, 3000);
		return () => clearTimeout(timer);
	}, [logs]);

	if (logs.length === 0) return null;

	return (
		<div className={styles.container}>
			{logs.map((log) => (
				<div
					key={log.id}
					className={`${styles.entry} ${log.level === "error" ? styles.error : styles.warn}`}
				>
					<span className={styles.timestamp}>{log.timestamp}</span>
					<span className={styles.level}>{log.level.toUpperCase()}</span>
					<span className={styles.message}>{log.message}</span>
				</div>
			))}
		</div>
	);
}

/**
 * 개발 환경에서만 DevLog를 렌더링하는 래퍼
 */
function DevLogWrapper() {
	if (!import.meta.env.DEV) return null;
	return <DevLog />;
}

export default DevLogWrapper;
