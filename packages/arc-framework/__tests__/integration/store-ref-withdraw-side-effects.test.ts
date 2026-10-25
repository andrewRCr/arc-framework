import { describe, expect, it } from "vitest";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, createKindRegistry, RecordReferenceSchema, RoutingReceiptSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";

const ownQuarter = ArchiveQuarterSchema.parse("2027-q1"), remoteQuarter = ArchiveQuarterSchema.parse("2026-q4");
const provenance = { verb: "archive", lifecycleAction: "archive" };

describe.each(["default", "separate"] as const)("withdrawal side effects in the %s layout", (layout) => {
  it.each(layout === "default" ? [false, true] : [false])("reopens a batch-closed cohort atomically unless the published end closed it too: %s", async (closedRemotely) => {
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
        if (message.includes("Arc-Lifecycle-Action: withdraw-end")) {
          const batchId = /^Arc-Batch: (.+)$/mu.exec(message)?.[1];
          const receipt = /^Arc-Creation-Receipt: (.+)$/mu.exec(message)?.[1];
          expect(receipt && JSON.parse(receipt)).toEqual({ schemaVersion: 1, batchId, createdOwners: [] });
          snapshots.push({
          refs: (await h.a.git(["for-each-ref", "--format=%(refname)", cohortLive, cohortHistory])).stdout,
          folders: (await h.a.git(["ls-tree", "--name-only", `refs/arc/archive/${ownQuarter}`])).stdout,
        });
        }
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
  if (layout === "default") {
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
      const routeContent = (source: string | null, destination: string) => canonicalize(RoutingReceiptSchema.parse({
        entryId: "11111111", source: source === null ? null : { list: source },
        destination: { list: destination, ...(scope === "personal" ? { identity: "andrew" } : {}) },
        time: "2026-01-01T00:00:00Z",
      }));
      if (made.reference.owner.type !== "work-item" || !made.reference.owner.uid) throw new Error("Expected a work UID");
      const beforeReceipt = routeContent(null, made.reference.owner.uid);
      const returnedReceipt = routeContent(made.reference.owner.uid, scope);
      const empty = scope === "project" ? "# Atomic Inbox\n\n## Inbox\n\n" : "# User Inbox\n\n## Errand\n\n## Work Unit\n\n";
      const entry = "### **Returned concern**\n\n- _Id:_ `11111111`\n\nReturned concern.\n";
      const unrelated = "### **New concern**\n\n- _Id:_ `22222222`\n\nCaptured independently.\n";
      const route = { verb: "route", lifecycleAction: "archive" };
      success(await h.a.store.batch({ writes: [
        { action: "put", reference, expected: null, content: empty },
        { action: "put", reference: receipt("before"), expected: null, content: beforeReceipt },
      ], provenance: route }));
      success(await h.a.store.push()); success(await h.b.store.pull());
      const primary = success(await h.a.store.read({ reference: made.reference })), inbox = success(await h.a.store.read({ reference }));
      success(await h.a.store.batch({ writes: [
        { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter: ownQuarter } },
        { action: "put", reference, expected: inbox.version, content: empty + entry },
        { action: "put", reference: receipt("own-return"), expected: null, content: returnedReceipt },
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
          { action: "put" as const, reference: receipt("published-return"), expected: null, content: returnedReceipt },
        ] : [],
      ], provenance: route }));
      success(await h.b.store.push());
      const pulled = success(await h.a.store.pull());
      expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
      const content = success(await h.a.store.read({ reference })).content;
      expect(content).toBe(empty + (returnedRemotely ? entry : unrelated));
      expect(await h.a.store.read({ reference: receipt("own-return") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(success(await h.a.store.read({ reference: receipt("before") })).content).toBe(beforeReceipt);
      if (returnedRemotely) expect(success(await h.a.store.read({ reference: receipt("published-return") })).content).toBe(returnedReceipt);
      expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    });

    it("holds a withdrawal whose quarter tree goes missing under its locks, then withdraws once the tree is restored", async () => {
      const h = await refSyncFixture(layout);
      const start = async (name: string) => success(await h.a.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name }, kind: "work-item/meta" }),
        content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
      const member = await start("withdrawn-member"), other = await start("kept-neighbor");
      success(await h.a.store.push()); success(await h.b.store.pull());
      const close = async (side: typeof h.a, made: typeof member, quarter: typeof ownQuarter) => {
        const current = success(await side.store.read({ reference: made.reference }));
        success(await side.store.write({ action: "put", reference: current.reference, expected: current.version,
          content: current.content, placement: { kind: "completed", quarter }, provenance }));
      };
      await close(h.a, member, ownQuarter); await close(h.a, other, ownQuarter);
      await close(h.b, member, remoteQuarter); success(await h.b.store.push());
      const quarterRef = `refs/arc/archive/${ownQuarter}`, before = (await h.a.git(["rev-parse", quarterRef])).stdout;
      const neighbor = (await h.a.git(["ls-tree", quarterRef])).stdout.split("\n").find((row) => row.endsWith("kept-neighbor"));
      const tree = neighbor?.split(/\s+/u)[2];
      if (!tree) throw new Error("The neighbor's folder tree was not found");
      const bytes = (await h.a.ports.rawExec(["cat-file", "tree", tree], { cwd: h.a.root, objectAccess: "local-only" })).stdout;
      let damage = true;
      const racing = createRefStore({ ...h.a.ports, lock: async (ref, wait) => {
        const release = await h.a.ports.lock(ref, wait);
        if (damage && ref === quarterRef) { damage = false; await removeLooseObject(h.a.root, tree); }
        return release;
      } });
      const held = success(await racing.pull()).pulls.flatMap(({ notices }) => notices);
      expect(damage).toBe(false);
      expect(held).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: quarterRef,
        remedy: { text: expect.stringMatching(/restore|fetch/iu) } }));
      expect(held).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
      expect((await h.a.git(["rev-parse", quarterRef])).stdout).toBe(before);
      await h.a.ports.rawExec(["hash-object", "-t", "tree", "-w", "--stdin"], { cwd: h.a.root, input: bytes, objectAccess: "local-only" });
      const withdrawn = success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices);
      expect(withdrawn).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: member.reference.owner }));
      expect((await h.a.git(["ls-tree", "--name-only", quarterRef])).stdout.split("\n")).toEqual([neighbor?.split("\t")[1]]);
      expect(success(await h.a.store.read({ reference: other.reference })).placement).toMatchObject({ kind: "completed", quarter: ownQuarter });
    });
  }

  const originalJournalCases = layout === "default" ? [
    { localQuarter: ownQuarter, publishedQuarter: remoteQuarter },
    { localQuarter: remoteQuarter, publishedQuarter: ownQuarter },
  ] : [{ localQuarter: ownQuarter, publishedQuarter: remoteQuarter }];
  it.each(originalJournalCases)("holds a damaged original journal before locking across retries ($localQuarter versus $publishedQuarter)", async ({ localQuarter, publishedQuarter }) => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "original-journal" }, kind: "work-item/meta" }),
      content: makeMetaFixture("original-journal"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const primary = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: made.reference, expected: primary.version, content: primary.content,
      placement: { kind: "completed", quarter: localQuarter }, provenance }));
    const quarterRef = `refs/arc/archive/${localQuarter}`;
    const originalTree = (await h.a.git(["ls-tree", quarterRef])).stdout.trim().split(/\s+/u)[2];
    if (!originalTree) throw new Error("Expected the original archive folder tree");
    const scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
    const bytes = (await h.a.ports.rawExec([...scope, "cat-file", "tree", originalTree], { cwd: h.a.root, objectAccess: "local-only" })).stdout;
    const companion = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: made.reference.owner, key: "journal-late" });
    success(await h.a.store.write({ action: "put", reference: companion, expected: null, content: "A retained later edit.\n",
      provenance: { verb: "save", lifecycleAction: "save" } }));
    expect((await h.a.git(["ls-tree", quarterRef])).stdout.trim().split(/\s+/u)[2]).not.toBe(originalTree);
    const remote = success(await h.b.store.read({ reference: made.reference }));
    success(await h.b.store.write({ action: "put", reference: made.reference, expected: remote.version, content: remote.content,
      placement: { kind: "completed", quarter: publishedQuarter }, provenance }));
    success(await h.b.store.push());
    const owner = made.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a minted work item");
    const history = `refs/arc/history/work/${owner.uid}`;
    const before = (await h.a.git(["rev-parse", quarterRef])).stdout;
    const ownHistory = (await h.a.git(["rev-parse", history])).stdout;
    const publishedHistory = (await h.remote("git", ["rev-parse", history])).stdout;
    await removeLooseObject(h.a.root, originalTree, h.a.gitDir);
    for (const operation of ["pull", "pull", "push"] as const) {
      const notices = success(await h.a.store[operation]()).pulls.flatMap(({ notices }) => notices);
      expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: quarterRef,
        remedy: { text: expect.stringMatching(/restore|fetch/iu) } }));
      expect(notices).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
      expect((await h.a.git(["rev-parse", quarterRef])).stdout).toBe(before);
      expect((await h.a.git(["rev-parse", history])).stdout).toBe(ownHistory);
      expect((await h.remote("git", ["rev-parse", history])).stdout).toBe(publishedHistory);
    }
    await h.a.ports.rawExec([...scope, "hash-object", "-t", "tree", "-w", "--stdin"], { cwd: h.a.root, input: bytes, objectAccess: "local-only" });
    const repaired = success(await h.a.store.pull());
    expect(repaired.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: owner }));
    expect(success(await h.a.store.read({ reference: made.reference })).placement).toMatchObject({ kind: "completed", quarter: publishedQuarter });
    expect(success(await h.a.store.read({ reference: companion })).content).toBe("A retained later edit.\n");
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
  });

  if (layout === "default") it.each((["project", "personal"] as const).flatMap(scope =>
    (["metadata", "entry"] as const).map(damagedObject => ({ scope, damagedObject }))))(
    "holds a damaged $scope $damagedObject journal across retries and push, then repairs its inverse",
    async ({ scope, damagedObject }) => {
      const h = await refSyncFixture(layout);
      const made = success(await h.a.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "journal-member" }, kind: "work-item/meta" }),
        content: makeMetaFixture("journal-member"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
      const owner = scope === "project" ? { type: "project", name: "project" } : { type: "person", name: "andrew" };
      const reference = RecordReferenceSchema.parse({ owner, kind: scope === "project" ? "project-inbox/inbox" : "personal/inbox" });
      const receipt = (key: string) => RecordReferenceSchema.parse({ owner,
        kind: scope === "project" ? "project-inbox/routing-receipt" : "personal/routing-receipt", key });
      if (made.reference.owner.type !== "work-item" || !made.reference.owner.uid) throw new Error("Expected a minted work item");
      const uid = made.reference.owner.uid, route = { verb: "route", lifecycleAction: "archive" };
      const routeContent = (source: string | null, destination: string) => canonicalize(RoutingReceiptSchema.parse({
        entryId: "11111111", source: source === null ? null : { list: source },
        destination: { list: destination, ...(scope === "personal" ? { identity: "andrew" } : {}) }, time: "2026-01-01T00:00:00Z",
      }));
      const empty = scope === "project" ? "# Atomic Inbox\n\n## Inbox\n\n" : "# User Inbox\n\n## Errand\n\n## Work Unit\n\n";
      const entry = "### **Returned concern**\n\n- _Id:_ `11111111`\n\nReturned concern.\n";
      const unrelated = "### **New concern**\n\n- _Id:_ `22222222`\n\nCaptured independently.\n";
      success(await h.a.store.batch({ writes: [
        { action: "put", reference, expected: null, content: empty },
        { action: "put", reference: receipt("before"), expected: null, content: routeContent(null, uid) },
      ], provenance: route }));
      success(await h.a.store.push()); success(await h.b.store.pull());
      const primary = success(await h.a.store.read({ reference: made.reference })), inbox = success(await h.a.store.read({ reference }));
      success(await h.a.store.batch({ writes: [
        { action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
          placement: { kind: "completed", quarter: ownQuarter } },
        { action: "put", reference, expected: inbox.version, content: empty + entry },
        { action: "put", reference: receipt("own-return"), expected: null, content: routeContent(uid, scope) },
      ], provenance: route }));
      const home = expandStoredPath(reference, { registry: createKindRegistry(PRODUCTION_REGISTRATIONS) });
      const journal = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
      const path = damagedObject === "metadata" ? home.metadataPath : home.path;
      const oid = (await h.a.git(["rev-parse", `${journal}:${path}`])).stdout.trim();
      const bytes = (await h.a.ports.rawExec(["cat-file", "blob", oid], { cwd: h.a.root, objectAccess: "local-only" })).stdout;
      const publishedPrimary = success(await h.b.store.read({ reference: made.reference }));
      const publishedInbox = success(await h.b.store.read({ reference }));
      success(await h.b.store.batch({ writes: [
        { action: "put", reference: publishedPrimary.reference, expected: publishedPrimary.version, content: publishedPrimary.content,
          placement: { kind: "completed", quarter: remoteQuarter } },
        { action: "put", reference, expected: publishedInbox.version, content: empty + unrelated },
      ], provenance: route }));
      success(await h.b.store.push());
      const history = `refs/arc/history/work/${uid}`, ownHistory = (await h.a.git(["rev-parse", history])).stdout;
      const publishedHistory = (await h.remote("git", ["rev-parse", history])).stdout;
      let acquisitions = 0, damaged = false;
      const racing = createRefStore({ ...h.a.ports, lock: async (ref, wait) => {
        const release = await h.a.ports.lock(ref, wait);
        if (ref === home.ref && ++acquisitions === 2) { await removeLooseObject(h.a.root, oid); damaged = true; }
        return release;
      } });
      const assertHeld = (notices: import("../../src/lib/store/sync.js").PullNotice[]) => {
        expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref,
          remedy: { text: expect.stringMatching(/restore|fetch/iu) } }));
        expect(notices).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
      };
      assertHeld(success(await racing.pull()).pulls.flatMap(({ notices }) => notices));
      expect(damaged).toBe(true);
      for (const operation of ["pull", "push"] as const) {
        assertHeld(success(await racing[operation]()).pulls.flatMap(({ notices }) => notices));
        expect((await h.a.git(["rev-parse", history])).stdout).toBe(ownHistory);
        expect((await h.remote("git", ["rev-parse", history])).stdout).toBe(publishedHistory);
      }
      await h.a.ports.rawExec(["hash-object", "-w", "--stdin"], { cwd: h.a.root, input: bytes, objectAccess: "local-only" });
      const repaired = success(await h.a.store.pull());
      expect(repaired.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: made.reference.owner }));
      expect(success(await h.a.store.read({ reference: made.reference })).placement).toMatchObject({ kind: "completed", quarter: remoteQuarter });
      expect(success(await h.a.store.read({ reference })).content).toBe(empty + unrelated);
      expect(await h.a.store.read({ reference: receipt("own-return") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(success(await h.a.store.read({ reference: receipt("before") })).content).toBe(routeContent(null, uid));
      expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    },
  );

});
