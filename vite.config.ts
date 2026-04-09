import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv, type Plugin } from "vite";
import vitePluginString from "vite-plugin-string";
import wasm from "vite-plugin-wasm";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * 원격 디버깅을 위한 chii 셋업 플러그인
 * @param host
 * @param port
 * @returns
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

	return {
		plugins: [
			react(),
			// wasm 로딩 플러그인
			wasm(),
			// tsconfig paths 적용 플러그인
			tsconfigPaths(),
			// 원격 디버깅 플러그인
			chii(env["VITE_CHII_HOST"], Number(env["VITE_CHII_PORT"])),
			// wgsl을 string으로 로드하는 플러그인
			// 이거 없이 ?raw로 로드하면 파일의 존재 여부를 체크하지 않아서 오타가 나도 에러가 안 뜸
			vitePluginString({
				include: "**/*.wgsl",
			}),
		],
		server: {
			// 모든 호스트에서 접근 허용
			allowedHosts: true,
		},
		optimizeDeps: {
			exclude: ["onnxruntime-web"],
		},
	};
});
