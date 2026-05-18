import pino from "pino";

/**
 * 애플리케이션 전역 로거
 * 사용법:
 *   import logger from "@/lib/logger";
 *   logger.info("메시지");
 *   logger.error({ err }, "에러 메시지");
 *
 * 레벨: trace < debug < info < warn < error < fatal
 */
const logger = pino({
	level: import.meta.env.DEV ? "debug" : "info",
	browser: {
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
