/** Integration procedure CLI adapter behavior. */

import { describe, expect, it, vi } from "vitest";

import {
  handleIntegrationCheckpoint,
  handleIntegrationMerge,
} from "../../../src/handlers/integration.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

describe("integration checkpoint handler", () => {
  it("emits the checkpoint reducer's typed verdict", async () => {
    const write = vi.fn();
    await handleIntegrationCheckpoint("example", { json: true }, undefined, {
      checkpoint: async () => ({
        schemaVersion: 1,
        mode: "integrate-checkpoint",
        workUnit: "example",
        state: "blocked",
        nextAction: "stop",
        reason: "candidate-missing",
        payload: { workUnit: "example" },
      }),
      write,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "integrate-checkpoint",
      workUnit: "example",
      state: "blocked",
      reason: "candidate-missing",
    });
  });
});

describe("integration merge handler", () => {
  it("emits the merge reducer's typed verdict", async () => {
    const write = vi.fn();
    const checkpoint = `checkpoint-v1:${oid("a")}:${digest("b")}`;
    await handleIntegrationMerge("example", { checkpoint, json: true }, undefined, {
      merge: async () => ({
        schemaVersion: 1,
        mode: "integrate-merge",
        workUnit: "example",
        state: "merged",
        nextAction: "complete",
        payload: { approvedHead: oid("a"), pullRequest: 42 },
      }),
      write,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "integrate-merge",
      workUnit: "example",
      state: "merged",
      payload: { approvedHead: oid("a"), pullRequest: 42 },
    });
  });
});
