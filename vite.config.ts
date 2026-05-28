import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv, type Plugin } from "vite";
import vitePluginString from "vite-plugin-string";
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
	const chiiHost = env["VITE_CHII_HOST"];
	const chiiPort = Number(env["VITE_CHII_PORT"]);
	const chiiPlugins =
		chiiHost && Number.isInteger(chiiPort) && chiiPort >= 0 && chiiPort < 65536
			? [chii(chiiHost, chiiPort)]
			: [];

	return {
		base: env["VITE_BASE_PATH"] ?? "/",
		plugins: [
			react(),
			// wasm 로딩 플러그인
			wasm(),
			// tsconfig paths 적용 플러그인
			tsconfigPaths(),
			// 원격 디버깅 플러그인
			...chiiPlugins,
			// wgsl을 string으로 로드하는 플러그인
			// REVIEW: 지금은 없어도됨
			// 원하는건 .wgsl 파일도 ts에서 존재여부를 확인해줬으면 함
			vitePluginString({
				include: "**/*.wgsl",
				compress: false,
			}),
		],
		server: {
			// 모든 호스트에서 접근 허용 (외부에서 접속시 필요)
			allowedHosts: true,
		},
		optimizeDeps: {
			// NOTE: https://mooyeon.com/blog/onnx-on-web
			exclude: ["onnxruntime-web"],
		},
	};
});
