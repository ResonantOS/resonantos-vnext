import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const PI5_IP = process.env.VITE_PI5_TAILNET_IP ?? "127.0.0.1";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("@codemirror/lang-markdown") || id.includes("@lezer/markdown")) {
            return "codemirror-markdown";
          }
          if (
            id.includes("@codemirror/") ||
            id.includes("@lezer/") ||
            id.includes("style-mod") ||
            id.includes("w3c-keyname") ||
            id.includes("crelt")
          ) {
            return "codemirror-core";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 1430,
    strictPort: true,
    cors: { origin: "*", methods: ["GET", "POST", "OPTIONS"] },
    proxy: {
      "/invoke": {
        target: `http://${PI5_IP}:1431`,
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: `http://${PI5_IP}:1431`,
        ws: true,
        changeOrigin: true,
      },
    },
    watch: {
      ignored: [
        "**/addons/resonant-browser-native/build/**",
        "**/src-tauri/target/**",
        "**/dist/**",
        "**/node_modules/**",
      ],
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
