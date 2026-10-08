/** Supported discovery establishes its environment before creating a controller. */
import { expect, it } from "vitest";
import type { createVitest } from "vitest/node";
import { discoverVitestSelection } from "../../src/lib/vitest-discovery.js";
import { makeVitestControllerFake } from "../helpers/vitest-controller-fake.js";

it.each([undefined, "explicit-native-environment"])("initializes a controller with NODE_ENV=%s", async (nodeEnv) => {
  const previous = { ...process.env };
  const fake = makeVitestControllerFake([{ path: "unit.test.ts", project: "unit" }]);
  let configured: string[] = [];
  const create: typeof createVitest = async (...args) => {
    configured = [process.env.TEST ?? "", process.env.VITEST ?? "", process.env.NODE_ENV ?? ""];
    return await fake.create(...args);
  };
  try {
    delete process.env.TEST; delete process.env.VITEST;
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
    const selection = await discoverVitestSelection([], {}, undefined, create);
    expect(configured).toEqual(["true", "true", nodeEnv ?? "test"]);
    expect(selection.requiresRuntime).toBe(false);
    expect(fake.events).toEqual(["initialized"]);
  } finally { process.env = previous; }
});
