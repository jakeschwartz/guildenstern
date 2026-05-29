import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initTheme } from "./lib/theme";
import { initKeyboardIfNative } from "./lib/keyboard";
import { initSafeArea } from "./lib/safe-area";
import "./index.css";

initTheme();
initSafeArea();
initKeyboardIfNative();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
