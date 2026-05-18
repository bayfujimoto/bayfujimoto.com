import { defineConfig } from "vite";
import { githubWritePlugin } from "./src/admin/plugin/github-write.js";

export default defineConfig({
  root: ".",
  publicDir: "public",
  plugins: [githubWritePlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main:  "index.html",
        admin: "admin.html",
        gate:  "gate.html",
      },
    },
  },
  server: {
    port: 8080,
  },
});
