/** Restore may overwrite only values the window wrote or the Owner explicitly accepted. */
import { expect, it } from "vitest";
import { planWindowRestoreLeases, type WindowRestoreSnapshot } from "../../../../src/scripts/cutover-window/restore-leases.js";
import type { WindowRecord } from "../../../../src/scripts/cutover-window/hold.js";
import type { WindowRestoreDecision } from "../../../../src/scripts/cutover-window/restore-decision-document.js";

const held = "a".repeat(40), published = "b".repeat(40), moved = "c".repeat(40), windowTip = "d".repeat(40);
const ref = "refs/arc/delivery-candidates/example";
const record: WindowRecord = { version: 1, reviewGateDigest: "c".repeat(64), flip: { branch: "feat/flip", pullRequest: 7, head: held }, worktrees: [],
  branches: { live: {}, host: {}, local: {}, origin: {} }, refs: { local: {}, origin: { [ref]: held }, tracking: {} } };
const decision: WindowRestoreDecision = { version: 1, windowTip, regime: "unconsumed", identities: [], accepted: [], differences: [] };
const snapshot: WindowRestoreSnapshot = { local: {}, origin: {}, tracking: {}, identity: "andrew" };

it.each([moved, null])("refuses a moved or deleted origin ref, including a non-store ref matching local: %s", current => {
  const state: WindowRestoreSnapshot = { ...snapshot, origin: current === null ? {} : { [ref]: current }, local: current === null ? {} : { [ref]: current } };
  const result = planWindowRestoreLeases(record, decision, state);
  expect(result.findings).toContainEqual(expect.objectContaining({ subject: `origin:${ref}`,
    condition: expect.stringContaining(current ?? "absent"), remedy: expect.stringContaining(`--accept ${ref}=${current ?? "absent"}`) }));
  expect(result.findings.find(finding => finding.subject === `origin:${ref}`)?.condition).toContain(held);
  const accepted = { ...decision, accepted: [{ ref, value: current }] };
  expect(planWindowRestoreLeases(record, accepted, state).findings).toEqual([]);
  expect(planWindowRestoreLeases(record, accepted, state).origin).toEqual([{ ref, current, next: held }]);
});

it.each([
  { name: "registry tracking", ref: "refs/arc/project/registry", tracking: true },
  { name: "registry local", ref: "refs/arc/project/registry", tracking: false },
  { name: "own personal", ref: "refs/arc/user/andrew/personal", tracking: false },
  { name: "own claims", ref: "refs/arc/user/andrew/claims", tracking: false },
])("leases the value published by the window: $name", ({ ref, tracking }) => {
  const state = { ...snapshot, local: { [ref]: tracking ? moved : published }, origin: { [ref]: published },
    tracking: tracking ? { [`refs/arc-remotes/origin/${ref.slice("refs/arc/".length)}`]: published } : {} };
  const result = planWindowRestoreLeases({ ...record, refs: { ...record.refs, origin: {} } }, decision, state);
  expect(result.findings).toEqual([]);
  expect(result.origin).toEqual([{ ref, current: published, next: null }]);
});

it.each(["refs/arc/user/andrew/errands", "refs/arc/tmp/errand-close", ref])(
  "protects the local ref %s and uses the accepted value as its reset lease", ref => {
    const target = { ...record, refs: { ...record.refs, local: { [ref]: held }, origin: {} } };
    const state = { ...snapshot, local: { [ref]: moved } };
    const result = planWindowRestoreLeases(target, decision, state);
    expect(result.findings).toEqual([expect.objectContaining({ subject: `local:${ref}`,
      condition: expect.stringContaining(moved), remedy: expect.stringContaining(`--accept ${ref}=${moved}`) })]);
    const accepted = planWindowRestoreLeases(target, { ...decision, accepted: [{ ref, value: moved }] }, state);
    expect(accepted.findings).toEqual([]);
    expect(accepted.local).toEqual([{ ref, current: moved, next: held }]);
  },
);

it.each(["kept", "records"] as const)("uses the saved %s consumption outcome to authorize retired identity absence", regime => {
  const ref = "refs/arc/user/andrew/errands";
  const target = { ...record, refs: { ...record.refs, local: { [ref]: held }, origin: { [ref]: held } } };
  const unconsumed = { ...decision, identities: [{ ref, held, kept: null, outcome: "unconsumed" as const }] };
  expect(planWindowRestoreLeases(target, unconsumed, snapshot).findings.map(finding => finding.subject).sort())
    .toEqual([`local:${ref}`, `origin:${ref}`]);
  const consumed = { ...decision, regime, identities: [{ ref, held, kept: regime === "kept" ? held : null, outcome: "equal" as const }] };
  const result = planWindowRestoreLeases(target, consumed, snapshot);
  expect(result.findings).toEqual([]);
  for (const side of ["local", "origin"] as const) expect(result[side]).toEqual([{ ref, current: null, next: held }]);
});

it("sets targets for window-owned local store, working, and tracking refs without accepting them", () => {
  const store = "refs/arc/project/registry", working = "refs/arc/tmp/migrate/import/kept/user/andrew/errands";
  const tracked = "refs/arc-remotes/origin/project/registry", added = "refs/arc-remotes/origin/user/andrew/claims";
  const target = { ...record, refs: { local: {}, origin: {}, tracking: { [tracked]: held } } };
  const state = { ...snapshot, local: { [store]: published, [working]: published }, tracking: { [tracked]: moved, [added]: published } };
  const result = planWindowRestoreLeases(target, decision, state);
  expect(result.findings).toEqual([]);
  expect(result.origin).toEqual([]);
  expect(result.local).toEqual(expect.arrayContaining([
    { ref: store, current: published, next: null }, { ref: working, current: published, next: null },
    { ref: tracked, current: moved, next: held }, { ref: added, current: published, next: null },
  ]));
  expect(result.local).toHaveLength(4);
});

it.each([
  { ref: "refs/arc/user/alex/personal", identity: "andrew" },
  { ref: "refs/arc/user/andrew/claims", identity: null },
  { ref: "refs/arc/tmp/migrate/journal", identity: "andrew" },
  { ref: "refs/arc/user/andrew/sync-state", identity: "andrew" },
])("restricts publication leases to eligible store refs: $ref with identity $identity", ({ ref, identity }) => {
  const state = { ...snapshot, identity, local: { [ref]: published }, origin: { [ref]: published },
    tracking: { [`refs/arc-remotes/origin/${ref.slice("refs/arc/".length)}`]: published } };
  const result = planWindowRestoreLeases({ ...record, refs: { ...record.refs, origin: {} } }, decision, state);
  expect(result.findings).toContainEqual(expect.objectContaining({ subject: `origin:${ref}` }));
});
