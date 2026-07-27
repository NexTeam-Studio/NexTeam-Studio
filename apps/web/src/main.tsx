import React from "react";
import { createRoot } from "react-dom/client";
import "./shared/app/globalStyles";
import { AppBootstrap } from "./shared/app/AppBootstrap";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<AppBootstrap />);
}
