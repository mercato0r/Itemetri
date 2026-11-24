import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { userManualVitePlugin } from "./scripts/buildUserManual.mjs";

export default defineConfig({
  plugins: [react(), userManualVitePlugin()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
  },
});
