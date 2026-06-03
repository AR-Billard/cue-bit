import { createTheme } from "@vanilla-extract/css";

export const [theme, vars] = createTheme({
	color: {
		background: "black",
		onBackground: "white",
        surface: "#222",
        onSurface: "white",
        text: "white",
	},
	font: {
		body: "arial",
	},
	browser: {
		colorScheme: "dark",
	},
});
