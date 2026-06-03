import { useEffect } from "react";
import { theme } from "@/config/theme.css";
import AppProvider from "./provider";
import AppRouter from "./router";

function App() {
	useEffect(() => {
		document.documentElement.className = theme;
	}, []);

	return (
		<AppProvider>
			<AppRouter />
		</AppProvider>
	);
}

export default App;
