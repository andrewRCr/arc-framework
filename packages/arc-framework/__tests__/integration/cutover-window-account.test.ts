/** Accounting follows the import's source discovery and observes the landed store without writes. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { LineageRecordSchema, writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { mergeMainIntoFixtureFlip } from "../helpers/cutover-window/check.js";
import { expect, it } from "vitest";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { parkedWindowFixture } from "../helpers/cutover-window/parked.js";
import { importWindowFixture } from "../helpers/cutover-window/import.js";

async function account(h: Awaited<ReturnType<typeof windowFixture>>) {
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runWindow(["account", "--repo", h.root, "--json"], undefined, {
    stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); },
  });
  return { exit, result: stdout.length ? JSON.parse(stdout.join("")) as unknown : null, report: stderr.join("") };
}

it("accounts for a live record at its import read copy and leaves every ref unchanged", async () => {
  const h = await windowFixture();
  await importWindowFixture(h);
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const result = await account(h);
  expect(result, result.report).toMatchObject({ exit: 0, result: { status: "passed", findings: [], data: { files: expect.arrayContaining([
    expect.objectContaining({ path: ".arc/active/meta-alpha.md", classification: "imported", readCopyRef: expect.stringContaining("feat/alpha") }),
    expect.objectContaining({ path: ".arc/active/tasks-alpha.md", classification: "superseded", readCopyRef: expect.stringContaining("feat/alpha") }),
  ]) } } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
}, 60_000);

it("does not tally an optional record path absent from the read copy", async () => {
  const h = await windowFixture();
  const path = ".arc/active/notes-alpha.md";
  await h.git("git", ["checkout", "feat/alpha"]);
  await h.git("git", ["rm", path]);
  await h.git("git", ["commit", "-m", "Retire optional notes"]);
  await h.git("git", ["push", "origin", "feat/alpha"]);
  const revision = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["checkout", "main"]);
  await importWindowFixture(h);
  const result = await account(h);
  expect(result, result.report).toMatchObject({ exit: 0, result: { status: "passed", data: { files: expect.not.arrayContaining([
    expect.objectContaining({ path, revision }),
  ]) } } });
}, 60_000);

it("deliberately leaves only the rendered roadmap and installed archive guide, with reasons", async () => {
  const h = await windowFixture();
  const paths = [".arc/backlog/ROADMAP.md", ".arc/completed/README.md"];
  for (const path of paths) {
    await mkdir(dirname(join(h.root, path)), { recursive: true });
    await writeFile(join(h.root, path), "# Installed guide or rendered view\n");
  }
  await h.git("git", ["add", ...paths]); await h.git("git", ["commit", "-m", "Install the guide and roadmap"]);
  await h.git("git", ["push", "origin", "main"]); await mergeMainIntoFixtureFlip(h);
  await importWindowFixture(h);
  const result = await account(h);
  expect(result, result.report).toMatchObject({ exit: 0, result: { data: { files: expect.arrayContaining([
    expect.objectContaining({ path: paths[0], classification: "deliberately-left", reason: expect.stringContaining("rendered") }),
    expect.objectContaining({ path: paths[1], classification: "deliberately-left", reason: expect.stringContaining("guide") }),
  ]) } } });
}, 60_000);

it("reports an unclaimed tracked file that the import silently omits", async () => {
  const h = await windowFixture(), path = ".arc/backlog/unclaimed.md";
  await writeFile(join(h.root, path), "# State outside a record\n");
  await h.git("git", ["add", path]); await h.git("git", ["commit", "-m", "Add an unclaimed source"]);
  await h.git("git", ["push", "origin", "main"]); await mergeMainIntoFixtureFlip(h);
  await importWindowFixture(h);
  const result = await account(h);
  expect(result, result.report).toMatchObject({ exit: 1, result: { status: "findings", data: { files: expect.arrayContaining([
    expect.objectContaining({ path, classification: "reported", reason: expect.stringContaining("No record claims") }),
  ]) } } });
  await h.git("git", ["rm", path]); await h.git("git", ["commit", "-m", "Deliberately discard the unclaimed source"]);
  expect(await account(h)).toMatchObject({ exit: 0 });
}, 60_000);

it("reports a source failing the read rule and passes after that source is repaired", async () => {
  const h = await windowFixture(), path = ".arc/active/tasks-alpha.md";
  await importWindowFixture(h);
  const before = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await writeFile(join(h.root, path), "# Task List: Foreign edit\n");
  await h.git("git", ["add", path]); await h.git("git", ["commit", "-m", "Change a different read copy"]);
  const result = await account(h);
  expect(result, result.report).toMatchObject({ exit: 1, result: { data: { files: expect.arrayContaining([
    expect.objectContaining({ path, classification: "reported", reason: expect.stringContaining("read rule") }),
  ]) } } });
  await h.git("git", ["reset", "--hard", before]);
  expect(await account(h)).toMatchObject({ exit: 0 });
}, 60_000);

it("reports a discovered record with no landed counterpart and passes after the counterpart is restored", async () => {
  const h = await windowFixture(), path = ".arc/active/spec-alpha.md";
  await importWindowFixture(h);
  const store = createRefStore(h.ports), reference = RecordReferenceSchema.parse({ kind: "work-item/spec", owner: { type: "work-item", name: "alpha" } });
  const read = await store.read({ reference });
  if (read.status !== "ok") throw new Error(JSON.stringify(read));
  const provenance = { verb: "save", lifecycleAction: "edit" };
  expect(await store.write({ action: "remove", reference: read.result.reference, expected: read.result.version, provenance }))
    .toMatchObject({ status: "ok" });
  const result = await account(h);
  expect(result, result.report).toMatchObject({ exit: 1, result: { data: { files: expect.arrayContaining([
    expect.objectContaining({ path, classification: "reported", reason: expect.stringContaining("landed store") }),
  ]) } } });
  expect(await store.write({ action: "put", reference: read.result.reference, expected: null, content: read.result.content, provenance }))
    .toMatchObject({ status: "ok" });
  expect(await account(h)).toMatchObject({ exit: 0 });
}, 60_000);

it("accounts for closed cohort folders and renamed, abandoned, and decomposed origins", async () => {
  const h = await windowFixture({ completed: true, lineage: true });
  await importWindowFixture(h);
  const result = await account(h);
  expect(result, result.report).toMatchObject({ exit: 0, result: { data: { files: expect.arrayContaining([
    ...["cohort-closed-a.md", "cohort-closed-b.md", "old-archived.json", "abandoned.json", "cut-origin.json"].map(path =>
      expect.objectContaining({ path: expect.stringContaining(path), classification: "imported" })),
  ]) } } });
}, 60_000);

it("accounts for a parked pointer with the preserved branch meta", async () => {
  const h = await parkedWindowFixture();
  await h.git("git", ["push", "origin", "main"]); await mergeMainIntoFixtureFlip(h);
  await importWindowFixture(h);
  const result = await account(h);
  expect(result, result.report).toMatchObject({ exit: 0, result: { data: { files: expect.arrayContaining([
    expect.objectContaining({ path: h.pointer, classification: "imported" }),
    expect.objectContaining({ path: h.active, classification: "imported" }),
  ]) } } });
}, 60_000);

it("accounts for rename chains ending in a primary or terminal origin without writing refs", async () => {
  const h = await windowFixture({ completed: true, lineage: true });
  for (const [origin, successor] of [["old-first", "middle"], ["middle", "abandoned"], ["old-live-first", "old-archived"]]) {
    const fields = LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: origin }, kind: "rename", successors: [{ name: successor }], incoming: [] });
    const path = resolveArcPath({ kind: "transition-record", origin: SlugSchema.parse(origin) });
    await mkdir(dirname(join(h.root, path)), { recursive: true });
    await writeFile(join(h.root, path), writeLineageRecord(fields));
    await h.git("git", ["add", path]);
  }
  await h.git("git", ["commit", "-m", "Add primary and terminal rename chains"]);
  await h.git("git", ["push", "origin", "main"]); await mergeMainIntoFixtureFlip(h);
  await importWindowFixture(h);
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const result = await account(h);
  expect(result, result.report).toMatchObject({ exit: 0, result: { data: { files: expect.arrayContaining([
    ...["old-first.json", "middle.json", "old-live-first.json"].map(path => expect.objectContaining({
      path: expect.stringContaining(path), classification: "imported" })),
  ]) } } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
}, 60_000);

it("reports a rename whose successor exists without its former name and passes after source repair", async () => {
  const h = await windowFixture({ completed: true });
  await importWindowFixture(h);
  const before = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const path = resolveArcPath({ kind: "transition-record", origin: SlugSchema.parse("old-missing") });
  const fields = LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: "old-missing" }, kind: "rename", successors: [{ name: "archived" }], incoming: [] });
  await mkdir(dirname(join(h.root, path)), { recursive: true });
  await writeFile(join(h.root, path), writeLineageRecord(fields));
  await h.git("git", ["add", path]); await h.git("git", ["commit", "-m", "Add an unconsumed rename"]);
  const result = await account(h);
  expect(result, result.report).toMatchObject({ exit: 1, result: { data: { files: expect.arrayContaining([
    expect.objectContaining({ path, classification: "reported", reason: expect.stringContaining("former name old-missing") }),
  ]) } } });
  await h.git("git", ["reset", "--hard", before]);
  expect(await account(h)).toMatchObject({ exit: 0 });
}, 60_000);
