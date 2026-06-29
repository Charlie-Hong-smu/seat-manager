import { createRoot } from "react-dom/client";
import App from "./app/App";
import { APP_NAME } from "./app/config";
import "./styles/index.css";

document.title = APP_NAME;

createRoot(document.getElementById("root")!).render(<App />);
