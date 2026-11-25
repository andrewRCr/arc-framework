/** A folder in the recovery folder that is named like a staged file never hides the edited copies below it. */
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { ASIDE_FILES_ROOT, nameAsideFile, parseAsideFile, type AsideRole } from "../../../../src/lib/store/projection/aside.js";
import { endProjection, startProjection } from "../../../../src/lib/store/projection/engine.js";
import { commitProjectionIndex, PROJECTION_INDEX_FILE, readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";
import { persistProjectionRemoval } from "../../../../src/lib/store/projection/removal-persist.js";
import { releaseProjectionRemoval } from "../../../../src/lib/store/projection/removal-release.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { configureEngineCheckout, createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { seed } from "../../../helpers/store/suite-tools.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

/** Where the folder stands: in a mirrored file's own folder, or as one of the folders above a mirrored file. */
const shapes = ["beside copies", "above a file"] as const;

async function targetCheckout() {
  beginProjectionCommand();
  const h = await createEngineFixture(directories, { registryOverrides: { "work-item/meta": { parser: META_REGISTRATION.parser } } });
  await h.exec("git", ["commit", "--allow-empty", "-m", "initial"], { cwd: h.checkout });
  const parent = await mkdtemp(join(tmpdir(), "arc-staged-folder-")); directories.push(parent);
  const checkout = join(parent, "target");
  await h.exec("git", ["worktree", "add", "-b", "target", checkout], { cwd: h.checkout });
  const projected = await seedProjection({ store: h.store, checkout, files: [{ path: h.path, reference: h.record.reference }] });
  await configureEngineCheckout(checkout);
  const primary = await seed(h, h.reference("work-item/meta", "target"), makeMetaFixture("work-item-target", {
    owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop",
  }));
  await writeWorktreeMarker(checkout, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-11-11T00:00:00Z",
    createdFor: boundWorkUnitSubject(primary) });
  const entry = projected.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing fixture entry");
  const command = { checkout, store: h.store, ports: h.ports, mode: "save" as const };
  const runCommand = async () => {
    const from = projectionProcessState().diagnostics.length;
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    const reported = projectionProcessState().diagnostics.slice(from);
    await endProjection(command);
    return reported;
  };
  await runCommand();
  return { h, checkout, location: projected.location, entry, runCommand,
    context: { store: h.store, identity: SlugSchema.parse("andrew"), ports: h.ports } };
}
type Target = Awaited<ReturnType<typeof targetCheckout>>;

/** Put a copy an exited writer left below a folder named like a staged file, stamped where its name records a Markdown path. */
async function placeCopy(target: Target, shape: (typeof shapes)[number], content: string): Promise<{ copy: string; folder: string }> {
  const { h, entry } = target;
  const writer = { ...await h.ports().writer(), processInstance: "abandoned-copy" };
  const generated = (path: string, role: AsideRole) => nameAsideFile({ path, base: entry.base.blob, role, writer });
  const name = (path: string, role: AsideRole) => generated(path, role).split("/").at(-1) ?? "";
  const staged = name(h.path, "staged");
  const scratch = ".arc/user/andrew/scratch";
  const folder = shape === "beside copies" ? `${dirname(generated(h.path, "aside"))}/${staged}`
    : `${ASIDE_FILES_ROOT}/${scratch.slice(".arc/".length)}/${staged}`;
  const copy = shape === "beside copies" ? `${folder}/kept/${name(h.path, "aside")}` : generated(`${scratch}/${staged}/notes.md`, "aside");
  expect(copy.startsWith(`${folder}/`)).toBe(true);
  const markdown = parseAsideFile(copy)?.path.endsWith(".md") ?? false;
  await mkdir(dirname(join(target.checkout, copy)), { recursive: true });
  await writeFile(join(target.checkout, copy), markdown ? renderStampedFile({ content, stamp: entry.base.blob }) : content);
  return { copy, folder };
}

async function indexOnDisk(target: Target) {
  const disk = await readProjectionIndex(target.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error(`Expected an index, found ${disk.kind}`);
  return disk.index;
}

it.each(shapes)("holds removal and release over an unrecorded edit below one, until the edit is moved out: %s", async shape => {
  const target = await targetCheckout();
  const { copy } = await placeCopy(target, shape, "An unrecorded late edit.\n");
  const bytes = await readFile(join(target.checkout, copy), "utf8");
  const remedy = { text: expect.stringContaining(copy) };
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse", remedy });
  expect(await persistProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "refused", remedy });
  expect(await releaseProjectionRemoval(target.checkout, false, target.context)).toMatchObject({ kind: "refused", remedy });
  expect(await readFile(join(target.checkout, copy), "utf8")).toBe(bytes);
  await rm(join(target.checkout, copy));
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
  expect(await persistProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "persisted" });
});

it.each(shapes)("keeps a withheld copy below one listed and held, even once its bytes match its base: %s", async shape => {
  const target = await targetCheckout();
  const { copy } = await placeCopy(target, shape, target.h.record.content);
  await commitProjectionIndex({ location: target.location, checkout: target.checkout,
    index: { ...await indexOnDisk(target), withheldCopies: [copy] } });
  await target.runCommand();
  expect((await indexOnDisk(target)).withheldCopies).toEqual([copy]);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining(copy) } });
  await rm(join(target.checkout, copy));
  await target.runCommand();
  expect((await indexOnDisk(target)).withheldCopies).toEqual([]);
  expect(await checkProjectionRemoval(target.checkout, target.context)).toEqual({ kind: "passes" });
});

it("withholds an edited copy below one when the index is rebuilt", async () => {
  const target = await targetCheckout();
  const { copy } = await placeCopy(target, "above a file", "An edit saved before the index was lost.\n");
  const live = join(target.checkout, ".arc", dirname(copy).slice(ASIDE_FILES_ROOT.length + 1));
  await mkdir(dirname(live), { recursive: true });
  await writeFile(live, "A newer file at its path.\n");
  await rm(join(target.location.stateDir, PROJECTION_INDEX_FILE));
  expect(await target.runCommand()).toEqual(expect.arrayContaining([expect.objectContaining({ copy })]));
  expect((await indexOnDisk(target)).withheldCopies).toEqual([copy]);
});

it.each(shapes)("reports an edited copy below one, deletes a spent one, and leaves the folder and its other files: %s", async shape => {
  const target = await targetCheckout();
  const edited = await placeCopy(target, shape, "An unrecorded late edit.\n");
  const spent = await placeCopy(target, shape, target.h.record.content);
  const foreign = join(target.checkout, spent.folder, "foreign.txt");
  await writeFile(foreign, "Foreign bytes.\n");
  const reported = await target.runCommand();
  expect(reported).toEqual(expect.arrayContaining([expect.objectContaining({ copy: edited.copy,
    mark: expect.objectContaining({ reason: "unrecorded" }) })]));
  expect(reported.map(each => each.copy)).not.toContain(spent.copy);
  await expect(access(join(target.checkout, spent.copy))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(join(target.checkout, spent.folder))).resolves.toBeUndefined();
  expect(await readFile(foreign, "utf8")).toBe("Foreign bytes.\n");
  expect(await readFile(join(target.checkout, edited.copy), "utf8")).toContain("An unrecorded late edit.");
});
