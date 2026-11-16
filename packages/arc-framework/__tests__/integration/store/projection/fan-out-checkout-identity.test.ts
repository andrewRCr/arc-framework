/** A checkout keeps one identity however a command, Git's worktree list, or a caller spells it. */
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { notifyCheckoutChange } from "../../../../src/lib/git/checkout-change.js";
import { readProjectedSelection } from "../../../../src/lib/checks/projected-selection.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { createProjectionEnginePorts, type ProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { createProjectionRemovalSlots } from "../../../../src/lib/store/projection/removal-slots.js";
import { bindSpawnMaterialization, materializeSpawnedProjection } from "../../../../src/lib/store/projection/spawn-materialization.js";
import { restoreSyncProjection } from "../../../../src/lib/store/projection/sync-materialization.js";
import { projectionSelectionResult } from "../../../../src/lib/store/projection/selection.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

/** Another spelling of an existing checkout: through a linked ancestor on POSIX, Git's forward slashes on Windows. */
async function aliasOf(checkout: string): Promise<string> {
  if (process.platform === "win32") return checkout.replaceAll("\\", "/");
  const parent = await mkdtemp(join(tmpdir(), "arc-checkout-alias-")); directories.push(parent);
  const link = join(parent, "link");
  await symlink(dirname(checkout), link, "dir");
  return join(link, basename(checkout));
}

/** Record the Git calls made through a command's projection ports while recording. */
function gitRecorder() {
  const calls: { readonly args: readonly string[]; readonly cwd: string | undefined }[] = [];
  let recording = false;
  const ports = (inner: ProjectionEnginePorts): ProjectionEnginePorts => ({ ...inner,
    exec: ((command, args, options) => {
      if (recording) calls.push({ args, cwd: options?.cwd });
      return inner.exec(command, args, options);
    }) as typeof inner.exec,
    execInput: ((args, input, options) => {
      if (recording) calls.push({ args, cwd: options?.cwd });
      return inner.execInput(args, input, options);
    }) as typeof inner.execInput });
  return { calls, ports, record: (on: boolean) => { recording = on; } };
}

it("reuses a sibling's ignore proof when the sibling's own command spelled the checkout another way", async () => {
  const git = gitRecorder();
  const { h, sibling, store, input, file, disk } = await createFanOutFixture(directories, { ports: git.ports });
  await endProjection(input);
  const alias = await aliasOf(sibling.checkout);
  const own = { store: h.store, checkout: alias, ports: () => createProjectionEnginePorts(alias) };
  expect(await startProjection(own)).toMatchObject({ kind: "ready" });
  expect([...projectionProcessState().roots.keys()]).toEqual([sibling.checkout]);
  await endProjection(own);
  const proved = (await disk()).ignoreGuard;
  // The writer's fan-out reaches the sibling by Git's spelling and finds the proof its own command recorded.
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  const current = await h.stored();
  git.record(true);
  expect((await store.write({ action: "put", reference: current.reference, content: "Delivered by Git's spelling.\n",
    expected: current.version, provenance: { verb: "save", lifecycleAction: "save" } })).status).toBe("ok");
  git.record(false);
  expect(await file()).toContain("Delivered by Git's spelling.");
  expect(git.calls.filter(call => call.args.includes("check-ignore"))).toEqual([]);
  expect((await disk()).ignoreGuard).toEqual(proved);
  expect(projectionProcessState().diagnostics).toEqual([]);
  await endProjection(input);
}, 60_000);

it("fans out a write from a store whose root names the command's checkout another way", async () => {
  const { h, sibling, input, file } = await createFanOutFixture(directories);
  const store = withFanOut(h.store, createProjectionFanOutDependencies(await aliasOf(h.checkout)));
  const current = await h.stored();
  expect((await store.write({ action: "put", reference: current.reference, content: "Delivered from another spelling.\n",
    expected: current.version, provenance: { verb: "save", lifecycleAction: "save" } })).status).toBe("ok");
  expect(await file()).toContain("Delivered from another spelling.");
  await endProjection(input);
  expect([...projectionProcessState().roots.keys()].sort()).toEqual([h.checkout, sibling.checkout].sort());
  expect(projectionProcessState().diagnostics).toEqual([]);
}, 60_000);

