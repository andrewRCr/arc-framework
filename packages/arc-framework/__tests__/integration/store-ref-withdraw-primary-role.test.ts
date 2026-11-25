/** Withdrawal restores completed primary roles with readable original coordinates and independent end identity. */
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { renderStoreCommitMessage } from "../../src/lib/store/commit-provenance.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

type Role = "work-item/meta" | "work-item/record";
const quarter = ArchiveQuarterSchema.parse("2026-q3"), ownQuarter = ArchiveQuarterSchema.parse("2027-q1");
const remoteQuarter = ArchiveQuarterSchema.parse("2026-q4"), provenance = { verb: "archive", lifecycleAction: "archive" };
const content = (role: Role, name: string) => role === "work-item/meta" ? makeMetaFixture(name) : JSON.stringify({ body: name });

async function start(h: RefSyncFixture, name: string, role: Role = "work-item/meta") {
  const made = success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name }, kind: role }), content: content(role, name),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  return success(await h.a.store.read({ reference: made.reference }));
}

it.each((["default", "separate"] as const).flatMap(layout => (["work-item/meta", "work-item/record"] as const)
  .map(previous => ({ layout, previous, next: previous === "work-item/meta" ? "work-item/record" as const : "work-item/meta" as const }))))(
  "withdraws a $layout batch restoring $previous from $next at its original root", async ({ layout, previous }) => {
    const { h, original, home, controls, peer, retainedPeer, ended, replacement } = await roleScenario(layout, previous);
    const transactions: string[] = [];
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      if (args.includes("update-ref") && options?.input) transactions.push(options.input);
      return h.a.ports.exec(command, args, options);
    }, execInput: async (args, input, options) => {
      if (args.includes("update-ref")) transactions.push(input);
      return h.a.ports.execInput(args, input, options);
    } });
    const result = success(await store.pull()), notices = result.pulls.flatMap(pull => pull.notices);
    expect(notices.filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(success(await store.read({ reference: original.reference }))).toMatchObject({ content: original.content, placement: original.placement });
    expect(success(await store.read({ reference: replacement })).content).toBe(original.content);
    const restored = JSON.parse((await h.a.git(["show", `${home.ref}:${home.metadataPath}`])).stdout) as { endBatch: string; primary: { role: Role } };
    expect(restored.primary.role).toBe(previous);
    expect(restored.endBatch).toBe(controls.endBatch);
    expect(success(await store.read({ reference: peer.reference }))).toMatchObject({ content: retainedPeer.content, placement: retainedPeer.placement });
    expect(transactions.some(input => input.includes(home.ref) && input.includes("refs/arc/history/work/"))).toBe(true);
    expect(success(await store.read({ reference: ended.reference })).placement).toMatchObject({ kind: "completed", quarter: remoteQuarter });
    success(await store.pull());
    expect(success(await store.read({ reference: original.reference })).placement).toEqual(original.placement);
  }, 60_000);

async function roleScenario(layout: "default" | "separate", previous: Role, replaceRole = true) {
    const h = await refSyncFixture(layout), ended = await start(h, "withdraw-ended"), item = await start(h, "withdraw-role", previous);
    success(await h.a.store.write({ action: "put", reference: item.reference, expected: item.version, content: item.content,
      placement: { kind: "completed", quarter }, provenance }));
    const original = success(await h.a.store.read({ reference: item.reference }));
    const home = expandStoredPath(original.reference, { placement: original.placement });
    const originalEntries = await entriesAt(h, home.ref);
    const controls = JSON.parse((await h.a.git(["show", `${home.ref}:${home.metadataPath}`])).stdout) as { endBatch: string; primary: { role: Role } };
    // Keep a later occupied sequence so allocating afresh cannot pass as restoring the original root.
    const peer = await start(h, "withdraw-numbered-peer");
    success(await h.a.store.write({ action: "put", reference: peer.reference, expected: peer.version, content: peer.content,
      placement: { kind: "completed", quarter }, provenance }));
    const retainedPeer = success(await h.a.store.read({ reference: peer.reference }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const primary = success(await h.a.store.read({ reference: ended.reference }));
    const next = replaceRole ? previous === "work-item/meta" ? "work-item/record" : "work-item/meta" : previous;
    const replacement = RecordReferenceSchema.parse({ ...item.reference, kind: next });
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
        placement: { kind: "completed", quarter: ownQuarter } },
      { action: "put", reference: replacement, expected: original.version, content: replaceRole ? content(next, "withdraw-role") : `${makeMetaFixture("withdraw-role")}\nUndone contribution.\n`,
        placement: { kind: "completed", quarter } },
    ], provenance }));
    const remote = success(await h.b.store.read({ reference: ended.reference }));
    success(await h.b.store.write({ action: "put", reference: remote.reference, expected: remote.version, content: remote.content,
      placement: { kind: "completed", quarter: remoteQuarter }, provenance }));
    success(await h.b.store.push());
    return { h, original, home, controls, peer, retainedPeer, ended, replacement, originalEntries };
}

async function entriesAt(h: RefSyncFixture, ref: string): Promise<PlantTreeEntry[]> {
  return (await h.a.git(["ls-tree", "-r", "-z", ref])).stdout.split("\0").filter(Boolean).map(row => {
    const match = /^100644 blob ([0-9a-f]+)\t(.*)$/su.exec(row);
    if (!match?.[1] || !match[2]) throw new Error("The retained fixture expects regular record blobs");
    return { path: match[2], mode: "100644", oid: match[1] };
  });
}

