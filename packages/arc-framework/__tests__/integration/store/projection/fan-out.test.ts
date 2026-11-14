/** Store operations refresh real linked checkouts through command-owned projection ports. */
import { configureEngineCheckout, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { locateProjection } from "../../../../src/lib/store/projection/location.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { commitProjectionIndex, readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { resolveWorktreeMarkerPath } from "../../../../src/lib/git/worktree-marker.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

it.each(["marker", "configuration"] as const)("contains corrupt entering %s, keeps the writer's own copy, and resumes after repair", async fault => {
  const { h, input, store, file } = await createFanOutFixture(directories);
  await endProjection(input);
  const marker = fault === "marker" ? resolveWorktreeMarkerPath(h.checkout) : join(h.checkout, ".arc/system/arc-config.yml");
  const original = await readFile(marker).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
  const own = await h.file(), sibling = await file();
  await mkdir(join(marker, ".."), { recursive: true });
  await writeFile(marker, fault === "marker" ? "{" : "layout.active: sideways\n");
  expect(await startProjection(input)).toMatchObject({ kind: "refused", mark: { reason: expect.stringContaining(fault) } });
  const current = await h.stored();
  success(await store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "Written while the marker needs repair.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await h.file()).toBe(own);
  // Either fault is the writer's own; its siblings still refresh.
  expect(await file()).not.toBe(sibling);
  expect(await file()).toContain("Written while the marker needs repair.");
  expect(projectionProcessState().diagnostics.filter(each => each.mark.reason.startsWith("Fan-out failed"))).toEqual([]);
  await endProjection(input);
  if (original === null) await rm(marker);
  else await writeFile(marker, original);
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  expect(await h.file()).toContain("Written while the marker needs repair.");
  const repaired = await h.stored();
  success(await store.write({ action: "put", reference: repaired.reference, expected: repaired.version,
    content: "Written after marker repair.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await file()).toContain("Written after marker repair.");
});


it("fans a landed verb write into both checkouts and marks only the writer's record changed", async () => {
  const { h, sibling, store, file, disk } = await createFanOutFixture(directories);
  const current = await h.stored();
  const result = await store.write({ action: "put", reference: current.reference, content: "The verb's new content.\n", expected: current.version,
    provenance: { verb: "save", lifecycleAction: "save" } });
  expect(result.status).toBe("ok");
  expect(await file()).toContain("The verb's new content.");
  expect(await h.file()).toContain("The verb's new content.");
  expect((await h.disk()).entries[h.path]).toMatchObject({ changed: true });
  expect((await disk()).entries[h.path]).toMatchObject({ changed: false });
  expect((await disk()).state).toBe(success(await store.version()));
  expect(projectionProcessState().roots.get(sibling.checkout)?.ready).toBe(true);
  expect(projectionProcessState().diagnostics).toEqual([]);
});

it("leaves a sibling whose state version is unset to its own next command's rebuild", async () => {
  const { h, sibling, store, file, disk } = await createFanOutFixture(directories);
  const before = await file();
  const unset = { ...await disk(), state: null };
  await withProjectionLock(sibling.location, async session => {
    await commitProjectionIndex({ location: sibling.location, checkout: sibling.checkout, index: unset, checkpoint: session.step });
  });
  const current = await h.stored();
  expect((await store.write({ action: "put", reference: current.reference, content: "A write the unset sibling waits for.\n",
    expected: current.version, provenance: { verb: "save", lifecycleAction: "save" } })).status).toBe("ok");
  expect(await h.file()).toContain("A write the unset sibling waits for.");
  expect(await file()).toBe(before);
  expect((await disk()).state).toBeNull();
  const siblingInput = { store: h.store, checkout: sibling.checkout, location: sibling.location,
    ports: () => createProjectionEnginePorts(sibling.checkout) };
  expect(await startProjection(siblingInput)).toMatchObject({ kind: "ready" });
  await endProjection(siblingInput);
  expect(await file()).toContain("A write the unset sibling waits for.");
  expect((await disk()).state).toBe(success(await h.store.version()));
});

it("records the writer's own verb mark when its refresh cannot read the store's changes", async () => {
  let refused = false;
  const refusal = StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable", historyRefs: [],
    condition: "The change window is unreadable.", remedy: { text: "Restore the store's history, then retry." } });
  const { h, store } = await createFanOutFixture(directories, { store: source => overrideEngineStore(source, {
    changes: input => refused ? Promise.resolve({ status: "refused", refusal }) : source.changes(input) }) });
  const current = await h.stored();
  refused = true;
  expect((await store.write({ action: "put", reference: current.reference, content: "A verb write the refresh cannot follow.\n",
    expected: current.version, provenance: { verb: "save", lifecycleAction: "save" } })).status).toBe("ok");
  expect((await h.disk()).entries[h.path]).toMatchObject({ changed: true });
});

it("skips a listed primary that holds no .git without reporting a failed fan-out", async () => {
  const listed = await mkdtemp(join(tmpdir(), "arc-listed-git-directory-")); directories.push(listed);
  const { h, store, file } = await createFanOutFixture(directories, { ports: ports => ({ ...ports,
    exec: async (command, args, options) => {
      const result = await ports.exec(command, args, options);
      return args[0] === "worktree" && args[1] === "list"
        ? { ...result, stdout: `${result.stdout}worktree ${listed}\0HEAD ${"0".repeat(40)}\0branch refs/heads/separate\0\0` } : result;
    } }) });
  const current = await h.stored();
  expect((await store.write({ action: "put", reference: current.reference, content: "Fanned past a Git directory listing.\n",
    expected: current.version, provenance: { verb: "save", lifecycleAction: "save" } })).status).toBe("ok");
  expect(await file()).toContain("Fanned past a Git directory listing.");
  expect(projectionProcessState().diagnostics).toEqual([]);
});

it("fans a command-start take-in out after the start lease is released", async () => {
  const { h, input, file } = await createFanOutFixture(directories);
  await endProjection(input);
  await h.edit("Saved before the next command.\n");
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  expect((await h.stored()).content).toBe("Saved before the next command.\n");
  expect(await file()).toContain("Saved before the next command.");
  expect(projectionProcessState().lockHeld).toBe(false);
  expect(projectionProcessState().diagnostics).toEqual([]);
});


it("keeps an end-check take-in local until the sibling's next command", async () => {
  const { h, sibling, input, file } = await createFanOutFixture(directories);
  await endProjection(input);
  await h.edit("First saved content.\n");
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  const entry = (await h.disk()).entries[h.path];
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("Missing first-check copy");
  await writeFile(join(h.checkout, entry.copies[0].name), renderStampedFile({
    content: "A later editor save.\n", stamp: h.entry.base.blob }));
  await endProjection(input);
  expect((await h.stored()).content).toBe("A later editor save.\n");
  expect(await file()).toContain("First saved content.");
  const next = { store: h.store, checkout: sibling.checkout, location: sibling.location,
    ports: () => createProjectionEnginePorts(sibling.checkout) };
  expect(await startProjection(next)).toMatchObject({ kind: "ready" });
  expect(await file()).toContain("A later editor save.");
});


it("shares the round's source reads and holder roster while preserving destination-specific edit rights", async () => {
  let observed: ReturnType<typeof createRefusingStore> | undefined;
  let rosters = 0;
  const { h, store, file, disk, siblingPath } = await createFanOutFixture(directories, { workItem: true,
    store: source => { observed = createRefusingStore(source); return observed.store; },
    ports: ports => ({ ...ports, exec: async (command, args, options) => {
      if (command === "git" && args[0] === "worktree" && args[1] === "list") rosters++;
      return ports.exec(command, args, options);
    } }) });
  if (observed === undefined) throw new Error("Source counter unavailable");
  const before = { read: observed.calls("read"), version: observed.calls("version"), changes: observed.calls("changes"),
    lookup: observed.calls("lookup"), rosters };
  const current = await h.stored();
  success(await store.write({ action: "put", reference: current.reference, content: "# Updated tasks\n", expected: current.version,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await file()).toContain("# Updated tasks");
  expect((await h.disk()).entries[h.path]).toMatchObject({ protected: false, changed: true });
  expect((await disk()).entries[siblingPath]).toMatchObject({ protected: true, changed: false });
  expect(observed.calls("version") - before.version).toBe(1);
  expect(observed.calls("changes") - before.changes).toBe(1);
  expect(observed.calls("read") - before.read).toBeLessThanOrEqual(2);
  expect(observed.calls("lookup") - before.lookup).toBe(1);
  expect(rosters - before.rosters).toBe(1);
});


it("fans out from an unclaimed writer whose own checkout has no projection", async () => {
  const { h, input, file } = await createFanOutFixture(directories);
  await endProjection(input);
  const checkout = join(h.checkout, "unclaimed");
  await h.exec("git", ["worktree", "add", "--detach", checkout], { cwd: h.checkout });
  await configureEngineCheckout(checkout);
  const ports = createProjectionEnginePorts(checkout), location = await locateProjection(checkout, ports);
  const store = withFanOut(h.store, createProjectionFanOutDependencies(checkout));
  expect(await startProjection({ store, checkout, location, ports: () => ports })).toEqual({ kind: "no-projection" });
  const current = await h.stored();
  success(await store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "Written from an unclaimed checkout.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await h.file()).toContain("Written from an unclaimed checkout.");
  expect(await file()).toContain("Written from an unclaimed checkout.");
  expect((await h.disk()).entries[h.path]).toMatchObject({ changed: false });
  expect(await readProjectionIndex(location, false)).toEqual({ kind: "no-projection" });
  await endProjection({ store, checkout, location, ports: () => ports });
  expect(projectionProcessState().diagnostics.filter(each => each.mark.reason.startsWith("Changed marks not recorded"))).toEqual([]);
});

it("keeps a linked inbox copy separate and propagates its saved capture back to primary", async () => {
  const content = "# User Inbox\n\n## Errand\n\n## Work Unit\n\n---\n";
  const path = ".arc/user/andrew/USER-INBOX.md";
  const { h, sibling, input, store, file } = await createFanOutFixture(directories, { kind: "personal/inbox", path, content });
  await endProjection(input);
  const own = await h.file(), entry = sibling.index.entries[path];
  if (entry?.kind !== "record") throw new Error("Expected the linked inbox's indexed base");
  const edited = content.replace("## Work Unit", "### **Linked capture**\n\nPreserve this saved capture.\n\n## Work Unit");
  await writeFile(join(sibling.checkout, path), renderStampedFile({ content: edited, stamp: entry.base.blob }));
  expect(await h.file()).toBe(own);
  expect(await file()).toContain("Linked capture");
  const linkedInput = { checkout: sibling.checkout, location: sibling.location, store,
    ports: () => createProjectionEnginePorts(sibling.checkout) };
  expect(await startProjection(linkedInput)).toMatchObject({ kind: "ready" });
  await endProjection(linkedInput);
  expect((await h.stored()).content).toContain("Linked capture");
  expect(await h.file()).toContain("Linked capture");
  expect(await h.file()).toContain("Preserve this saved capture.");
});

/** Ports whose writer-side visit finds its own lease held by another holder until the test releases it. */
function holdOwnLeaseAtVisit(location: () => import("../../../../src/lib/store/projection/location.js").ProjectionLocation,
  own: () => string, visits: number) {
  let release: () => void = () => undefined;
  const released = new Promise<void>(done => { release = done; });
  const holders: Promise<unknown>[] = [];
  let held = 0;
  return { release: async () => { release(); await Promise.all(holders); },
    ports: (ports: ReturnType<typeof createProjectionEnginePorts>) => ({ ...ports, beforeFanOutTarget: async (checkout: string) => {
      if (checkout !== own() || held >= visits) return;
      held += 1;
      await new Promise<void>(acquired => {
        holders.push(withProjectionLock(location(), async () => { acquired(); await released; }, { maxWaitMs: 0 }));
      });
    } }) };
}

it("marks a verb's write at the command's end when its own fan-out visit found the lease held", async () => {
  const holder = holdOwnLeaseAtVisit(() => fixture.h.location, () => fixture.h.checkout, 1);
  const fixture = await createFanOutFixture(directories, { ports: holder.ports });
  const { h, store, input, file } = fixture;
  const current = await h.stored();
  expect((await store.write({ action: "put", reference: current.reference, content: "A verb write its own visit could not mark.\n",
    expected: current.version, provenance: { verb: "save", lifecycleAction: "save" } })).status).toBe("ok");
  await holder.release();
  expect(await file()).toContain("A verb write its own visit could not mark.");
  expect((await h.disk()).entries[h.path]).toMatchObject({ changed: false });
  await endProjection(input);
  expect((await h.disk()).entries[h.path]).toMatchObject({ changed: true });
  expect(await h.file()).toContain("A verb write its own visit could not mark.");
});

it("reports a verb's changed marks as unrecorded when its own lease stays held through the command's end", async () => {
  const holder = holdOwnLeaseAtVisit(() => fixture.h.location, () => fixture.h.checkout, 1);
  const fixture = await createFanOutFixture(directories, { ports: holder.ports });
  const { h, store, input } = fixture;
  const current = await h.stored();
  expect((await store.write({ action: "put", reference: current.reference, content: "A verb write no visit can mark.\n",
    expected: current.version, provenance: { verb: "save", lifecycleAction: "save" } })).status).toBe("ok");
  await endProjection(input);
  await holder.release();
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ path: h.checkout,
    mark: expect.objectContaining({ reason: expect.stringContaining("Changed marks not recorded"),
      remedy: { text: expect.stringContaining("arc selection") } }) })]));
  expect((await h.disk()).entries[h.path]).toMatchObject({ changed: false });
});

it("fans out an edit the command's end takes in while it marks the writes its own visit could not", async () => {
  const holder = holdOwnLeaseAtVisit(() => fixture.h.location, () => fixture.h.checkout, 1);
  const fixture = await createFanOutFixture(directories, { ports: holder.ports });
  const { h, store, input, file } = fixture;
  const current = await h.stored();
  expect((await store.write({ action: "put", reference: current.reference, content: "opening\nbase\nclosing\nverb tail\n",
    expected: current.version, provenance: { verb: "save", lifecycleAction: "save" } })).status).toBe("ok");
  await holder.release();
  await h.edit("hand head\nopening\nbase\nclosing\n");
  await endProjection(input);
  expect((await h.stored()).content).toBe("hand head\nopening\nbase\nclosing\nverb tail\n");
  expect(await file()).toContain("hand head");
  expect((await h.disk()).entries[h.path]).toMatchObject({ changed: true });
});
