import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  createInRepoTerminalTransitionRecordWriter,
} from "../../../src/lib/work-unit/terminal-transition-record-writer.js";
import type { TransitionRecord } from "../../../src/lib/work-unit/transition-record.js";
import { resolveTransitionRecordRelativePath } from "../../../src/lib/work-unit/transition-record-store.js";

function record(): TransitionRecord {
  return {
    schemaVersion: 1,
    origin: "retired-origin",
    kind: "abandon",
    successors: [],
    edges: [],
  };
}

function harness(options: {
  occupied?: boolean;
  createFailure?: string;
  stageFailure?: boolean;
  indexCleanupFailures?: number;
  recordRemovalFailures?: number;
} = {}) {
  const files = new Set<string>(options.occupied === true ? ["retired-origin"] : []);
  const staged = new Set<string>();
  let indexCleanupFailures = options.indexCleanupFailures ?? 0;
  let recordRemovalFailures = options.recordRemovalFailures ?? 0;
  const exec: GitExec = async (_file, args) => {
    const path = args.at(-1);
    if (path === undefined) throw new Error("test command requires a path");
    if (args[0] === "add") {
      if (options.stageFailure === true) throw new Error("index locked");
      staged.add(path);
    } else if (args[0] === "rm") {
      if (indexCleanupFailures > 0) {
        indexCleanupFailures -= 1;
        throw new Error("index still locked");
      }
      staged.delete(path);
    }
    return { stdout: "", stderr: "" };
  };
  const writer = createInRepoTerminalTransitionRecordWriter({
    cwd: "/repo",
    exec,
    createRecord: async (candidate) => {
      if (options.createFailure !== undefined) {
        throw Object.assign(new Error(options.createFailure), { code: options.createFailure });
      }
      if (files.has(candidate.origin)) throw Object.assign(new Error("occupied"), { code: "EEXIST" });
      files.add(candidate.origin);
    },
    removeRecord: async (origin) => {
      if (recordRemovalFailures > 0) {
        recordRemovalFailures -= 1;
        throw new Error("record still busy");
      }
      files.delete(origin);
    },
  });
  return { writer, files, staged };
}

describe("terminal transition record writer", () => {
  it("writes and stages the record derived from its origin", async () => {
    const state = harness();

    await expect(state.writer.record(record())).resolves.toEqual({ status: "recorded" });

    expect(state.files).toEqual(new Set(["retired-origin"]));
    expect(state.staged).toEqual(new Set([resolveTransitionRecordRelativePath("retired-origin")]));
  });

  it("returns origin-occupied without replacing existing history", async () => {
    const state = harness({ occupied: true });

    await expect(state.writer.record(record())).resolves.toEqual({ status: "origin-occupied" });

    expect(state.files).toEqual(new Set(["retired-origin"]));
    expect(state.staged).toEqual(new Set());
  });

  it("returns unavailable and cleans up when staging fails", async () => {
    const state = harness({ stageFailure: true });

    await expect(state.writer.record(record())).resolves.toMatchObject({
      status: "unavailable",
      diagnostic: expect.stringContaining("index locked"),
    });

    expect(state.files).toEqual(new Set());
    expect(state.staged).toEqual(new Set());
  });

  it("retries transient index and filesystem cleanup failures", async () => {
    const state = harness({
      stageFailure: true,
      indexCleanupFailures: 1,
      recordRemovalFailures: 1,
    });

    await expect(state.writer.record(record())).resolves.toMatchObject({
      status: "unavailable",
      diagnostic: expect.stringContaining("index locked"),
    });

    expect(state.files).toEqual(new Set());
    expect(state.staged).toEqual(new Set());
  });

  it("surfaces record residue when filesystem cleanup still fails after retry", async () => {
    const state = harness({ stageFailure: true, recordRemovalFailures: 2 });

    await expect(state.writer.record(record())).resolves.toMatchObject({
      status: "unavailable",
      diagnostic: expect.stringMatching(/record removal failed.*record still busy/iu),
    });

    expect(state.files).toEqual(new Set(["retired-origin"]));
    expect(state.staged).toEqual(new Set());
  });

  it("surfaces staged residue when index cleanup still fails after retry", async () => {
    const state = harness({ stageFailure: true, indexCleanupFailures: 2 });

    await expect(state.writer.record(record())).resolves.toMatchObject({
      status: "unavailable",
      diagnostic: expect.stringMatching(/index cleanup failed.*index still locked/iu),
    });

    expect(state.files).toEqual(new Set());
  });

  it("unstages and removes a recorded attempt", async () => {
    const state = harness();
    await state.writer.record(record());

    await expect(state.writer.rollback(record())).resolves.toEqual({ status: "rolled-back" });

    expect(state.files).toEqual(new Set());
    expect(state.staged).toEqual(new Set());
  });
});
