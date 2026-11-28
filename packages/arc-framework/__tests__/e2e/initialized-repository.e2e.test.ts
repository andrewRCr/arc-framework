/** Cached initialized repositories must match the store selected by the next CLI invocation. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";
import { initializedRepository } from "../helpers/initialized-repository.js";
import { cleanupTempDir } from "./helpers.js";

it("keeps empty-override and in-repo initialization templates separate", async () => {
  onTestFinished(() => { vi.unstubAllEnvs(); });
  vi.stubEnv(IN_REPO_STORE_OVERRIDE, "");
  const ref = await initializedRepository("initialized");
  onTestFinished(() => cleanupTempDir(ref));
  expect(existsSync(join(ref, ".git", "arc", "store"))).toBe(true);

  vi.stubEnv(IN_REPO_STORE_OVERRIDE, "1");
  const inRepo = await initializedRepository("initialized");
  onTestFinished(() => cleanupTempDir(inRepo));
  expect(existsSync(join(inRepo, ".git", "arc", "store")), "in-repo fixture contains a ref store").toBe(false);
});
