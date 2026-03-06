import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css"; // 👈 ESSA LINHA É ESSENCIAL

const rootEl = document.getElementById("root");
createRoot(rootEl).render(<App />);
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("Service Worker registrado:", reg.scope))
      .catch((err) => console.log("Erro no Service Worker:", err));
  });
}