it.each(["persist", "release"] as const)("skips a sibling in later fan-out once its %s slot retired it under another spelling", async slot => {
  const { h, sibling, store, input, file } = await createFanOutFixture(directories);
  const slots = createProjectionRemovalSlots({ store: h.store, identity: "andrew" });
  const alias = await aliasOf(sibling.checkout);
  expect(await (slot === "persist" ? slots.persist(alias) : slots.release(alias, false)))
    .toMatchObject({ kind: slot === "persist" ? "persisted" : "released" });
  expect([...projectionProcessState().retiring]).toEqual([sibling.checkout]);
  const current = await h.stored();
  expect((await store.write({ action: "put", reference: current.reference, content: "Written after the sibling retired.\n",
    expected: current.version, provenance: { verb: "save", lifecycleAction: "save" } })).status).toBe("ok");
  expect(await file().catch(() => "")).not.toContain("Written after the sibling retired.");
  await endProjection(input);
}, 60_000);

it("carries a spawned checkout's root across spellings and reads its command's configuration once", async () => {
  const git = gitRecorder();
  const { h, sibling, input } = await createFanOutFixture(directories, { ports: git.ports });
  await endProjection(input);
  // The command itself names its checkout another way.
  const command = { ...input, checkout: await aliasOf(h.checkout) };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  bindSpawnMaterialization(command);
  git.record(true);
  await materializeSpawnedProjection(sibling.checkout);
  await materializeSpawnedProjection(await aliasOf(sibling.checkout));
  git.record(false);
  expect([...projectionProcessState().roots.keys()].sort()).toEqual([h.checkout, sibling.checkout].sort());
  expect(git.calls.filter(call => call.args.includes("config") && (call.cwd === h.checkout || call.cwd === command.checkout))).toEqual([]);
  expect(projectionProcessState().diagnostics).toEqual([]);
  await endProjection(command);
}, 60_000);

it("restores through the command's root when sync names the checkout another way", async () => {
  const { h, input } = await createFanOutFixture(directories);
  const projected = join(h.checkout, h.path);
  const laid = await readFile(projected, "utf8");
  await rm(projected);
  await restoreSyncProjection(h.store, await aliasOf(h.checkout), {});
  expect(await readFile(projected, "utf8")).toBe(laid);
  expect(projectionProcessState().diagnostics).toEqual([]);
  await endProjection(input);
}, 60_000);

it("answers the command's own selection for a caller that names the checkout another way", async () => {
  const { h, input } = await createFanOutFixture(directories, { kind: "work-item/notes", path: ".arc/active/current/notes-work-item-one.md" });
  const alias = await aliasOf(h.checkout);
  const own = await projectionSelectionResult(input.store, h.checkout);
  if (own.status !== "ok") throw new Error("The command's own selection refused");
  expect(own.result.paths).not.toEqual([]);
  expect(await projectionSelectionResult(input.store, alias)).toEqual(own);
  // A checkout other than the command's own would run a separate selection process.
  expect(await readProjectedSelection(alias, { changed: false }, { createStore: () => input.store, run: () => {
    throw new Error("The command's own selection ran a subprocess.");
  } })).toEqual({ status: "ok", paths: own.result.paths });
  await endProjection(input);
}, 60_000);

it("releases a moved checkout's root when the move names its old path through a link", async () => {
  const { h, sibling, input } = await createFanOutFixture(directories);
  await endProjection(input);
  const own = { store: h.store, checkout: sibling.checkout, ports: () => createProjectionEnginePorts(sibling.checkout) };
  expect(await startProjection(own)).toMatchObject({ kind: "ready" });
  const from = await aliasOf(sibling.checkout), to = join(dirname(sibling.checkout), "moved");
  await h.exec("git", ["worktree", "move", sibling.checkout, to], { cwd: h.checkout });
  notifyCheckoutChange({ kind: "move", from, to });
  expect(projectionProcessState().roots.has(sibling.checkout)).toBe(false);
  expect(projectionProcessState().diagnostics).toEqual([expect.objectContaining({ path: from,
    mark: expect.objectContaining({ reason: expect.stringContaining("moved") }) })]);
  await endProjection(own);
}, 60_000);
