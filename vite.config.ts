import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
    host: "127.0.0.1",
    port: 1430,
    strictPort: true,
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
