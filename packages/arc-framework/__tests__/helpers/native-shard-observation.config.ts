/** Extend the repository's actual native configuration only with qualification observations. */
import { defineConfig } from "vitest/config";
import { loadConfigFromFile } from "vite";
import { fileURLToPath } from "node:url";
import { observeNativeShards } from "./native-shard-observer.js";

export default defineConfig(async environment => {
  const path = fileURLToPath(new URL("../../vitest.config.ts", import.meta.url));
  const loaded = await loadConfigFromFile(environment, path);
  if (loaded === null) throw new Error("Native qualification could not load the repository Vitest configuration.");
  return observeNativeShards(loaded.config);
});
