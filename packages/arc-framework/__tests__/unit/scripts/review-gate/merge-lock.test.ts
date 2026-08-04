import { describe, expect, it } from "vitest";

import {
  MergeLockResolveRequestSchema,
  MergeLockTransitionRequestSchema,
  resolveMergeLock,
  type MergeLockSetting,
} from "../../../../src/scripts/review-gate/merge-lock.js";

const SHA = "a".repeat(40);

const TARGET = {
  repository: "owner/repo",
  pullRequest: 42,
  headSha: SHA,
};

const VEHICLE = {
  kind: "work-unit" as const,
  slug: "demo",
  archiveCadence: "manual" as const,
};

describe("MergeLockResolveRequestSchema", () => {
  it("accepts a tree root alone", () => {
    const parsed = MergeLockResolveRequestSchema.parse({
      schemaVersion: 1,
      treeRoot: "/candidate",
    });

    expect(parsed).toEqual({ schemaVersion: 1, treeRoot: "/candidate" });
  });

  it("rejects a request carrying a target", () => {
    expect(() => MergeLockResolveRequestSchema.parse({
      schemaVersion: 1,
      treeRoot: "/candidate",
      target: TARGET,
    })).toThrow();
  });

  it("rejects a request carrying a vehicle", () => {
    expect(() => MergeLockResolveRequestSchema.parse({
      schemaVersion: 1,
      treeRoot: "/candidate",
      vehicle: VEHICLE,
    })).toThrow();
  });
});

describe("MergeLockTransitionRequestSchema", () => {
  it("accepts a guarded target with its vehicle", () => {
    const parsed = MergeLockTransitionRequestSchema.parse({
      schemaVersion: 1,
      treeRoot: "/candidate",
      target: TARGET,
      vehicle: VEHICLE,
    });

    expect(parsed).toEqual({
      schemaVersion: 1,
      treeRoot: "/candidate",
      target: TARGET,
      vehicle: VEHICLE,
    });
  });

  it("rejects a request missing its target", () => {
    expect(() => MergeLockTransitionRequestSchema.parse({
      schemaVersion: 1,
      treeRoot: "/candidate",
      vehicle: VEHICLE,
    })).toThrow();
  });

  it("rejects a request missing its vehicle", () => {
    expect(() => MergeLockTransitionRequestSchema.parse({
      schemaVersion: 1,
      treeRoot: "/candidate",
      target: TARGET,
    })).toThrow();
  });
});

function resolveRequest() {
  return { schemaVersion: 1 as const, treeRoot: "/candidate" };
}

function configPort(setting: MergeLockSetting | (() => Promise<never>)) {
  const roots: string[] = [];
  return {
    roots,
    readMergeLock: async (treeRoot: string) => {
      roots.push(treeRoot);
      if (typeof setting === "function") return setting();
      return setting;
    },
  };
}

describe("resolveMergeLock", () => {
  it("opens locked under the draft lock", async () => {
    const port = configPort({ state: "value", value: "draft" });

    const result = await resolveMergeLock(resolveRequest(), port);

    expect(result).toEqual({
      schemaVersion: 1,
      mode: "merge-lock-resolve",
      diagnostics: [],
      state: "locked",
      nextAction: "open-locked",
      payload: {},
    });
    expect(port.roots).toEqual(["/candidate"]);
  });

  it("opens plain when the lock is off", async () => {
    const result = await resolveMergeLock(resolveRequest(), configPort({ state: "value", value: "none" }));

    expect(result).toMatchObject({ state: "none", nextAction: "open-plain", payload: {} });
  });

  it("opens plain on an absent key — the documented default, not an error", async () => {
    const result = await resolveMergeLock(resolveRequest(), configPort({ state: "absent" }));

    expect(result).toMatchObject({ state: "none", nextAction: "open-plain", diagnostics: [] });
  });

  it("blocks on an unreadable config rather than defaulting either way", async () => {
    const result = await resolveMergeLock(resolveRequest(), configPort({ state: "unreadable" }));

    expect(result).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      payload: { reason: "config-unresolved" },
    });
    expect(result.diagnostics).toHaveLength(1);
  });

  it("blocks on an out-of-domain value", async () => {
    const result = await resolveMergeLock(resolveRequest(), configPort({ state: "value", value: "Draft" }));

    expect(result).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      payload: { reason: "config-unresolved" },
    });
  });

  it("blocks when the config read throws", async () => {
    const result = await resolveMergeLock(
      resolveRequest(),
      configPort(() => Promise.reject(new Error("read failed"))),
    );

    expect(result).toMatchObject({ state: "blocked", payload: { reason: "config-unresolved" } });
  });
});
