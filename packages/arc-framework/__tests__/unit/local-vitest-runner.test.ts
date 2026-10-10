/** Supported discovery establishes its environment before creating a controller. */
import { expect, it, vi } from "vitest";
import type { createVitest } from "vitest/node";
import { discoverVitestSelection } from "../../src/lib/vitest-discovery.js";
import { makeVitestControllerFake } from "../helpers/vitest-controller-fake.js";

async function withDiscoveryEnvironment(action: () => Promise<void>): Promise<void> {
  for (const key of ["TEST", "VITEST", "NODE_ENV"]) vi.stubEnv(key, process.env[key]);
  try { await action(); }
  finally { vi.unstubAllEnvs(); }
}

it.each([undefined, "explicit-native-environment"])("initializes a controller with NODE_ENV=%s", async (nodeEnv) => {
  const fake = makeVitestControllerFake([{ path: "unit.test.ts", project: "unit" }]);
  let configured: string[] = [];
  const create: typeof createVitest = async (...args) => {
    configured = [process.env.TEST ?? "", process.env.VITEST ?? "", process.env.NODE_ENV ?? ""];
    return await fake.create(...args);
  };
  await withDiscoveryEnvironment(async () => {
    delete process.env.TEST; delete process.env.VITEST;
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
    const selection = await discoverVitestSelection([], {}, undefined, create);
    expect(configured).toEqual(["true", "true", nodeEnv ?? "test"]);
    expect(selection.requiresRuntime).toBe(false);
    expect(fake.events).toEqual(["initialized"]);
  });
});

it("restores an absent environment stub after discovery cleanup", async () => {
  const key = "VITEST_ENV_CLEANUP_PROBE";
  const previous = process.env[key];
  try {
    await withDiscoveryEnvironment(async () => {
      await discoverVitestSelection([], {}, undefined, makeVitestControllerFake([
        { path: "unit.test.ts", project: "unit" },
      ]).create);
    });
    delete process.env.VITEST_ENV_CLEANUP_PROBE;
    vi.stubEnv(key, "temporary");
    vi.unstubAllEnvs();
    expect(process.env[key]).toBeUndefined();
  } finally {
    if (previous === undefined) delete process.env.VITEST_ENV_CLEANUP_PROBE;
    else process.env[key] = previous;
  }
});