async function appendQuarter(h: RefSyncFixture, ref: string, entries: PlantTreeEntry[], message: string): Promise<void> {
  const before = (await h.a.git(["rev-parse", ref])).stdout.trim();
  await plantRef(h.a.root, ref, entries, { parents: [before], message, gitDir: h.a.gitDir });
}

it.each(["default", "separate"] as const)("allocates a compatible %s root when a later quarter has no original coordinate", async layout => {
  const f = await roleScenario(layout, "work-item/meta"), { h, replacement } = f;
  const later = ArchiveQuarterSchema.parse("2027-q2"), ref = `refs/arc/archive/${later}`;
  const current = success(await h.a.store.read({ reference: replacement }));
  success(await h.a.store.write({ action: "put", reference: replacement, expected: current.version, content: current.content,
    placement: { kind: "completed", quarter: later }, provenance }));
  const notices = success(await h.a.store.pull()).pulls.flatMap(pull => pull.notices);
  expect(notices.filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
  expect(notices).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
  const metadataPath = f.home.metadataPath.slice(f.home.root.length);
  expect(JSON.parse((await h.a.git(["show", `${ref}:01_withdraw-role/${metadataPath}`])).stdout))
    .toMatchObject({ endBatch: f.controls.endBatch, primary: { role: "work-item/meta" } });
  expect(success(await h.a.store.read({ reference: f.original.reference })).placement)
    .toMatchObject({ kind: "completed", quarter: later, sequence: "01" });
}, 60_000);

it.each((["default", "separate"] as const).flatMap(layout => (["occupied", "ambiguous"] as const).map(kind => ({ layout, kind }))))(
  "holds $layout $kind original coordinates atomically and resumes after forward repair", async ({ layout, kind }) => {
    const f = await roleScenario(layout, "work-item/meta"), { h, home, originalEntries, replacement } = f;
    const current = await entriesAt(h, home.ref), batch = randomUUID(), root = kind === "occupied" ? home.root : "07_withdraw-role/";
    const added = originalEntries.filter(entry => entry.path.startsWith(home.root)).map((entry): PlantTreeEntry => {
      const path = root + entry.path.slice(home.root.length);
      return entry.path === home.metadataPath ? { path, content: canonicalize({ ...f.controls,
        ...(kind === "occupied" ? { batch } : {}) }) } : { ...entry, path };
    });
    const metadataPath = home.metadataPath.slice(home.root.length), uid = "uid" in replacement.owner ? replacement.owner.uid : undefined;
    const history = `refs/arc/history/work/${uid}`, state = JSON.parse((await h.a.git(["show", `${history}:${metadataPath}`])).stdout) as { batch: string };
    // External retained state can leave distinct original-role witnesses inside the batch's captured after snapshot.
    const message = renderStoreCommitMessage(provenance, replacement, kind === "ambiguous" ? state.batch : batch);
    await appendQuarter(h, home.ref, [...current, ...added], message);
    if (kind === "ambiguous") await appendQuarter(h, home.ref, current, renderStoreCommitMessage(provenance, replacement, randomUUID()));
    const before = (await h.a.git(["rev-parse", history, home.ref])).stdout;
    const held = success(await h.a.store.pull()).pulls.flatMap(pull => pull.notices);
    expect(held).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", condition: expect.stringMatching(
      kind === "occupied" ? /collapse independent archived ends/u : /original coordinates.*disagree/u) }));
    expect(held.some(notice => notice.kind === "end-withdrawn")).toBe(false);
    expect((await h.a.git(["rev-parse", history, home.ref])).stdout).toBe(before);
    if (kind === "occupied") {
      const moved = added.map(entry => ({ ...entry, path: "07_withdraw-role/" + entry.path.slice(root.length) }));
      await appendQuarter(h, home.ref, [...current, ...moved], renderStoreCommitMessage(provenance, replacement, randomUUID()));
    } else {
      const primary = success(await h.a.store.read({ reference: replacement }));
      success(await h.a.store.write({ action: "put", reference: f.original.reference, expected: primary.version,
        content: f.original.content, placement: { kind: "completed", quarter }, provenance }));
    }
    const repaired = success(await h.a.store.pull()).pulls.flatMap(pull => pull.notices);
    expect(repaired.filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(repaired).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(success(await h.a.store.read({ reference: f.original.reference })).content).toBe(f.original.content);
    if (kind === "occupied") expect(JSON.parse((await h.a.git(["show", `${home.ref}:07_withdraw-role/${metadataPath}`])).stdout)).toMatchObject({ endBatch: f.controls.endBatch });
  }, 60_000);

it.each(["default", "separate"] as const)("retains ordinary %s completed-copy inverse behavior", async layout => {
  const f = await roleScenario(layout, "work-item/meta", false);
  const notices = success(await f.h.a.store.pull()).pulls.flatMap(pull => pull.notices);
  expect(notices.filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
  expect(notices).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
  expect(success(await f.h.a.store.read({ reference: f.original.reference })))
    .toMatchObject({ content: f.original.content, placement: f.original.placement });
});
