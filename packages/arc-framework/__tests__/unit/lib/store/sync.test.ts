/** Sync envelopes retain configuration states, remote notices, and measured publication outcomes. */
import { describe, expect, it } from "vitest";
import {
  CarryOutcomeSchema, HistoryRefSchema, MaintainResultSchema, OwnerIdentitySchema,
  PublishOutcomeSchema, PullInputSchema, PullNoticeSchema, PullOutcomeSchema, PullResultSchema,
  PushInputSchema, PushResultSchema, SyncStateSchema, recordReferences,
} from "../../../../src/lib/store/index.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../helpers/schema-assertion.js";

const remedy = { text: "Repair the reported state and retry." };
const uid = "11111111-1111-4111-8111-111111111111";
const item = OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid });
const reference = recordReferences["work-item/meta"](item);
const sha = "a".repeat(40);
const ref = `refs/arc/history/work/${uid}`;
const families = ["work-item"];
const failure = { code: "unreachable", class: "recoverable", cause: "network", condition: "Offline", remedy };
const states = [
  { status: "designation-ambiguous", remotes: ["origin", "state"], remedy },
  { status: "move-incomplete", condition: "Copy interrupted", remedy },
  { status: "move-unfinished", condition: "Cleanup remains", remedy },
  { status: "moved", remote: "replacement", remedy },
  { status: "designation-needed", remote: "origin", choices: ["push", "read", "off"], remedy },
];
const notices = [
  { kind: "history-diverged", ref, local: sha, remote: "b".repeat(40), condition: "History moved", remedy },
  { kind: "tracking-update-failed", ref, condition: "Locked", remedy },
  { kind: "ended-with-conflicts", item, conflicts: [reference] },
  { kind: "end-withdrawn", item, condition: "Late edit", remedy },
  { kind: "ended-twice", item, condition: "Two ends", remedy },
  { kind: "rule-broken", reference, rule: "owner", condition: "Missing owner", remedy },
  { kind: "end-pending", item, ref, condition: "History not fetched", remedy },
  { kind: "namespace-corrupt", ref, condition: "Invalid metadata", remedy },
];

describe("sync configuration states", () => {
  it.each(states)("preserves $status with its remedy", (state) => {
    expect(assertSchemaAccepts(SyncStateSchema, state)).toEqual(state);
    assertSchemaRefuses(SyncStateSchema, { ...state, remedy: undefined });
  });
  it.each(states)("reports $status only once in either result", (state) => {
    assertSchemaRefuses(PullResultSchema, { states: [state, state], pulls: [] });
    assertSchemaRefuses(PushResultSchema, { states: [state, state], pulls: [], publishes: [] });
    expect(assertSchemaAccepts(PullResultSchema, { states: [state], pulls: [] }).states).toEqual([state]);
  });
});

describe("remote operation inputs", () => {
  it.each(["work", "cohort"])("accepts a %s history ref by name", (family) => {
    const historyRef = `refs/arc/history/${family}/${uid}`;
    expect(assertSchemaAccepts(HistoryRefSchema, historyRef)).toBe(historyRef);
    expect(assertSchemaAccepts(PullInputSchema, { history: [historyRef] })).toEqual({ history: [historyRef] });
  });
  it.each(["refs/arc/work/example", "refs/arc/history/other/example", "refs/arc/history/work/", { ref }])(
    "rejects an invalid history ref %j", (value) => assertSchemaRefuses(HistoryRefSchema, value),
  );
  it("keeps history optional and refuses unknown input fields", () => {
    expect(assertSchemaAccepts(PullInputSchema, {})).toEqual({});
    assertSchemaRefuses(PullInputSchema, { history: [ref], unexpected: true });
  });
  it("preserves an optional code-ref lease without supplying one", () => {
    expect(assertSchemaAccepts(PushInputSchema, {})).toEqual({});
    const carry = { ref: "refs/heads/topic", expect: sha };
    expect(assertSchemaAccepts(PushInputSchema, { carry })).toEqual({ carry });
    expect(assertSchemaAccepts(PushInputSchema, { carry: { ref: carry.ref } })).toEqual({ carry: { ref: carry.ref } });
    assertSchemaRefuses(PushInputSchema, { carry: { ...carry, expect: "short" } });
    assertSchemaRefuses(PushInputSchema, { carry, unexpected: true });
  });
});

