import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 站点路径前缀:GitHub Pages 项目站用 "/seat-manager/"(默认,小张版);
// 部署到根路径的站点(如 Cloudflare Pages 商用版)用 VITE_BASE=/ 覆盖。
const base = process.env.VITE_BASE || "/seat-manager/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
