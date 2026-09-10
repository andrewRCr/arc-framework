/** Integration procedure CLI adapter behavior. */

import { describe, expect, it, vi } from "vitest";
import {
  checkpointRemedy,
  IntegrationCheckpointResultSchema,
} from "../../../src/scripts/integration/checkpoint.js";
import { IntegrationMergeResultSchema } from "../../../src/scripts/integration/merge.js";

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
        remedy: checkpointRemedy("candidate-missing", "example"),
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

  it("emits a schema-valid typed refusal for invalid input", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleIntegrationCheckpoint("Bad name", { json: true }, undefined, { write, setExitCode });

    const result = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(IntegrationCheckpointResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      workUnit: null,
      state: "blocked",
      reason: "invalid-input",
      remedy: { argv: ["arc", "integrate", "checkpoint", "--help"] },
    });
    expect(setExitCode).toHaveBeenCalledWith(64);
  });

  it("turns dependency throws into typed refusals", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleIntegrationCheckpoint("example", { json: true }, undefined, {
      checkpoint: async () => { throw new Error("checkpoint store malformed"); },
      write,
      setExitCode,
    });

    const result = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(IntegrationCheckpointResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      workUnit: "example",
      state: "blocked",
      reason: "composition-unavailable",
      remedy: { argv: ["arc", "integrate", "checkpoint", "example", "--json"] },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("normalizes an empty dependency error into a schema-valid refusal", async () => {
    const write = vi.fn();
    await handleIntegrationCheckpoint("example", { json: true }, undefined, {
      checkpoint: async () => { throw new Error(); },
      write,
    });

    const result = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(IntegrationCheckpointResultSchema.safeParse(result).success).toBe(true);
    expect(result.payload.detail).toBe("The integration operation failed without diagnostic detail.");
  });

  it("emits a typed refusal outside an ARC project without invoking checkpoint", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();
    const checkpoint = vi.fn();
    await handleIntegrationCheckpoint("example", { json: true }, undefined, {
      resolveRoot: () => null,
      checkpoint,
      write,
      setExitCode,
    });

    const result = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(IntegrationCheckpointResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({ state: "blocked", reason: "composition-unavailable" });
    expect(checkpoint).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(1);
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
        payload: {
          approvedHead: oid("a"),
          pullRequest: 42,
          target: {
            repository: "owner/repo",
            pullRequest: 42,
            baseRef: "main",
            headRef: "feat/example",
            headSha: oid("a"),
          },
          providerMergeId: oid("d"),
        },
      }),
      write,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "integrate-merge",
      workUnit: "example",
      state: "merged",
      payload: { approvedHead: oid("a"), pullRequest: 42, providerMergeId: oid("d") },
    });
  });

  it("emits a schema-valid typed refusal for invalid input", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleIntegrationMerge("Bad name", { checkpoint: "bad", json: true }, undefined, {
      write,
      setExitCode,
    });

    const result = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(IntegrationMergeResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      workUnit: null,
      state: "blocked",
      reason: "invalid-input",
      remedy: { argv: ["arc", "integrate", "merge", "--help"] },
    });
    expect(setExitCode).toHaveBeenCalledWith(64);
  });

  it("turns checkpoint-store throws into typed refusals", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();
    const checkpoint = `checkpoint-v1:${oid("a")}:${digest("b")}`;

    await handleIntegrationMerge("example", { checkpoint, json: true }, undefined, {
      merge: async () => { throw new Error("checkpoint record mismatched"); },
      write,
      setExitCode,
    });

    const result = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(IntegrationMergeResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      workUnit: "example",
      state: "blocked",
      reason: "operation-failed",
      remedy: { argv: ["arc", "integrate", "checkpoint", "example", "--json"] },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("normalizes an empty merge error into a schema-valid refusal", async () => {
    const write = vi.fn();
    const checkpoint = `checkpoint-v1:${oid("a")}:${digest("b")}`;
    await handleIntegrationMerge("example", { checkpoint, json: true }, undefined, {
      merge: async () => { throw new Error(); },
      write,
    });

    const result = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(IntegrationMergeResultSchema.safeParse(result).success).toBe(true);
    expect(result.payload.detail).toBe("The integration operation failed without diagnostic detail.");
  });

  it("emits a typed refusal outside an ARC project without invoking merge", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();
    const merge = vi.fn();
    const checkpoint = `checkpoint-v1:${oid("a")}:${digest("b")}`;
    await handleIntegrationMerge("example", { checkpoint, json: true }, undefined, {
      resolveRoot: () => null,
      merge,
      write,
      setExitCode,
    });

    const result = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(IntegrationMergeResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({ state: "blocked", reason: "operation-failed" });
    expect(merge).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});