describe("pull outcomes and notices", () => {
  it.each(notices)("preserves the $kind notice", (notice) => {
    expect(assertSchemaAccepts(PullNoticeSchema, notice)).toEqual(notice);
    assertSchemaRefuses(PullNoticeSchema, { ...notice, unexpected: true });
  });
  it("refuses an unknown notice kind", () => {
    assertSchemaRefuses(PullNoticeSchema, { kind: "invented", condition: "Unknown", remedy });
  });
  it.each(["pulled", "noop"])("preserves %s and its remote notices", (status) => {
    const outcome = { status, remote: "origin", role: "state", families, notices };
    expect(assertSchemaAccepts(PullOutcomeSchema, outcome)).toEqual(outcome);
    assertSchemaRefuses(PullOutcomeSchema, { ...outcome, role: "candidate" });
    assertSchemaRefuses(PullOutcomeSchema, { ...outcome, failure });
  });
  it.each(["state", "read", "candidate"])("retains a failed %s pull with partial notices", (role) => {
    const outcome = { status: "failed", remote: "origin", role, families, failure, notices };
    expect(assertSchemaAccepts(PullOutcomeSchema, outcome)).toEqual(outcome);
    const refused = { code: "refused", class: "terminal", message: "Incomplete clone", condition: "Incomplete", remedy };
    expect(assertSchemaAccepts(PullOutcomeSchema, { ...outcome, failure: refused })).toEqual({ ...outcome, failure: refused });
    assertSchemaRefuses(PullOutcomeSchema, { ...outcome, failure: { code: "retries-exhausted", class: "recoverable", condition: "Contention", remedy, retryCount: 3, waitedMs: 30 } });
  });
});

describe("push outcomes and maintenance", () => {
  it.each(["pushed", "noop", "reconciled", "failed"])("requires measurements on %s", (status) => {
    const outcome = { status, families, ...(status === "failed" ? { failure } : {}), retryCount: 2, waitedMs: 30 };
    expect(assertSchemaAccepts(PublishOutcomeSchema, outcome)).toEqual(outcome);
    assertSchemaRefuses(PublishOutcomeSchema, { ...outcome, retryCount: undefined });
    assertSchemaRefuses(PublishOutcomeSchema, { ...outcome, waitedMs: undefined });
    assertSchemaRefuses(PublishOutcomeSchema, { ...outcome, retryCount: -1 });
    assertSchemaRefuses(PublishOutcomeSchema, { ...outcome, waitedMs: -1 });
  });
  it.each([
    { ref: "refs/heads/topic", status: "pushed" },
    { ref: "refs/heads/topic", status: "refused", reason: "stale-info", message: "Lease lost" },
    { ref: "refs/heads/topic", status: "unreachable", cause: "auth" },
  ])("preserves a carried ref's $status result", (carry) => {
    expect(assertSchemaAccepts(CarryOutcomeSchema, carry)).toEqual(carry);
    const result = { states: [], pulls: [], publishes: [], carry };
    expect(assertSchemaAccepts(PushResultSchema, result)).toEqual(result);
    assertSchemaRefuses(CarryOutcomeSchema, { ...carry, unexpected: true });
  });
  it.each(["non-fast-forward", "fetch-first", "stale-info", "raced", "remote-rejected", "hook-declined", "no-push-destination"])(
    "accepts the carried ref refusal %s", (reason) => {
      const value = { ref: "refs/heads/topic", status: "refused", reason, message: "Refused" };
      expect(assertSchemaAccepts(CarryOutcomeSchema, value)).toEqual(value);
    },
  );
  it("refuses an unknown carried-ref rejection", () => {
    assertSchemaRefuses(CarryOutcomeSchema, { ref: "refs/heads/topic", status: "refused", reason: "invented", message: "Unknown" });
  });
  it.each([{ measurements: null }, { measurements: [] }, { measurements: [{ ref: "refs/arc/project/registry", commits: 12, diskBytes: 400 }] }])(
    "retains maintenance measurements $measurements", ({ measurements }) => {
      expect(assertSchemaAccepts(MaintainResultSchema, { measurements })).toEqual({ measurements });
      assertSchemaRefuses(MaintainResultSchema, { measurements, unexpected: true });
    },
  );
  it("refuses invalid maintenance counters", () => {
    assertSchemaRefuses(MaintainResultSchema, { measurements: [{ ref, commits: -1, diskBytes: 20 }] });
    assertSchemaRefuses(MaintainResultSchema, { measurements: [{ ref, commits: 1, diskBytes: -1 }] });
  });
});
