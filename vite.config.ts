import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // Use Kokoro's self-contained browser build. The regular entry imports
      // "onnxruntime-common" by bare name without declaring it, so it can pick up
      // the older 1.14 copy that @xenova/transformers (Whisper captions) brings in,
      // which breaks speech with "invalid data location: undefined for input
      // 'input_ids'". The web build bundles matching runtime pieces internally.
      { find: /^kokoro-js$/, replacement: path.resolve(__dirname, "./node_modules/kokoro-js/dist/kokoro.web.js") },
    ],
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  optimizeDeps: {
    // Transformers.js is large and dynamically imported only when the user
    // clicks "Auto-Generate Captions". Excluding it keeps initial dev startup
    // fast and avoids Vite trying to pre-bundle node-only deps.
    exclude: ["@xenova/transformers"],
  },
}));
