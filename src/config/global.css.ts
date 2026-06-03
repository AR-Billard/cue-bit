import { globalStyle } from "@vanilla-extract/css";
import { vars } from "./theme.css";

globalStyle("html, body", {
	backgroundColor: vars.color.background,
	color: vars.color.text,
	// 핵심: 변수를 color-scheme 속성에 박아줌
	colorScheme: vars.browser.colorScheme,
});
