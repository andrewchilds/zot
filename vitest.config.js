import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    setupFiles: ["test/setup.js"],
    browser: {
      enabled: true,
      headless: true,
      // Loads zot.css and rot.js the way a game page does; the tests import zot.js.
      testerHtmlPath: "test/tester.html",
      // The installed Google Chrome, so there is no browser to download.
      provider: playwright({ launchOptions: { channel: "chrome" } }),
      instances: [{ browser: "chromium" }],
    },
  },
});
