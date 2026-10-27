import { defineConfig } from "vitest/config";

// Opening hours depend on local time, so unit tests run in Berlin time everywhere.
process.env.TZ = "Europe/Berlin";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    pool: "forks"
  }
});
