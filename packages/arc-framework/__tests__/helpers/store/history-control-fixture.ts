/** Genuine completed owners and live cohort conflicts, with explicit external history boundaries. */
import { dirname, join } from "node:path";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema } from "../../../src/lib/store/index.js";
import { expandStoredPath } from "../../../src/lib/store/stored-path.js";
import type { RefMetadata } from "../../../src/lib/store/ref/metadata.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { preparedRefSync, createRefSyncCheckout, type RefSyncFixture } from "./ref-sync.js";
import { transientContent } from "./in-repo-substrates.js";
import { capturedEntries } from "./ref-fixture-plant.js";
import { plantRef, type PlantTreeEntry } from "./ref-plant.js";
import { success } from "./suite-tools.js";

export type Layout = "default" | "separate";
export type Role = "work-item/meta" | "work-item/record" | "cohort/document";
export type Client = RefSyncFixture["a"];
export const quarter = ArchiveQuarterSchema.parse("2026-q4");
export const save = { verb: "save", lifecycleAction: "save" };
export const archive = { verb: "archive", lifecycleAction: "archive" };

export async function metadataAt(client: Client, ref: string, path: string): Promise<RefMetadata> {
  return JSON.parse((await client.git(["show", `${ref}:${path}`])).stdout) as RefMetadata;
}

export async function historyControlFixture(layout: Layout, role: Role, publication: "published" | "local" = "published") {
  return preparedRefSync(`history-control-origin-${layout}-${role}-${publication}`, layout, async h => {
    const reference = RecordReferenceSchema.parse({ kind: role, owner: { type: role === "cohort/document" ? "cohort" : "work-item", name: "control-owner" } });
    const content = role === "work-item/meta" ? makeMetaFixture(reference.owner.name)
      : role === "work-item/record" ? transientContent(reference) : "# Control cohort\n\n**Purpose:** Original.\n";
    const made = success(await h.a.store.write({ action: "put", reference, content, expected: null,
      ...(role === "cohort/document" ? {} : { placement: { kind: "active" as const } }), provenance: { verb: "start", lifecycleAction: "activate" } }));
    const open = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    success(await h.a.store.write({ action: "put", reference: open.reference, content: open.content, expected: open.version,
      placement: { kind: "completed", quarter }, provenance: archive }));
    const record = success(await h.a.store.read({ reference: open.reference }));
    const home = expandStoredPath(record.reference, { history: true }), folder = expandStoredPath(record.reference, { placement: record.placement });
    const history = HistoryRefSchema.parse(home.ref);
    if (publication === "published") {
      success(await h.a.store.push()); success(await h.b.store.pull({ history: [history] }));
    }
    return { record, open, home, folder, history, metadata: await metadataAt(h.a, history, home.metadataPath),
      folderMetadata: await metadataAt(h.a, folder.ref, folder.metadataPath) };
  });
}

export async function plantHistory(client: Client, ref: string, entries: PlantTreeEntry[], parent: string, message: string) {
  return plantRef(client.root, ref, entries, { parents: [parent], message, gitDir: client.gitDir });
}

export async function publishHistory(h: RefSyncFixture, history: string) {
  await h.b.git(["push", h.remoteName, `${history}:${history}`]);
}

export async function cohortLiveConflictFixture(layout: Layout) {
  return preparedRefSync(`cohort-live-control-authority-${layout}`, layout, async h => {
    const reference = RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "cohort-control" } });
    const content = "# Cohort control\n\n**Purpose:** Common original.\n";
    const made = success(await h.a.store.write({ action: "put", reference, content, expected: null, provenance: save }));
    const original = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const root = join(dirname(h.cloneA), "cloneC");
    await h.a.exec("git", ["clone", h.origin, root]);
    for (const [key, value] of [["arc.identity", "andrew"], ["user.name", "Fixture Writer"], ["user.email", "fixture@example.test"],
      ...layout === "default" ? [["remote.origin.arc-state", "push"]] : []]) await h.a.exec("git", ["-C", root, "config", key!, value!]);
    const c = await createRefSyncCheckout(root, layout, h.origin);
    success(await c.store.pull());
    for (const [side, word] of [[h.b, "Local competing."], [c, "Published competing."]] as const) {
      const prior = success(await side.store.read({ reference: original.reference }));
      success(await side.store.write({ action: "put", reference: prior.reference, expected: prior.version,
        content: content.replace("Common original.", word), provenance: save }));
    }
    success(await c.store.push()); success(await h.b.store.pull());
    const conflicted = success(await h.b.store.read({ reference: original.reference }));
    if (conflicted.conflicts.length !== 1) throw new Error("A genuine public cohort merge must produce one conflict");
    const conflict = success(await h.b.store.read({ reference: conflicted.conflicts[0]! }));
    success(await h.b.store.write({ action: "put", reference: original.reference, expected: conflicted.version, content, provenance: save }));
    const restored = success(await h.b.store.read({ reference: original.reference }));
    const live = expandStoredPath(original.reference), history = HistoryRefSchema.parse(live.ref.replace("refs/arc/", "refs/arc/history/"));
    return { original, restored, conflict, live, history, liveEntries: await capturedEntries(h.b, live.ref) };
  });
}
