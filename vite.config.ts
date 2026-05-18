import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

function chii(host: string, port: number): Plugin {
	let started = false;

	return {
		name: "chii",
		configureServer: () => {
			if (started) {
				return;
			}
			started = true;

			// @ts-expect-error chii has no bundled TypeScript declaration.
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
		base: env["VITE_BASE_PATH"] ?? "/",
		plugins: [react(), tsconfigPaths(), chii(chiiHost, chiiPort)],
		server: {
			allowedHosts: true,
		},
	};
});
