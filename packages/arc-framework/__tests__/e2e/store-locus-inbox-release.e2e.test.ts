/** Built-CLI release preserves work and retires only the authorized checkout generation. */
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { writeMetaPause } from "../../src/lib/store/kinds/meta/section-writer.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { identity, interruptGit, invoke, refSnapshot, repository } from "../helpers/store-locus-inbox-fixture.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { seededWorkUnitSubject, seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { cleanupTempDir, git } from "./helpers.js";

const SEQUENCE_TIMEOUT_MS = 120_000;
const slug = "field-survey";
const pause = { pausedBy: identity, since: "2026-01-01T00:00:00.000Z", reason: "Awaiting a survey",
  waitsOn: null, resumeNotes: null, open: false };
const roster = (root: string) => git(root, ["worktree", "list", "--porcelain"]);

async function linkedCheckout(root: string, suffix: string): Promise<string> {
  const path = `${root}-${suffix}`;
  onTestFinished(() => cleanupTempDir(path));
  await git(root, ["worktree", "add", "--detach", path, "main"]);
  return path;
}

async function bind(root: string, target: string, spawnedByArc: boolean, live = false) {
  const content = makeMetaFixture(slug, { owner: identity, state: "Planning", currentWorkflow: "draft-design" });
  const { meta } = await seedWorkUnit(root, slug, { identity, content: live ? content : writeMetaPause(content, pause) });
  const marker = { spawnedByArc, createdFor: seededWorkUnitSubject(meta), spawningIdentity: identity, createdAt: pause.since };
  await writeFile(join(root, ".git", "info", "exclude"), "\n/.arc/system/.internal/worktree-marker.json\n", { flag: "a" });
  await writeWorktreeMarker(target, marker);
  if (spawnedByArc) await invoke(target, ["save", "--json"]);
  return { marker, record: () => readStoreRecord(root, identity, meta.reference) };
}

async function release(root: string, name: string[], exitCode = 0, env?: NodeJS.ProcessEnv): Promise<unknown> {
  const result = await invoke(root, ["locus", "release", ...name, "--json"], exitCode, { env });
  return JSON.parse(result.stdout);
}

it("refuses a live anchored marker until pause, then preserves the dirty checkout and paused generation", async () => {
  const root = await repository();
  const { marker, record } = await bind(root, root, false, true);
  const markerPath = resolveWorktreeMarkerPath(root);
  const dirty = join(root, "survey.txt");
  const bytes = Buffer.from("Keep the field notes\r\n");
  await writeFile(dirty, bytes);
  const live = await record();
  expect(live.reference.owner).toMatchObject({ uid: marker.createdFor.uid });
  expect(live.fields).toMatchObject({ pause: null });
  const markerBytes = await readFile(markerPath);
  const before = await refSnapshot(root);
  const registrations = await roster(root);
  const head = await git(root, ["rev-parse", "HEAD"]);

  expect(await release(root, [], 1)).toMatchObject({
    status: "refused", reason: expect.stringContaining(`arc pause ${slug} --reason <text>`),
  });
  expect(await readFile(markerPath)).toEqual(markerBytes);
  expect(await readFile(dirty)).toEqual(bytes);
  expect(await record()).toEqual(live);
  expect(await refSnapshot(root)).toEqual(before);
  expect(await roster(root)).toBe(registrations);

  const paused = await invoke(root, ["pause", slug, "--reason", pause.reason]);
  expect(paused.stdout + paused.stderr).toContain(`Paused ${slug}`);
  const saved = await record();
  expect(saved.fields).toMatchObject({ pause: { pausedBy: identity, reason: pause.reason } });
  expect(saved.reference).toEqual(live.reference);
  const pausedRefs = await refSnapshot(root);
  expect(await release(root, [])).toMatchObject({ status: "released", checkoutPath: root, spawned: false });
  await expect(access(markerPath)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(dirty)).toEqual(bytes);
  expect(await record()).toEqual(saved);
  expect(await refSnapshot(root)).toEqual(pausedRefs);
  expect(await roster(root)).toBe(registrations);
  expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
}, SEQUENCE_TIMEOUT_MS);

it("refuses a dirty spawned checkout and removes only its registration after the edit is saved elsewhere", async () => {
  const root = await repository();
  const other = await linkedCheckout(root, "other");
  const retainedBytes = Buffer.from("An unrelated checkout edit\n");
  await writeFile(join(other, "unrelated.txt"), retainedBytes);
  const retained = await roster(root);
  const target = await linkedCheckout(root, "held");
  const { record } = await bind(root, target, true);
  const marker = await readFile(resolveWorktreeMarkerPath(target));
  const dirty = join(target, "dirty.txt");
  const bytes = Buffer.from("Save these notes before release\r\n");
  await writeFile(dirty, bytes);
  const saved = await record();
  const before = await refSnapshot(root);
  const registrations = await roster(root);

  expect(await release(root, [slug], 1)).toMatchObject({
    status: "refused", reason: expect.stringMatching(/dirty worktree.*dirty\.txt/u),
  });
  expect(await readFile(dirty)).toEqual(bytes);
  expect(await readFile(resolveWorktreeMarkerPath(target))).toEqual(marker);
  expect(await record()).toEqual(saved);
  expect(await refSnapshot(root)).toEqual(before);
  expect(await roster(root)).toBe(registrations);

  const savedEdit = join(other, "saved-notes.txt");
  await writeFile(savedEdit, await readFile(dirty));
  await rm(dirty);
  expect(await release(root, [slug])).toMatchObject({ status: "released", checkoutPath: target, spawned: true });
  await expect(access(target)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await roster(root)).toBe(retained);
  expect(await readFile(savedEdit)).toEqual(bytes);
  expect(await readFile(join(other, "unrelated.txt"))).toEqual(retainedBytes);
  expect(await refSnapshot(root)).toEqual(before);
  expect(await record()).toEqual(saved);
}, SEQUENCE_TIMEOUT_MS);

it("retains an unpreserved detached commit until a branch holds it, then removes the spawned checkout", async () => {
  const root = await repository();
  const retained = await roster(root);
  const target = await linkedCheckout(root, "detached");
  const { record } = await bind(root, target, true);
  const marker = await readFile(resolveWorktreeMarkerPath(target));
  await writeFile(join(target, "survey.txt"), "Detached field work\n");
  await git(target, ["add", "survey.txt"]);
  await git(target, ["commit", "-m", "Record detached survey"]);
  const detached = await git(target, ["rev-parse", "HEAD"]);
  const saved = await record();
  const before = await refSnapshot(root);
  const registrations = await roster(root);

  expect(await release(root, [slug], 1)).toMatchObject({
    status: "refused", reason: expect.stringContaining(`Detached HEAD holds commits not on base: ${detached}; preserve them with git switch -c <name>`),
  });
  expect(await readFile(resolveWorktreeMarkerPath(target))).toEqual(marker);
  expect(await readFile(join(target, "survey.txt"), "utf8")).toBe("Detached field work\n");
  expect(await git(target, ["rev-parse", "HEAD"])).toBe(detached);
  expect(await record()).toEqual(saved);
  expect(await refSnapshot(root)).toEqual(before);
  expect(await roster(root)).toBe(registrations);

  await git(target, ["switch", "-c", "preserved-survey"]);
  const preserved = await refSnapshot(root);
  expect(await release(root, [slug])).toMatchObject({ status: "released", checkoutPath: target, spawned: true });
  await expect(access(target)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await roster(root)).toBe(retained);
  expect(await git(root, ["rev-parse", "refs/heads/preserved-survey"])).toBe(detached);
  expect(await git(root, ["show", "preserved-survey:survey.txt"])).toBe("Detached field work");
  expect(await refSnapshot(root)).toEqual(preserved);
  expect(await record()).toEqual(saved);
}, SEQUENCE_TIMEOUT_MS);

it.skipIf(process.platform === "win32")("refuses a replaced marker generation and releases it only after fresh inspection", async () => {
  const root = await repository();
  const retained = await roster(root);
  const target = await linkedCheckout(root, "rebound");
  const { marker, record } = await bind(root, target, true);
  const markerPath = resolveWorktreeMarkerPath(target);
  const old = await readFile(markerPath);
  const replacement = { ...marker, createdAt: "2026-01-02T00:00:00.000Z" };
  await writeWorktreeMarker(target, replacement);
  const fresh = await readFile(markerPath);
  expect(fresh).not.toEqual(old);
  const pending = join(root, ".git", "replacement-marker.json");
  await writeFile(pending, fresh);
  await writeFile(markerPath, old);
  const saved = await record();
  const before = await refSnapshot(root);
  const registrations = await roster(root);
  // The spawned checkout's status is checked after release has captured its marker generation.
  const env = await interruptGit(root, [
    'case "$*" in',
    '  *"status --porcelain")',
    '    if test -f "$ARC_TEST_PENDING" && test -f .arc/system/.internal/worktree-marker.json; then',
    '      mv "$ARC_TEST_PENDING" "$ARC_TEST_MARKER" || exit 1',
    "    fi ;;",
    "esac",
  ], { ARC_TEST_PENDING: pending, ARC_TEST_MARKER: markerPath });
  const refused = await release(root, [slug], 1, env);
  expect(refused).toMatchObject({ status: "refused", reason: expect.stringContaining("marker generation changed") });
  expect(await readFile(markerPath)).toEqual(fresh);
  expect(await record()).toEqual(saved);
  expect(await refSnapshot(root)).toEqual(before);
  expect(await roster(root)).toBe(registrations);

  const inspected = await invoke(target, ["locus", "--json"]);
  expect(JSON.parse(inspected.stdout)).toMatchObject({ mode: "locus", ok: true });
  expect(await readFile(markerPath)).toEqual(fresh);
  expect(await release(root, [slug])).toMatchObject({ status: "released", checkoutPath: target, spawned: true });
  await expect(access(target)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await roster(root)).toBe(retained);
  expect(await refSnapshot(root)).toEqual(before);
  expect(await record()).toEqual(saved);
}, SEQUENCE_TIMEOUT_MS);
