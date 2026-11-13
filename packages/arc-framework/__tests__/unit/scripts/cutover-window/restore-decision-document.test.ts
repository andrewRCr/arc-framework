/** Saved restore authority must retain its window, complete identity basis, and exact acceptance evidence. */
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { decodeWindowRestoreDecision, type WindowRestoreDecision } from "../../../../src/scripts/cutover-window/restore-decision-document.js";
import type { WindowRecord } from "../../../../src/scripts/cutover-window/hold.js";

const windowTip = "a".repeat(40), held = "b".repeat(40), head = "c".repeat(40), flip = "d".repeat(40), changed = "e".repeat(40);
const ref = "refs/arc/user/andrew/errands";
const record: WindowRecord = { version: 1, flip: { branch: "feat/flip", pullRequest: 7, head: flip },
  worktrees: [{ path: resolve("target"), head, branch: "main" }], branches: { live: {}, local: { main: head, "feat/flip": flip }, origin: { main: head, "feat/flip": flip } },
  refs: { local: { [ref]: held }, origin: { [ref]: held }, tracking: {} } };
const window = { tip: windowTip, record };
const difference = { subject: ref, condition: "Consumed identity input changed.", remedy: "Settle and accept the consumed value before retrying." };
const identity = { ref, held, kept: held, outcome: "equal" as const };
const decision: WindowRestoreDecision = { version: 1, windowTip, regime: "kept", identities: [identity], accepted: [], differences: [] };

it.each<WindowRestoreDecision>([
  decision,
  { ...decision, regime: "unconsumed", identities: [{ ...identity, kept: null, outcome: "unconsumed" }] },
  { ...decision, regime: "records", identities: [{ ...identity, kept: null, outcome: "accepted" }],
    accepted: [{ ref, value: null }], differences: [difference] },
])("decodes a complete saved decision bound to the original window: %j", value => {
  expect(decodeWindowRestoreDecision(JSON.parse(JSON.stringify(value)), window)).toEqual(value);
});

it.each([
  null, {}, { ...decision, version: 2 }, { ...decision, unexpected: true }, { ...decision, windowTip: changed },
  { ...decision, identities: [] }, { ...decision, identities: [identity, identity] },
  { ...decision, identities: [{ ...identity, held: changed }] },
  { ...decision, identities: [{ ...identity, kept: changed }] },
  { ...decision, identities: [{ ...identity, outcome: "unconsumed" }] },
  { ...decision, identities: [{ ...identity, outcome: "accepted" }], differences: [difference] },
  { ...decision, identities: [{ ...identity, kept: changed, outcome: "accepted" }], accepted: [{ ref, value: held }], differences: [difference] },
  { ...decision, accepted: [{ ref, value: "HEAD" }] },
  { ...decision, regime: "records" },
  { ...decision, differences: [difference] },
  { ...decision, identities: [{ ...identity, outcome: "accepted" }], accepted: [{ ref, value: held }] },
])("refuses incomplete, contradictory, or foreign saved authority: %j", value => {
  expect(() => decodeWindowRestoreDecision(value, window)).toThrow(expect.objectContaining({ findings: [expect.objectContaining({
    subject: "restore decision", remedy: expect.stringContaining("Preserve"),
  })] }));
});
