import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/@codemirror/") || id.includes("/codemirror/") || id.includes("/@lezer/")) return "editor";
          if (id.includes("/lucide-react/")) return "icons";
        },
      },
    },
  },
});
