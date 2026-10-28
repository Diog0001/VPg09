import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/crimson-text/700.css";
import "./app.css";
import { AppShell, HomeRedirect } from "./App";
import { BoardPage } from "./pages/Board";
import { ConstructorPage } from "./pages/Constructor";
import { LoginPage } from "./pages/Login";
import { PreviewPage } from "./pages/Preview";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/w/:workspaceId" element={<BoardPage />}>
            <Route path="tasks/:taskId" element={<PreviewPage />} />
          </Route>
          <Route path="/w/:workspaceId/tasks/:taskId/map" element={<ConstructorPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
