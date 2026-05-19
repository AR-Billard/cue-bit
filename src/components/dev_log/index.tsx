import { useEffect, useRef, useState } from "react";
import styles from "./dev_log.module.css";

interface LogEntry {
	id: number;
	level: "warn" | "error";
	message: string;
	timestamp: string;
}

/**
 * 개발 모드에서 로그를 화면에 표시하는 토스트 패널
 * console.warn 및 console.error를 가로채서 UI에 노출함
 */
function DevLog() {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const idRef = useRef(0);

	useEffect(() => {
		const originalWarn = console.warn;
		const originalError = console.error;

		const addLog = (level: "warn" | "error", args: unknown[]) => {
			const message = args
				.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
				.join(" ");

			const now = new Date();
			const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

			setLogs((prev) => [
				...prev.slice(-4), // 최근 5개 로그만 유지
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
			console.warn = originalWarn;
			console.error = originalError;
		};
	}, []);

	// 3초 후 로그 자동 제거
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
 * 개발 환경에서만 DevLog를 렌더링하는 래퍼 컴포넌트
 */
function DevLogWrapper() {
	if (!import.meta.env.DEV) return null;
	return <DevLog />;
}

export default DevLogWrapper;
