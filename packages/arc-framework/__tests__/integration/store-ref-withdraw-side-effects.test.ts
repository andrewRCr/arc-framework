import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";

const ownQuarter = ArchiveQuarterSchema.parse("2027-q1"), remoteQuarter = ArchiveQuarterSchema.parse("2026-q4");
const provenance = { verb: "archive", lifecycleAction: "archive" };

describe.each(["default", "separate"] as const)("withdrawal side effects in the %s layout", (layout) => {
  it.each([false, true])("reopens a batch-closed cohort atomically unless the published end closed it too: %s", async (closedRemotely) => {
    const h = await refSyncFixture(layout);
    const cohort = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "cohort", name: "ending-cohort" }, kind: "cohort/document" }),
      content: "# Ending Cohort\n\n**Purpose:** Finish the member.\n", provenance }));
    const member = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "cohort-member" }, kind: "work-item/meta" }),
      content: makeMetaFixture("cohort-member", { cohort: "ending-cohort" }), placement: { kind: "active" },
      provenance: { verb: "start", lifecycleAction: "activate" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const close = async (side: typeof h.a, quarter: typeof ownQuarter, withCohort: boolean) => {
      const primary = success(await side.store.read({ reference: member.reference }));
      const document = success(await side.store.read({ reference: cohort.reference }));
      success(await side.store.batch({ writes: [
        { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter } },
        ...withCohort ? [{ action: "put" as const, reference: document.reference, expected: document.version,
          content: document.content, placement: { kind: "completed" as const, quarter } }] : [],
      ], provenance }));
    };
    await close(h.a, ownQuarter, true); await close(h.b, remoteQuarter, closedRemotely); success(await h.b.store.push());
    if (!("uid" in member.reference.owner) || !("uid" in cohort.reference.owner)) throw new Error("The records need UIDs");
    const history = `refs/arc/history/work/${member.reference.owner.uid}`;
    const cohortLive = `refs/arc/cohort/${cohort.reference.owner.uid}`, cohortHistory = cohortLive.replace("refs/arc/", "refs/arc/history/");
    const snapshots: { refs: string; folders: string }[] = [];
    const observer = createRefStore({ ...h.a.ports, execInput: async (args, input, options) => {
      const result = await h.a.ports.execInput(args, input, options);
      if (args.includes("update-ref")) {
        const message = (await h.a.git(["log", "-1", "--format=%B", history])).stdout;
        if (message.includes("Arc-Lifecycle-Action: withdraw-end")) snapshots.push({
          refs: (await h.a.git(["for-each-ref", "--format=%(refname)", cohortLive, cohortHistory])).stdout,
          folders: (await h.a.git(["ls-tree", "--name-only", `refs/arc/archive/${ownQuarter}`])).stdout,
        });
      }
      return result;
    } });
    const result = success(await observer.pull());
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: member.reference.owner }));
    expect(snapshots.length).toBeGreaterThan(0);
    for (const snapshot of snapshots) {
      expect(snapshot.refs).toBe(closedRemotely ? cohortHistory : cohortLive);
      expect(snapshot.folders).toBe("");
    }
    const read = success(await h.a.store.read({ reference: cohort.reference }));
    expect(read.content).toBe("# Ending Cohort\n\n**Purpose:** Finish the member.\n");
    if (closedRemotely) expect(read.placement).toMatchObject({ kind: "completed", quarter: remoteQuarter });
    else expect(read.placement).toBeUndefined();
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
  });
  it.each([
    { scope: "project", returnedRemotely: false }, { scope: "project", returnedRemotely: true },
    { scope: "personal", returnedRemotely: false }, { scope: "personal", returnedRemotely: true },
  ] as const)("inverts its $scope inbox return and receipt (published return: $returnedRemotely)", async ({ scope, returnedRemotely }) => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "returned-entry" }, kind: "work-item/meta" }),
      content: makeMetaFixture("returned-entry"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const owner = scope === "project" ? { type: "project", name: "project" } : { type: "person", name: "andrew" };
    const reference = RecordReferenceSchema.parse({ owner, kind: scope === "project" ? "project-inbox/inbox" : "personal/inbox" });
    const receipt = (key: string) => RecordReferenceSchema.parse({ owner,
      kind: scope === "project" ? "project-inbox/routing-receipt" : "personal/routing-receipt", key });
    const empty = scope === "project" ? "# Atomic Inbox\n\n## Inbox\n\n" : "# User Inbox\n\n## Errand\n\n## Work Unit\n\n";
    const entry = "### Returned concern\n\n- _Id:_ `11111111`\n\nReturned concern.\n";
    const unrelated = "### New concern\n\n- _Id:_ `22222222`\n\nCaptured independently.\n";
    const route = { verb: "route", lifecycleAction: "archive" };
    success(await h.a.store.batch({ writes: [
      { action: "put", reference, expected: null, content: empty },
      { action: "put", reference: receipt("before"), expected: null, content: '"before"' },
    ], provenance: route }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const primary = success(await h.a.store.read({ reference: made.reference })), inbox = success(await h.a.store.read({ reference }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter: ownQuarter } },
      { action: "put", reference, expected: inbox.version, content: empty + entry },
      { action: "put", reference: receipt("own-return"), expected: null, content: '"own"' },
    ], provenance: route }));
    const remotePrimary = success(await h.b.store.read({ reference: made.reference }));
    const remoteInbox = success(await h.b.store.read({ reference }));
    if (!returnedRemotely) success(await h.b.store.write({ action: "put", reference, expected: remoteInbox.version,
      content: empty + unrelated, provenance: { verb: "save", lifecycleAction: "capture" } }));
    success(await h.b.store.batch({ writes: [
      { action: "put", reference: remotePrimary.reference, expected: remotePrimary.version, content: remotePrimary.content,
        placement: { kind: "completed", quarter: remoteQuarter } },
      ...returnedRemotely ? [
        { action: "put" as const, reference, expected: remoteInbox.version, content: empty + entry },
        { action: "put" as const, reference: receipt("published-return"), expected: null, content: '"published"' },
      ] : [],
    ], provenance: route }));
    success(await h.b.store.push());
    const pulled = success(await h.a.store.pull());
    expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    const content = success(await h.a.store.read({ reference })).content;
    expect(content).toBe(empty + (returnedRemotely ? entry : unrelated));
    expect(await h.a.store.read({ reference: receipt("own-return") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await h.a.store.read({ reference: receipt("before") })).content).toBe('"before"');
    if (returnedRemotely) expect(success(await h.a.store.read({ reference: receipt("published-return") })).content).toBe('"published"');
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
  });

});
