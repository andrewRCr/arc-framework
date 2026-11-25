/** Work-unit writes use exactly the copy selected by reads, including batch-created primaries. */
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { trackedWriteFixture, trackedCheckoutStore, trackedDigest } from "../helpers/store/tracked-write-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/index.js";

const provenance = { verb: "start", lifecycleAction: "start" };
async function exists(path: string) { return access(path).then(() => true, () => false); }
async function linkedWorkUnit(parked = false) {
  const h = await trackedWriteFixture();
  const stubPath = join(h.root, ".arc/backlog/planned/example/meta-example.md");
  await mkdir(join(h.root, ".arc/backlog/planned/example"), { recursive: true });
  const stub = makeMetaFixture("example", { state: "Planning", branch: "feat/example" });
  await writeFile(stubPath, stub);
  await h.exec("git", ["add", ".arc"]);
  await h.exec("git", ["commit", "-m", "planned stub"]);
  const linked = join(h.root, "linked");
  await h.exec("git", ["worktree", "add", "-b", "feat/example", linked]);
  const active = makeMetaFixture("example", { branch: "feat/example" });
  await unlink(join(linked, ".arc/backlog/planned/example/meta-example.md"));
  await mkdir(join(linked, ".arc/active"), { recursive: true });
  await writeFile(join(linked, ".arc/active/meta-example.md"), active);
  const linkedStore = trackedCheckoutStore(linked);
  await h.exec("git", ["add", "-A"], { cwd: linked });
  await h.exec("git", ["commit", "-m", "active work unit"], { cwd: linked });
  if (parked) {
    await writeFile(stubPath, active);
    await writeFile(join(h.root, ".arc/backlog/planned/example/draft-example.md"), "stub draft");
  }
  return { ...h, linked, linkedStore, stubPath, active };
}

