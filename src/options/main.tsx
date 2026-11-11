import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { OptionsApp } from "./options-app.tsx";
// The settings page uses the popup's theme, so both look the same.
import "../popup/popup.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <OptionsApp />
    </StrictMode>,
  );
}
