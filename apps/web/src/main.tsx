import React from "react";
import { createRoot } from "react-dom/client";

function App(): React.ReactElement {
  return (
    <main style={{ fontFamily: "Georgia, serif", padding: 24 }}>
      <h1>NexTeam Studio</h1>
      <p>M0 foundation web shell.</p>
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}

