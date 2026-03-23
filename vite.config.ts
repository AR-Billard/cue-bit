import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
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

    const chiiHost = env["VITE_CHII_HOST"] || "localhost:8080";
    const chiiPort = Number(env["VITE_CHII_PORT"]) || 8080;

    return {
        base: '/cue-bit/',
        plugins: [
            react(),
            // wasm 로딩 플러그인
            wasm(),
            // tsconfig paths 적용 플러그인
            tsconfigPaths(),
            // 원격 디버깅 플러그인 (안전한 변수로 교체)
            chii(chiiHost, chiiPort),
        ],
        server: {
            // 모든 호스트에서 접근 허용
            allowedHosts: true,
        },
    };
});