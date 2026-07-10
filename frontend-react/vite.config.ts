import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// 站点路径前缀:GitHub Pages 项目站用 "/seat-manager/"(默认,小张版);
// 部署到根路径的站点(如 Cloudflare Pages 商用版)用 VITE_BASE=/ 覆盖。
const base = process.env.VITE_BASE || "/seat-manager/";

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-") || id.includes("node_modules/victory-vendor")) return "charts-vendor";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react-vendor";
          if (id.includes("node_modules/lucide-react")) return "icons-vendor";
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      manifest: {
        name: "班级座位管理器",
        short_name: "座位管理",
        description: "面向班主任的座位、成绩、档案与班级事务管理工具。",
        lang: "zh-CN",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#f5f7fa",
        theme_color: "#111827",
        icons: [
          { src: `${base}icons/seat-manager-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: `${base}icons/seat-manager-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
          { src: `${base}icons/seat-manager-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/admin\//, /^\/license\//, /^\/sync\//],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
