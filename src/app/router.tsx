import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { paths } from "@/config/paths";
import Main from "./routes/main";

function AppRouter() {
    return (
        <BrowserRouter>
            <Routes>
                <Route index element={<Navigate to={paths.main.path} />} />

                <Route path={paths.main.path} element={<Main />} />
            </Routes>
        </BrowserRouter>
    );
}

export default AppRouter;
