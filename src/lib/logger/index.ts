import pino from "pino";

const write = (prefix: string, fn: (...args: unknown[]) => void) => {
	return (o: object) => {
		const {
			level: _level,
			time: _time,
			msg,
			...rest
		} = o as Record<string, unknown>;
		if (Object.keys(rest).length > 0) {
			fn(prefix, msg, rest);
		} else {
			fn(prefix, msg);
		}
	};
};

/**
 * 앱 전역에서 사용하는 로거
 *
 * 사용법:
 *   import logger from "@/lib/logger";
 *   logger.info("카메라 시작됨");
 *   logger.warn("공 감지 실패");
 *   logger.error({ err }, "카메라 에러 발생");
 *
 * 로그 레벨:
 *   trace < debug < info < warn < error < fatal
 *   개발 중엔 debug, 배포 시엔 info 이상만 출력
 */
const logger = pino({
	// 개발 환경이면 debug, 배포 환경이면 info
	level: import.meta.env.DEV ? "debug" : "info",
	browser: {
		asObject: true,
		write: {
			trace: write("[TRACE]", console.debug),
			debug: write("[DEBUG]", console.debug),
			info: write("[INFO]", console.info),
			warn: write("[WARN]", console.warn),
			error: write("[ERROR]", console.error),
			fatal: write("[FATAL]", console.error),
		},
	},
});

export default logger;
