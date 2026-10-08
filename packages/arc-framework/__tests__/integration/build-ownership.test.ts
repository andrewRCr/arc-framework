/** Native-loaded controls share artifact exclusion with the owning process. */
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { bundleRequire } from "bundle-require";
import { withBuildArtifactOwnership } from "../../src/lib/build-ownership.js";

it("retains same-process exclusion across a native loaded control module", async () => {
  const cwd = resolve(import.meta.dirname, "../..");
  const loaded = await bundleRequire<{ withBuildArtifactOwnership: typeof withBuildArtifactOwnership }>({
    filepath: join(cwd, "src/lib/build-ownership.ts"), cwd, format: "esm",
  });
  const packageRoot = await mkdtemp(join(tmpdir(), "arc-native-control-owner-"));
  let release: (() => void) | undefined;
  let ready: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => { ready = resolve; });
  const first = withBuildArtifactOwnership({ packageRoot, operation: "prepared test" }, async () => {
    ready?.();
    await new Promise<void>((resolve) => { release = resolve; });
  });
  await entered;
  const second = loaded.mod.withBuildArtifactOwnership({ packageRoot, operation: "native control" }, async () => "built");
  try {
    const state = await Promise.race([second.then(() => "built"),
      new Promise<string>((resolve) => setTimeout(() => resolve("queued"), 50))]);
    expect(state).toBe("queued");
    release?.();
    await first;
    await expect(second).resolves.toBe("built");
  } finally {
    release?.();
    await Promise.allSettled([first, second]);
    await rm(packageRoot, { recursive: true, force: true });
  }
});
