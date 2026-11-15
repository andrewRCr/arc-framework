/** Flip coordinate agreement preserves omitted sides without treating lost recorded sides as omissions. */
import { expect, it } from "vitest";
import { windowFlipCommitBasis } from "../../../../src/scripts/cutover-window/flip-commit.js";
import type { WindowRecord } from "../../../../src/scripts/cutover-window/hold.js";

const before = "a".repeat(40), after = "b".repeat(40), branch = "feat/flip";
function fixture() {
  const record: WindowRecord = { version: 1, flip: { branch, head: before, pullRequest: 7 },
    worktrees: [{ path: "flip-checkout", branch, head: before, personalDigest: "c".repeat(64) }], reviewGateDigest: "d".repeat(64),
    branches: { live: { [branch]: { local: before, origin: before, reasons: ["Window flip"] } },
      local: { main: before, [branch]: before }, origin: { main: before, [branch]: before }, host: { main: before, [branch]: before } },
    refs: { local: {}, origin: {}, tracking: {} } };
  const current = structuredClone(record);
  for (const side of ["local", "origin", "host"] as const) current.branches[side][branch] = after;
  const checkout = current.worktrees[0];
  if (!checkout) throw new Error("The fixture checkout is absent");
  checkout.head = after;
  return { record, current, checkout };
}

it("leaves out a local branch and checkout absent at admission", () => {
  const { record, current } = fixture();
  record.worktrees = []; current.worktrees = [];
  delete record.branches.local["feat/flip"]; delete current.branches.local["feat/flip"];
  expect(windowFlipCommitBasis(record, current)).toEqual({ tip: after, findings: [] });
});

it("refuses a recorded local branch that disappears", () => {
  const { record, current } = fixture();
  delete current.branches.local["feat/flip"];
  expect(windowFlipCommitBasis(record, current).findings).toEqual([
    expect.objectContaining({ subject: `local:${branch}`, condition: expect.stringContaining("absent") }),
  ]);
});

it("refuses agreement at the old head without a deletion commit", () => {
  const { record } = fixture();
  const result = windowFlipCommitBasis(record, record);
  expect(result.tip).toBeNull();
  expect(result.findings).not.toEqual([]);
});

it("requires the flip branch even when its checkout head agrees", () => {
  const { record, current, checkout } = fixture();
  checkout.branch = "other/branch";
  expect(windowFlipCommitBasis(record, current).findings).toEqual([
    expect.objectContaining({ subject: checkout.path, condition: expect.stringContaining("other/branch") }),
  ]);
});
