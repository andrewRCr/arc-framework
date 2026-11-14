/** A verb's fan-out records its changed marks in the writer's checkout, or reports the marks it could not record. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { commitProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { projectionSelectionResult } from "../../../../src/lib/store/projection/selection.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { resolveWorktreeMarkerPath } from "../../../../src/lib/git/worktree-marker.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

const refusal = StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable", historyRefs: [],
  condition: "The store cannot be read here.", remedy: { text: "Restore the store's history, then retry." } });
const provenance = { verb: "save", lifecycleAction: "save" } as const;

function unrecorded(): unknown[] {
  return projectionProcessState().diagnostics.filter(each => each.mark.reason.startsWith("Changed marks not recorded"));
}

async function faultMarker(fixture: Awaited<ReturnType<typeof createFanOutFixture>>): Promise<void> {
  await endProjection(fixture.input);
  const marker = resolveWorktreeMarkerPath(fixture.h.checkout);
  await mkdir(join(marker, ".."), { recursive: true });
  await writeFile(marker, "{");
  expect(await startProjection(fixture.input)).toMatchObject({ kind: "refused" });
}

it("records a verb's mark under its own lease while the writer's marker needs repair", async () => {
  const fixture = await createFanOutFixture(directories), { h, store, input } = fixture;
  await faultMarker(fixture);
  const current = await h.stored();
  success(await store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "Written while the marker needs repair.\n", provenance }));
  expect((await h.disk()).entries[h.path]).toMatchObject({ changed: true });
  await endProjection(input);
  expect(unrecorded()).toEqual([]);
});

it("reports a new record's mark as unrecorded while the writer's marker needs repair", async () => {
  const fixture = await createFanOutFixture(directories), { h, store, input } = fixture;
  await faultMarker(fixture);
  const current = await h.stored();
  success(await store.write({ action: "put", reference: { ...current.reference, key: "scratch/faulted.md" }, expected: null,
    content: "Created while the marker needs repair.\n", provenance }));
  await endProjection(input);
  expect(unrecorded()).toEqual([expect.objectContaining({ path: h.checkout })]);
});

it("reports no unrecorded mark for a write no view lays in the faulted writer's checkout", async () => {
  const fixture = await createFanOutFixture(directories), { h, store, input } = fixture;
  await faultMarker(fixture);
  const current = await h.stored();
  success(await store.write({ action: "put", reference: { ...current.reference, key: "scratch/other.md",
    owner: { ...current.reference.owner, name: SlugSchema.parse("bob") } }, expected: null,
  content: "Another identity's own file.\n", provenance }));
  await endProjection(input);
  expect(unrecorded()).toEqual([]);
});

it("reports a new record's mark as unrecorded when the writer's refresh cannot lay it", async () => {
  const { h, store, input } = await createFanOutFixture(directories, { store: source => overrideEngineStore(source, {
    read: request => request.reference.key === "scratch/unlaid.md"
      ? Promise.resolve({ status: "refused", refusal }) : source.read(request) }) });
  const current = await h.stored();
  success(await store.write({ action: "put", reference: { ...current.reference, key: "scratch/unlaid.md" }, expected: null,
    content: "A record no refresh can read.\n", provenance }));
  await endProjection(input);
  expect(unrecorded()).toEqual([expect.objectContaining({ path: h.checkout })]);
});

it("marks a new record at the command's end when its round could not read the store's changes, so --changed lists it", async () => {
  let refused = false;
  const { h, store, input } = await createFanOutFixture(directories, { store: source => overrideEngineStore(source, {
    changes: request => refused ? Promise.resolve({ status: "refused", refusal }) : source.changes(request) }) });
  const reference = recordReferences["personal/working-memory"](h.record.reference.owner);
  refused = true;
  success(await store.write({ action: "put", reference, expected: null, content: "# Working Memory\n\n## Memories\n", provenance }));
  refused = false;
  await endProjection(input);
  expect(unrecorded()).toEqual([]);
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  expect(await projectionSelectionResult(store, h.checkout, { changed: true })).toEqual({ status: "ok", result: {
    paths: expect.arrayContaining([".arc/user/andrew/WORKING-MEMORY.md"]) } });
});

it("marks the live identity's own file while a pending reprojection keeps the old identity in the header", async () => {
  let refused = false;
  const { h, store } = await createFanOutFixture(directories, { kind: "personal/inbox", path: ".arc/user/andrew/USER-INBOX.md",
    content: "# User Inbox\n\n## Errand\n\n## Work Unit\n\n---\n",
    store: source => overrideEngineStore(source, {
      changes: request => refused ? Promise.resolve({ status: "refused", refusal }) : source.changes(request) }) });
  const disk = await h.disk();
  await withProjectionLock(h.location, async session => {
    await commitProjectionIndex({ location: h.location, checkout: h.checkout, checkpoint: session.step, index: { ...disk,
      reprojectionPending: true, projectedUnder: { ...disk.projectedUnder, identity: SlugSchema.parse("bob") } } });
  });
  const current = await h.stored();
  refused = true;
  success(await store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "# User Inbox\n\n## Errand\n\n## Work Unit\n\nA verb's capture.\n\n---\n", provenance }));
  expect((await h.disk()).entries[h.path]).toMatchObject({ changed: true });
});
