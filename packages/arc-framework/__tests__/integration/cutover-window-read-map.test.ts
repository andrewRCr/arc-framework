/** Native tracked record discovery supplies the same logical coordinates as the import. */
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { createWindowImportContext } from "../../src/scripts/cutover-window/import-context.js";
import { createWindowReadMap } from "../../src/scripts/cutover-window/read-map.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inRepoContent } from "../helpers/store/in-repo-fixture.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { seedImportLineage } from "../helpers/store/import-lineage.js";
import { parkedWindowFixture } from "../helpers/cutover-window/parked.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";

async function inspectMap(h: Awaited<ReturnType<typeof windowFixture>>, revision: string, paths: readonly string[], bases: readonly string[] = []) {
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runWindow(["check", "--repo", h.root, "--json"], { check: async ({ repo }) => {
    const context = await createWindowImportContext(repo);
    const main = (await h.git("git", ["rev-parse", "refs/heads/main"])).stdout.trim();
    const map = await createWindowReadMap(context, main);
    return { operation: "check", status: "reported", findings: map.findings,
      data: await Promise.all(paths.map(path => map.at(path, revision, bases))) };
  } }, { stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); } });
  return { exit, result: JSON.parse(stdout.join("")) as unknown, report: stderr.join("") };
}

it("maps a live unit's meta, conventional documents, and discovered companion to its operational read copy", async () => {
  const h = await windowFixture(), tip = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  const paths = ["meta", "draft", "spec", "tasks", "notes", "extra"].map(role => `.arc/active/${role}-alpha.md`);
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const mapped = await inspectMap(h, tip, paths);
  expect(mapped, mapped.report).toMatchObject({ exit: 0, result: { findings: [], data: [
    ...["work-item/meta", "work-item/draft", "work-item/spec", "work-item/task-list", "work-item/notes", "work-item/companion"].map(kind =>
      expect.objectContaining({ reference: { kind, owner: { type: "work-item", name: "alpha" },
        ...(kind === "work-item/companion" ? { key: "extra" } : {}) }, workUnit: "alpha", readRevision: tip, readCopyRef: "origin/feat/alpha" })),
  ] } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
}, 60_000);

it("reads a parked unit's active metadata from the preserved graduated branch", async () => {
  const h = await parkedWindowFixture();
  const mapped = await inspectMap(h, h.tip, [h.active]);
  expect(mapped, mapped.report).toMatchObject({ exit: 0, result: { findings: [], data: [expect.objectContaining({
    reference: { kind: "work-item/meta", owner: { type: "work-item", name: h.slug } },
    readRevision: h.tip, readCopyRef: expect.stringContaining(h.branch),
  })] } });
}, 60_000);

it("keeps a parked unit's pointer at main while retaining the branch it names", async () => {
  const h = await parkedWindowFixture();
  const mapped = await inspectMap(h, h.main, [h.pointer]);
  expect(mapped, mapped.report).toMatchObject({ exit: 0, result: { findings: [], data: [expect.objectContaining({
    reference: { kind: "work-item/meta", owner: { type: "work-item", name: h.slug } },
    readRevision: h.main, readCopyRef: "refs/heads/main", pointerBranch: h.branch,
  })] } });
}, 60_000);

it("leaves a missing parked branch without a read revision and resolves it after its branch is restored", async () => {
  const h = await parkedWindowFixture();
  await h.git("git", ["branch", "-D", h.branch]);
  await h.git("git", ["update-ref", "-d", `refs/remotes/origin/${h.branch}`]);
  const missing = await inspectMap(h, h.tip, [h.active]);
  expect(missing, missing.report).toMatchObject({ exit: 0, result: {
    findings: [expect.objectContaining({ condition: expect.stringContaining(h.branch) })],
    data: [expect.objectContaining({ workUnit: h.slug, readRevision: null, readCopyRef: null })],
  } });
  await h.git("git", ["branch", h.branch, h.tip]);
  const repaired = await inspectMap(h, h.tip, [h.active]);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { findings: [],
    data: [expect.objectContaining({ workUnit: h.slug, readRevision: h.tip })],
  } });
}, 60_000);

it("maps Candidate and integration-boundary files to their live unit's read copy", async () => {
  const h = await windowFixture();
  const boundary = RecordReferenceSchema.parse({ kind: "review/integration-boundary", owner: { type: "work-item", name: "alpha" } });
  await h.git("git", ["checkout", "feat/alpha"]);
  await writeFile(join(h.root, ".arc/system/.internal/candidates/alpha.boundary.json"), inRepoContent(boundary));
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Retain live boundary evidence"]);
  await h.git("git", ["push", "origin", "feat/alpha"]);
  const tip = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["checkout", "main"]);
  const mapped = await inspectMap(h, tip, [".arc/system/.internal/candidates/alpha.json", ".arc/system/.internal/candidates/alpha.boundary.json"]);
  expect(mapped, mapped.report).toMatchObject({ exit: 0, result: { data: [
    ...["review/candidate", "review/integration-boundary"].map(kind => expect.objectContaining({
      reference: { kind, owner: { type: "work-item", name: "alpha" } }, workUnit: "alpha", readRevision: tip,
    })),
  ] } });
}, 60_000);

