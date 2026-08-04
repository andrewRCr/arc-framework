import { describe, expect, it } from "vitest";

import {
  MergeLockResolveRequestSchema,
  MergeLockTransitionRequestSchema,
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
