import AppProvider from "./provider";
import AppRouter from "./router";

/**
 * 애플리케이션 최상위 컴포넌트
 */
function App() {
	return (
		<AppProvider>
			<AppRouter />
		</AppProvider>
	);
}

export default App;
