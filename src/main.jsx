import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { BrowserRouter, Route, Routes } from "react-router";
import AppLayout from "./layout/AppLayout.jsx";
import Controller from "./pages/Controller.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Controller />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
