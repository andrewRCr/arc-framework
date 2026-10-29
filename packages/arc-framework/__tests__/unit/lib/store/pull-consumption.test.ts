/** A consumer stops only for the state remote and surfaces every notice and failed read source beside it. */
import { describe, expect, it } from "vitest";
import { consumePull, pullOutcomeNotices } from "../../../../src/lib/store/pull-consumption.js";
import type { PullResult } from "../../../../src/lib/store/operational-sync.js";
import { PullResultSchema, type PullOutcome, type SyncState } from "../../../../src/lib/store/sync.js";
import { OwnerIdentitySchema, RecordReferenceSchema } from "../../../../src/lib/store/identity.js";

const item = OwnerIdentitySchema.parse({ type: "work-item", name: "alpha", uid: "11111111-1111-4111-8111-111111111111" });
const conflict = RecordReferenceSchema.parse({ kind: "work-item/conflict-record", owner: item, key: "held" });
const ended = { kind: "ended-with-conflicts" as const, item, conflicts: [conflict], condition: "Alpha ended with conflicts.",
  remedy: { text: "Resolve alpha's retained conflicts." } };
const repair = { text: "Reconnect and retry." };
const failed = (role: "state" | "read" | "candidate"): PullOutcome => ({ status: "failed", remote: role === "read" ? "upstream" : "origin",
  role, families: ["work-item"], notices: [], failure: { code: "unreachable", class: "recoverable", cause: "network",
    condition: `The ${role} remote is offline.`, remedy: repair } });
const statePulled: PullOutcome = { status: "pulled", remote: "origin", role: "state", families: ["work-item"], notices: [ended] };
const incomplete = (pulls: PullOutcome[], states: SyncState[] = []): PullResult => ({
  status: "incomplete", condition: "The pull was incomplete.", remedy: repair, partial: PullResultSchema.parse({ states, pulls }) });

describe("consumePull", () => {
  it("proceeds past a lone failed read source and reports it with the state pull's notices", () => {
    const result = consumePull(incomplete([statePulled, failed("read")]));
    expect(result.kind).toBe("proceed");
    const notices = result.kind === "proceed" ? result.notices : [];
    expect(notices[0]).toBe("Read source upstream was not pulled: The read remote is offline. Reconnect and retry.");
    expect(notices[1]).toContain("Alpha ended with conflicts.");
    expect(notices[1]).toContain(JSON.stringify(conflict));
    expect(notices).toHaveLength(2);
  });

  it.each(["state", "candidate"] as const)("stops on a failed %s remote", role => {
    expect(consumePull(incomplete([failed(role)]))).toEqual({ kind: "stop", reason: "The pull was incomplete. Reconnect and retry." });
  });

  it("stops on a state the state remote reports, and on a refused pull with no partial result", () => {
    expect(consumePull(incomplete([], [{ status: "move-incomplete", condition: "Moving.", remedy: repair }])).kind).toBe("stop");
    expect(consumePull({ status: "unreachable", condition: "Offline.", remedy: repair })).toEqual({ kind: "stop", reason: "Offline. Reconnect and retry." });
  });

  it("surfaces a complete pull's notices and an unfinished move's advisory", () => {
    const result = consumePull({ status: "pulled", notices: [ended], advisories: [{ condition: "The old source awaits cleanup.", remedy: repair }] });
    expect(result).toEqual({ kind: "proceed", notices: [expect.stringContaining("Alpha ended with conflicts."),
      "The old source awaits cleanup. Reconnect and retry."] });
  });
});

it("renders every outcome's notices once, with each failed read source first", () => {
  const notices = pullOutcomeNotices([statePulled, { ...statePulled, remote: "backup" }, failed("read"), failed("state")]);
  expect(notices).toEqual(["Read source upstream was not pulled: The read remote is offline. Reconnect and retry.",
    expect.stringContaining("Alpha ended with conflicts.")]);
});
