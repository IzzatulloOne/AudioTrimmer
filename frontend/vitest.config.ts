/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  plugins: [react()],
  test: {
    // Тестам React нужен DOM — без этого падает "document is not defined"
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
