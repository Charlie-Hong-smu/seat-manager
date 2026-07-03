import { createRoot } from "react-dom/client";
import App from "./app/App";
import { APP_NAME } from "./app/config";
import "./styles/index.css";

document.title = APP_NAME;

function clearLocalDevOfflineCache() {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return;
  }

  const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (!isLocalHost) {
    return;
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(registrations => {
        registrations
          .filter(registration => registration.scope.includes("/seat-manager/"))
          .forEach(registration => registration.unregister());
      })
      .catch(error => {
        console.warn("清理本地离线缓存失败", error);
      });
  }

  if ("caches" in window) {
    caches.keys()
      .then(keys => {
        keys
          .filter(key => key.startsWith("seat-manager-v"))
          .forEach(key => caches.delete(key));
      })
      .catch(error => {
        console.warn("清理本地缓存包失败", error);
      });
  }
}

clearLocalDevOfflineCache();

createRoot(document.getElementById("root")!).render(<App />);