describe("tracked work-unit write admission", () => {
  it.each([
    ["meta", "work-item/meta"], ["tasks", "work-item/task-list"], ["draft", "work-item/draft"],
    ["spec", "work-item/spec"], ["notes", "work-item/notes"], ["cohort", "cohort/document"],
  ] as const)("refuses conventional-role companion aliases: %s", async (key, kind) => {
    const h = await trackedWriteFixture();
    const meta = makeMetaFixture("example");
    await mkdir(join(h.root, ".arc/active"), { recursive: true });
    await writeFile(join(h.root, ".arc/active/meta-example.md"), meta);
    const path = join(h.root, `.arc/active/${key}-example.md`);
    const before = key === "meta" ? meta : "original role bytes\n";
    await writeFile(path, before);
    const alias = h.reference("work-item/companion", "example", key);
    expect(await h.store.read({ reference: alias })).toMatchObject({ status: "refused", refusal: {
      code: "unsupported", case: "unhomed-kind", remedy: { text: expect.stringContaining(kind) },
    } });
    expect(await h.store.write({ action: "put", reference: alias, expected: trackedDigest(before), content: "alias bytes", provenance }))
      .toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind" } });
    expect(await readFile(path, "utf8")).toBe(before);
    const owner = OwnerIdentitySchema.parse({ type: kind === "cohort/document" ? "cohort" : "work-item", name: "example" });
    const reference = recordReferences[kind](owner);
    const content = key === "meta" ? meta + "\nCorrect role update\n" : "correct role bytes\n";
    success(await h.store.write({ action: "put", reference, expected: key === "cohort" ? null : trackedDigest(before), content,
      ...(key === "meta" ? { placement: { kind: "active" as const } } : {}), provenance }));
    expect(success(await h.store.read({ reference })).content).toBe(content);
    for (const half of ["spec-prd", "spec-rfc"]) {
      const paired = h.reference("work-item/companion", "example", half);
      success(await h.store.write({ action: "put", reference: paired, expected: null, content: half, provenance }));
      expect(success(await h.store.read({ reference: paired })).content).toBe(half);
    }
  });

  it("refuses an orphan draft and creates it beside a new meta in one batch", async () => {
    const h = await trackedWriteFixture();
    const reference = h.reference("work-item/draft");
    const draft = { action: "put" as const, reference, content: "new draft", expected: null };
    expect(await h.store.write({ ...draft, provenance })).toMatchObject({ status: "refused", refusal: { code: "not-found", remedy: { text: expect.stringContaining("batch") } } });
    const meta = { action: "put" as const, reference: h.reference("work-item/meta"), content: makeMetaFixture("example"), expected: null, placement: { kind: "active" as const } };
    const batch = success(await h.store.batch({ writes: [draft, meta], provenance }));
    expect(batch.writes).toHaveLength(2);
    expect(await readFile(join(h.root, ".arc/active/draft-example.md"), "utf8")).toBe(draft.content);
    expect(await readFile(join(h.root, ".arc/active/meta-example.md"), "utf8")).toBe(meta.content);
  });

  it("writes the task list beside a rejected flat-active meta without composing branches", async () => {
    const h = await trackedWriteFixture();
    await mkdir(join(h.root, ".arc/active"), { recursive: true });
    await writeFile(join(h.root, ".arc/active/meta-example.md"), "| **State** | **Owner** | **Branch** | **Class** | **Priority** |\nnot a table\n");
    h.ports.exec = async () => { throw new Error("A flat-active write must not compose branches"); };
    const reference = h.reference("work-item/task-list");
    success(await h.store.write({ action: "put", reference, content: "hand-written task list", expected: null, provenance }));
    expect(await readFile(join(h.root, ".arc/active/tasks-example.md"), "utf8")).toBe("hand-written task list");
  });

  it("refuses companion creation beside a disagreeing stub and lands from the selected worktree", async () => {
    const h = await linkedWorkUnit();
    const input = { action: "put" as const, reference: h.reference("work-item/draft"), content: "new draft", expected: null, provenance };
    expect(await h.store.write(input)).toMatchObject({ status: "refused", refusal: { code: "checkout-not-writable", checkout: h.linked,
      remedy: { text: expect.stringContaining(h.linked) } } });
    expect(await exists(join(h.root, ".arc/backlog/planned/example/draft-example.md"))).toBe(false);
    success(await h.linkedStore.write(input));
    expect(await readFile(join(h.linked, ".arc/active/draft-example.md"), "utf8")).toBe(input.content);
  });

  it("writes and removes the parked pointer and its own draft against their actual bytes", async () => {
    const h = await linkedWorkUnit(true);
    const draftPath = join(h.root, ".arc/backlog/planned/example/draft-example.md");
    const draft = h.reference("work-item/draft");
    const meta = h.reference("work-item/meta");
    success(await h.store.write({ action: "put", reference: draft, content: "changed pointer draft",
      expected: trackedDigest("stub draft"), provenance }));
    const updated = h.active + "\nPointer-only progress.\n";
    success(await h.store.write({ action: "put", reference: meta, content: updated,
      expected: trackedDigest(h.active), placement: { kind: "backlog", commitment: "planned" }, provenance }));
    expect(await readFile(h.stubPath, "utf8")).toBe(updated);
    success(await h.store.batch({ writes: [
      { action: "remove", reference: meta, expected: trackedDigest(updated) },
      { action: "remove", reference: draft, expected: trackedDigest("changed pointer draft") },
    ], provenance }));
    expect(await exists(h.stubPath)).toBe(false);
    expect(await exists(draftPath)).toBe(false);
    expect(await readFile(join(h.linked, ".arc/active/meta-example.md"), "utf8")).toBe(h.active);
    expect(success(await h.store.read({ reference: meta }))).toMatchObject({ content: h.active });
    const held = success(await h.store.list({ family: "work-item", kind: "work-item/meta", filter: { heldHere: true } }));
    expect(held.status).toBe("absent");
  });

  it("names an unheld branch and admits the same draft after checking it out", async () => {
    const h = await linkedWorkUnit();
    await h.exec("git", ["worktree", "remove", h.linked]);
    const input = { action: "put" as const, reference: h.reference("work-item/draft"), content: "branch draft", expected: null, provenance };
    expect(await h.store.write(input)).toMatchObject({ status: "refused", refusal: { code: "checkout-not-writable", checkout: "feat/example",
      remedy: { text: expect.stringContaining("feat/example") } } });
    expect(await exists(join(h.root, ".arc/backlog/planned/example/draft-example.md"))).toBe(false);
    await h.exec("git", ["checkout", "feat/example"]);
    success(await h.store.write(input));
    expect(success(await h.store.read({ reference: input.reference }))).toMatchObject({ content: input.content });
  });

  it("refuses companion creation with no held primary and lands it in the selected checkout", async () => {
    const h = await linkedWorkUnit();
    await unlink(h.stubPath);
    const input = { action: "put" as const, reference: h.reference("work-item/task-list"), content: "branch tasks", expected: null, provenance };
    expect(await h.store.write(input)).toMatchObject({ status: "refused", refusal: { code: "checkout-not-writable", checkout: h.linked } });
    expect(await exists(join(h.root, ".arc/active/tasks-example.md"))).toBe(false);
    success(await h.linkedStore.write(input));
    expect(success(await h.linkedStore.read({ reference: input.reference }))).toMatchObject({ content: input.content });
  });

  it("requires committing a placement move on the owning branch before admitting its draft", async () => {
    const h = await linkedWorkUnit();
    const destination = join(h.linked, ".arc/backlog/planned/example/meta-example.md");
    await mkdir(join(h.linked, ".arc/backlog/planned/example"), { recursive: true });
    await unlink(join(h.linked, ".arc/active/meta-example.md"));
    await writeFile(destination, makeMetaFixture("example", { state: "Planning", branch: "feat/example" }));
    const input = { action: "put" as const, reference: h.reference("work-item/draft"), content: "moved draft", expected: null, provenance };
    expect(await h.linkedStore.write(input)).toMatchObject({ status: "refused", refusal: { code: "checkout-not-writable", checkout: h.linked,
      remedy: { text: expect.stringMatching(/commit.*move/iu) } } });
    expect(await exists(join(h.linked, ".arc/backlog/planned/example/draft-example.md"))).toBe(false);
    await h.exec("git", ["add", "-A"], { cwd: h.linked });
    await h.exec("git", ["commit", "-m", "move placement"], { cwd: h.linked });
    success(await h.linkedStore.write(input));
    expect(success(await h.linkedStore.read({ reference: input.reference }))).toMatchObject({ content: input.content });
  });

  it("uses the last-fetched listing for admission when another clone starts a work unit", async () => {
    const h = await trackedWriteFixture();
    const planned = join(h.root, ".arc/backlog/planned/example/meta-example.md");
    await mkdir(join(h.root, ".arc/backlog/planned/example"), { recursive: true });
    await writeFile(planned, makeMetaFixture("example", { state: "Planning", branch: "feat/example" }));
    await h.exec("git", ["add", ".arc"]);
    await h.exec("git", ["commit", "-m", "planned work unit"]);
    const other = join(h.root, "other-clone");
    await h.exec("git", ["clone", h.root, other]);
    await h.exec("git", ["config", "user.name", "Other writer"], { cwd: other });
    await h.exec("git", ["config", "user.email", "writer@example.test"], { cwd: other });
    await h.exec("git", ["checkout", "-b", "feat/example"], { cwd: other });
    await h.exec("git", ["remote", "add", "origin", other]);
    await h.exec("git", ["fetch", "origin"]);
    await unlink(planned);
    await unlink(join(other, ".arc/backlog/planned/example/meta-example.md"));
    await mkdir(join(other, ".arc/active"), { recursive: true });
    await writeFile(join(other, ".arc/active/meta-example.md"), makeMetaFixture("example", { branch: "feat/example" }));
    await h.exec("git", ["add", "-A"], { cwd: other });
    await h.exec("git", ["commit", "-m", "start work unit"], { cwd: other });
    const exec = h.ports.exec;
    h.ports.exec = async (command, args, options) => {
      if (args.includes("fetch")) throw new Error("Admission and listing must never fetch");
      return exec(command, args, options);
    };
    const listed = success(await h.store.list({ family: "work-item", kind: "work-item/meta" }));
    expect(listed).toMatchObject({ status: "absent" });
    const input = { action: "put" as const, reference: h.reference("work-item/draft"), content: "selected draft", expected: null, provenance };
    expect(await h.store.write(input)).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await exists(join(h.root, ".arc/active/draft-example.md"))).toBe(false);
    await h.exec("git", ["fetch", "origin"]);
    expect(success(await h.store.list({ family: "work-item", kind: "work-item/meta" }))).toMatchObject({ status: "complete",
      records: [{ placement: { kind: "active" } }] });
    expect(await h.store.write(input)).toMatchObject({ status: "refused", refusal: { code: "checkout-not-writable",
      checkout: "origin/feat/example", remedy: { text: expect.stringContaining("origin/feat/example") } } });
    await h.exec("git", ["checkout", "-b", "feat/example", "origin/feat/example"]);
    success(await h.store.write(input));
    expect(success(await h.store.read({ reference: input.reference }))).toMatchObject({ content: input.content });
  });
});
