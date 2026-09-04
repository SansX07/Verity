import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // "node" is enough for the current test suite (pure functions, no DOM).
    // If a future test needs to render a React component, add
    // `// @vitest-environment jsdom` as the first line of that specific
    // test file rather than switching this back globally — jsdom 30.x
    // needs a newer Node than this project currently targets.
    environment: "node",
    globals: true,
  },
});
