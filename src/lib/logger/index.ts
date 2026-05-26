import pino from "pino";

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
		// 브라우저 환경에서 pino가 console을 사용하도록 설정
		asObject: false,
		serialize: false,
		transmit: undefined,
		write: {
			trace: (msg) => console.debug("[TRACE]", msg),
			debug: (msg) => console.debug("[DEBUG]", msg),
			info: (msg) => console.info("[INFO]", msg),
			warn: (msg) => console.warn("[WARN]", msg),
			error: (msg) => console.error("[ERROR]", msg),
			fatal: (msg) => console.error("[FATAL]", msg),
		},
	},
});

export default logger;
