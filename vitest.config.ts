import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Process kokoro-js through Vite so tests can stub its heavy engines.
    server: { deps: { inline: ["kokoro-js"] } },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
