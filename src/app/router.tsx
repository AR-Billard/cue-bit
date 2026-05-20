import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { paths } from "@/config/paths";
import Main from "./routes/main";
import Physics from "./routes/physics";

function AppRouter() {
	return (
		<BrowserRouter basename={import.meta.env.BASE_URL}>
			<Routes>
				<Route index element={<Navigate to={paths.main.path} />} />

				<Route path={paths.main.path} element={<Main />} />
				<Route path={paths.physics.path} element={<Physics />} />
			</Routes>
		</BrowserRouter>
	);
}

export default AppRouter;