it("maps a terminal transition to its lineage record at main's head", async () => {
  const h = await windowFixture();
  await seedImportLineage(h.root, h.git);
  const main = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const mapped = await inspectMap(h, main, [".arc/system/.internal/transitions/abandoned.json"]);
  expect(mapped, mapped.report).toMatchObject({ exit: 0, result: { data: [expect.objectContaining({
    reference: { kind: "lineage/transition", owner: { type: "work-item", name: "abandoned" } },
    workUnit: "abandoned", readRevision: main, readCopyRef: "refs/heads/main",
  })] } });
}, 60_000);

it("never selects the stale branch being inspected as a unit's read copy", async () => {
  const h = await windowFixture(), read = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  await h.git("git", ["checkout", "-b", "feat/stale", "feat/alpha"]);
  await writeFile(join(h.root, ".arc/active/notes-alpha.md"), "# Notes: Alpha\n\nChanges in a stale copy.\n");
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Change stale branch records"]);
  const stale = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["checkout", "main"]);
  const mapped = await inspectMap(h, stale, [".arc/active/notes-alpha.md"]);
  expect(mapped, mapped.report).toMatchObject({ exit: 0, result: { data: [expect.objectContaining({
    workUnit: "alpha", readRevision: read, readCopyRef: "origin/feat/alpha",
  })] } });
}, 60_000);

it("assigns a tracked file with no discovered record to main's head", async () => {
  const h = await windowFixture(), path = ".arc/active/unclaimed.md";
  const main = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["checkout", "feat/alpha"]);
  await writeFile(join(h.root, path), "# Unclaimed source\n");
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Retain an unclaimed tracked file"]);
  const tip = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["checkout", "main"]);
  const mapped = await inspectMap(h, tip, [path]);
  expect(mapped, mapped.report).toMatchObject({ exit: 0, result: { data: [{
    path, reference: null, workUnit: null, readRevision: main, readCopyRef: "refs/heads/main",
  }] } });
}, 60_000);

it("maps a deleted companion through a comparison base's discovered record", async () => {
  const h = await windowFixture(), path = ".arc/active/extra-alpha.md";
  const base = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  await h.git("git", ["checkout", "feat/alpha"]);
  await h.git("git", ["rm", path]); await h.git("git", ["commit", "-m", "Remove a branch companion"]);
  const tip = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["checkout", "main"]);
  const mapped = await inspectMap(h, tip, [path], [base]);
  expect(mapped, mapped.report).toMatchObject({ exit: 0, result: { data: [expect.objectContaining({
    reference: { kind: "work-item/companion", owner: { type: "work-item", name: "alpha" }, key: "extra" },
    workUnit: "alpha", readRevision: tip,
  })] } });
}, 60_000);

it("names the parked pointer's actual ref when its preserved metadata declares a different branch", async () => {
  const h = await parkedWindowFixture();
  await h.git("git", ["checkout", h.branch]);
  await writeFile(join(h.root, h.active), makeMetaFixture(h.slug, { owner: "andrew", branch: "feat/elsewhere" }));
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Retain differing branch metadata"]);
  const tip = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["push", "origin", h.branch]); await h.git("git", ["checkout", "main"]);
  const mapped = await inspectMap(h, tip, [h.active]);
  expect(mapped, mapped.report).toMatchObject({ exit: 0, result: { findings: [], data: [expect.objectContaining({
    workUnit: h.slug, readRevision: tip, readCopyRef: `refs/heads/${h.branch}`,
  })] } });
}, 60_000);

it("maps the cohort and project inbox to their records read at main's head", async () => {
  const h = await windowFixture(), main = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const cohort = resolveArcPath({ kind: "cohort-document", cohort: [SlugSchema.parse("group")], placement: { kind: "planned" } });
  const inbox = resolveArcPath({ kind: "inbox", scope: { kind: "project" } });
  const mapped = await inspectMap(h, main, [cohort, inbox]);
  expect(mapped, mapped.report).toMatchObject({ exit: 0, result: { data: [
    expect.objectContaining({ reference: { kind: "cohort/document", owner: { type: "cohort", name: "group" } }, workUnit: null, readRevision: main }),
    expect.objectContaining({ reference: { kind: "project-inbox/inbox", owner: { type: "project", name: "project" } }, workUnit: null, readRevision: main }),
  ] } });
}, 60_000);

it("maps a live record on main when its owner's metadata is held only on the read branch", async () => {
  const h = await windowFixture(), main = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const tip = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  const mapped = await inspectMap(h, main, [".arc/active/notes-alpha.md"]);
  expect(mapped, mapped.report).toMatchObject({ exit: 0, result: { data: [expect.objectContaining({
    reference: { kind: "work-item/notes", owner: { type: "work-item", name: "alpha" } },
    workUnit: "alpha", readRevision: tip,
  })] } });
}, 60_000);
