import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 80,
    allowedHosts: [
      'localhost',
      '.replit.dev',
      'ebcd8dbd-6918-4f04-a533-7b9e1f7eb25a-00-y7grojt0qtf8.kirk.replit.dev'
    ],
    hmr: {
      port: 80,
      host: 'localhost'
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});