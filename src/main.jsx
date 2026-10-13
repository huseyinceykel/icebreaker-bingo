import React from "react";
import { createRoot } from "react-dom/client";
import { LangProvider } from "./i18n";
import SetupHelp from "./components/SetupHelp";
import "./styles.css";

const REQUIRED = ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_APP_ID"];
const missing = REQUIRED.filter((k) => !import.meta.env[k]);
const root = createRoot(document.getElementById("root"));

if (missing.length) {
  // firebase.js yuklenmeden once yonlendir: ayar yokken Firebase baslatilmaya calisilirsa sayfa bos kalir
  root.render(<SetupHelp missing={missing} />);
} else {
  import("./App").then(({ default: App }) => {
    root.render(<LangProvider><App /></LangProvider>);
  });
}
