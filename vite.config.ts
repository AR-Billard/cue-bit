import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import wasm from "vite-plugin-wasm";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * 원격 디버깅을 위한 chii 셋업 플러그인
 */
function chii(host: string, port: number): Plugin {
	let started = false;

	return {
		name: "chii",
		configureServer: () => {
			if (started) {
				return;
			}
			started = true;

			// @ts-expect-error - chii 타입 정의가 없음
			import("chii")
				.then((chii) => {
					chii.start({ port });
				})
				.catch(console.error);
		},
		transformIndexHtml: () => {
			return [
				{
					tag: "script",
					attrs: {
						src: `//${host}/target.js`,
					},
					injectTo: "head",
				},
			];
		},
	};
}

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), "");

	const chiiHost = env["VITE_CHII_HOST"] || "localhost";
	const chiiPort = Number(env["VITE_CHII_PORT"]) || 8080;

	return {
		base: env["VITE_BASE_PATH"] ?? "/",
		plugins: [
			react(), // React 지원
			wasm(), // WASM 로딩 (OpenCV 등)
			tsconfigPaths(), // tsconfig의 paths 별칭 적용
			chii(chiiHost, chiiPort), // 원격 디버깅 (모바일 테스트용)
		],
		server: {
			// 모든 호스트에서 접근 허용 (모바일 테스트 시 필요)
			allowedHosts: true,
		},
	};
});
