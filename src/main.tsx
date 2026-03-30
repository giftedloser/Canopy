import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { setupQueryPersistence } from "@/lib/query-persistence";
import { useCredentialStore } from "@/stores/credential-store";
import App from "./App";
import "./index.css";

// Apply saved theme on load
const savedTheme = localStorage.getItem("theme") ?? "dark";
document.documentElement.classList.remove("dark", "midnight", "forest");
if (savedTheme !== "light") document.documentElement.classList.add(savedTheme);

setupQueryPersistence(queryClient, () => {
  const connectionInfo = useCredentialStore.getState().connectionInfo;
  if (!connectionInfo) return null;

  return {
    domainName: connectionInfo.domainName,
    activeServer: connectionInfo.activeServer,
    connectedAs: connectionInfo.connectedAs,
  };
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
