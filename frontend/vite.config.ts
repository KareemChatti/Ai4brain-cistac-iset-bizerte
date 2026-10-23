/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const shared = fileURLToPath(new URL("../shared", import.meta.url));
const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@shared": shared, "@": src } },
  server: { fs: { allow: [".", shared] } },
  test: { environment: "jsdom", env: { VITE_USE_MOCK: "true" } },
});
