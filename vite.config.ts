import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths, so the built app works from any folder or host.
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    // The opening hours engine carries holiday calendars and loads on demand.
    chunkSizeWarningLimit: 1500
  },
  preview: { port: 4173, strictPort: true }
});
