/** Bounded rollout selection for pre-locus Errand recovery. */

import { describe, expect, it } from "vitest";

import type { MetaFileCandidate } from "../../../src/commands/active/types.js";
import { TransientIdentityRecordSchema } from "../../../src/lib/errand/identity-record.js";
import { selectLegacyErrandRecoveryCandidate } from "../../../src/lib/recover/legacy-errand.js";

const parent: MetaFileCandidate = {
  path: ".arc/active/meta-parent.md",
  filename: "meta-parent.md",
  branch: "feat/parent",
  state: "Active",
  nextTask: null,
  taskList: "tasks-parent.md",
  nextAction: null,
  currentWorkflow: null,
};

const legacy = TransientIdentityRecordSchema.parse({
  version: 2,
  slug: "legacy",
  origin: "description",
  intent: "Close legacy",
  branch: "chore/legacy",
  createdAt: "2026-07-21T00:00:00.000Z",
  returnBranch: "feat/parent",
}) as Extract<ReturnType<typeof TransientIdentityRecordSchema.parse>, { version: 2 }>;

describe("legacy Errand recovery selection", () => {
  it("selects an exact current-branch v2 identity and return-branch meta", () => {
    expect(selectLegacyErrandRecoveryCandidate({
      currentBranch: "chore/legacy",
      records: [legacy],
      activeCandidates: [parent],
    })).toEqual({
      slug: "legacy",
      branch: "chore/legacy",
      returnBranch: "feat/parent",
      parentMetaPath: ".arc/active/meta-parent.md",
    });
  });

  const { returnBranch: _returnBranch, ...legacyFields } = legacy;
  void _returnBranch;
  it.each([
    ["a v1 identity", { ...legacyFields, version: 1 }],
    ["a v2 identity without returnBranch", { ...legacy, returnBranch: undefined }],
    ["a non-current identity", { ...legacy, branch: "chore/other" }],
  ])("does not widen recovery to %s", (_name, record) => {
    expect(selectLegacyErrandRecoveryCandidate({
      currentBranch: "chore/legacy",
      records: [TransientIdentityRecordSchema.parse(record)],
      activeCandidates: [parent],
    })).toBeNull();
  });

  it("refuses when the return branch has no exact active parent", () => {
    expect(() => selectLegacyErrandRecoveryCandidate({
      currentBranch: "chore/legacy",
      records: [legacy],
      activeCandidates: [],
    })).toThrow("does not resolve one active parent meta");
  });
});
