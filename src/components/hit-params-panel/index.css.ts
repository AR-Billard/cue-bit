import { style } from "@vanilla-extract/css";
import { vars } from "@/config/theme.css";

export const styles = {
	root: style({
		width: "100%",
		height: "100%",
		display: "flex",
		flexDirection: "column",
		gap: "8px",
		backgroundColor: vars.color.surface,
		color: vars.color.onSurface,
		padding: "16px",
		borderRadius: "8px",
	}),
};
