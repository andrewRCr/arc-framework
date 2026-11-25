/** Differential lifecycle queries over real Git and the existing view/index readers. */
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { listLifecycleIndex, listHeldLifecycleIndex, isLifecycleSelectedHere, lookupLifecycle, type LifecycleIndexOutcome } from "../../src/lib/store/lifecycle-index.js";
import { createInRepoFixture } from "../helpers/store/in-repo-fixture.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { buildLifecycleIndex } from "../../src/lib/work-unit/lifecycle-index.js";
import { resolveComposedLifecycleIndex } from "../../src/lib/work-unit/composed-lifecycle-index.js";
import { resolveExplicitViewTarget } from "../../src/handlers/view.js";
import { OwnerIdentitySchema, recordReferences, StateVersionSchema } from "../../src/lib/store/identity.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";
import { createGitTreeReadFs } from "../../src/scripts/review-gate/hosts/local/git-tree-fs.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";

function complete(value: LifecycleIndexOutcome) {
  expect(value.status).toBe("complete");
  if (value.status !== "complete") throw new Error("Expected lifecycle entries");
  return value;
}
const reference = (name: string) => recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name }));
async function repository() {
  const h = await trackedWriteFixture();
  await h.exec("git", ["commit", "--allow-empty", "-m", "Initialize"]);
  const put = async (path: string, content: string) => { await mkdir(dirname(join(h.root, path)), { recursive: true }); await writeFile(join(h.root, path), content); };
  const commit = async () => { await h.exec("git", ["add", "-A"]); await h.exec("git", ["commit", "--allow-empty", "-m", "Save lifecycle records"]); return StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim()); };
  const fs = { readFile: (path: string) => readFile(path, "utf8"), readdir: (path: string) => readdir(path, { withFileTypes: true }) };
  return { ...h, put, commit, fs };
}

describe("identity lifecycle index", () => {
  it("lists parsed backlog, active and completed fields without projected paths", async () => {
    const h = await repository();
    const cases = [
      ["planned", ".arc/backlog/planned/group/planned/meta-planned.md", "Planning"],
      ["active", ".arc/active/meta-active.md", "Active"],
      ["completed", ".arc/completed/2026-q4/01_completed/meta-completed.md", "Shipped"],
    ] as const;
    for (const [name, path, state] of cases) await h.put(path, makeMetaFixture(name, { state, cohort: name === "planned" ? "group" : null, dependsOn: ["dependency"] }));
    const index = complete(success(await listLifecycleIndex(h.store))).index;
    for (const [name, path] of cases) {
      const entry = index.get(reference(name).owner);
      expect(entry).toBeDefined();
      expect(entry?.fields).toEqual(parseMetaRecord(await h.fs.readFile(join(h.root, path))));
      expect(entry?.location).toBe(name);
      expect(entry).not.toHaveProperty("path");
    }
    expect(index.entries()).toHaveLength(3);
  });
  it("reads HEAD fields while a later working-tree edit reaches neither saved index nor tree composition", async () => {
    const h = await repository();
    await h.put(".arc/active/meta-example.md", makeMetaFixture("example"));
    const head = await h.commit();
    const original = complete(success(await listLifecycleIndex(h.store, { asOf: head })));
    const treeFs = createGitTreeReadFs({ cwd: h.root, revision: head, exec: h.exec });
    const legacy = await resolveComposedLifecycleIndex({ cwd: h.root, fs: treeFs });
    for (const entry of original.index.entries()) {
      const old = legacy.index.get(entry.reference.owner.name);
      expect({ phase: entry.phase, location: entry.location, cohort: entry.fields.cohort, dependsOn: entry.fields.dependsOn }).toEqual({ phase: old?.phase, location: old?.location, cohort: old?.cohort, dependsOn: old?.dependsOn });
    }
    await h.put(".arc/active/meta-example.md", makeMetaFixture("example", { owner: "changed-owner" }));
    expect(complete(success(await listLifecycleIndex(h.store, { asOf: head }))).index.entries()).toEqual(original.index.entries());
    expect(original.asOf).toBe(head);
    expect(complete(success(await listLifecycleIndex(h.store))).index.get(reference("example").owner)?.fields.owner).toBe("changed-owner");
  });
  it("drops unplaceable state and the two intentional tree-index differences", async () => {
    const h = await repository();
    await h.put(".arc/active/meta-invalid.md", makeMetaFixture("invalid").replace("`Active`", "`unrecognized`"));
    await h.put(".arc/active/meta-shadowed.md", makeMetaFixture("shadowed").replace("`Active`", "`unrecognized`"));
    await h.put(".arc/completed/2026-q4/01_shadowed/meta-shadowed.md", makeMetaFixture("shadowed", { state: "Shipped" }));
    await h.put(".arc/backlog/planned/meta-flat.md", makeMetaFixture("flat", { state: "Planning" }));
    await h.put(".arc/backlog/planned/displaced/meta-displaced.md", makeMetaFixture("displaced").replace("`Active`", "`unrecognized`"));
    await h.put(".arc/completed/2026-q4/02_displaced/meta-displaced.md", makeMetaFixture("displaced", { state: "Shipped" }));
    const old = await buildLifecycleIndex({ cwd: h.root, fs: h.fs });
    const outcome = success(await listHeldLifecycleIndex(h.store));
    const entries = outcome.status === "complete" ? outcome.index.entries() : [];
    expect(entries.map((entry) => entry.reference.owner.name)).not.toContain("invalid");
    expect(old.has("invalid")).toBe(false);
    expect(entries.map((entry) => entry.reference.owner.name)).not.toContain("shadowed");
    expect(old.get("shadowed")?.location).toBe("completed");
    expect(entries.map((entry) => entry.reference.owner.name)).not.toContain("flat");
    expect(old.get("flat")?.location).toBe("planned");
    expect(entries.find((entry) => entry.reference.owner.name === "displaced")?.location).toBe("completed");
    expect(old.get("displaced")?.location).toBe("completed");
    const head = await h.commit();
    const saved = complete(success(await listLifecycleIndex(h.store, { asOf: head })));
    expect(saved.index.entries()).toEqual(entries);
    expect(saved.diagnostics).toEqual(outcome.status === "complete" ? outcome.diagnostics : []);
    const legacySaved = await resolveComposedLifecycleIndex({ cwd: h.root, fs: createGitTreeReadFs({ cwd: h.root, revision: head, exec: h.exec }) });
    expect(legacySaved.index.get("shadowed")?.location).toBe("completed");
    expect(legacySaved.index.get("flat")?.location).toBe("planned");
  });
  it("compares required semantic fields while ignoring Progress changes", async () => {
    const h = await repository();
    await h.put(".arc/active/meta-example.md", makeMetaFixture("example"));
    const old = await resolveComposedLifecycleIndex({ cwd: h.root, fs: h.fs });
    expect(success(await isLifecycleSelectedHere(h.store, { reference: reference("example") }))).toBe(old.recordsBySlug.get("example")?.writablePath !== undefined);
    const entry = complete(success(await listLifecycleIndex(h.store))).index.get(reference("example").owner);
    expect(entry?.placement).toEqual({ kind: "active" });
    expect(resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: reference("example").owner.name,
      placement: { kind: "active", scope: { kind: "project" } } })).toBe(old.recordsBySlug.get("example")?.writablePath);
    await h.put(".arc/active/meta-example.md", `${makeMetaFixture("example")}\nProgress changed\n`);
    expect(success(await isLifecycleSelectedHere(h.store, { reference: reference("example") }))).toBe(true);
    expect(success(await isLifecycleSelectedHere(h.store, { reference: reference("missing") }))).toBe(false);
  });
  it.each(["other-branch", "disagreeing-tree", "parked"] as const)("matches composed selection for %s", async (scenario) => {
    const h = await repository();
    const branch = makeMetaFixture("example", { branch: "feat/example", cohort: "group", dependsOn: ["first", "second"], nextTask: "Selected progress" });
    await h.exec("git", ["checkout", "-b", "feat/example"]);
    await h.put(".arc/active/meta-example.md", branch);
    await h.commit();
    await h.exec("git", ["checkout", "main"]);
    if (scenario === "disagreeing-tree") await h.put(".arc/backlog/planned/group/example/meta-example.md", makeMetaFixture("example", { branch: "feat/example", cohort: "group", owner: "different-owner" }));
    if (scenario === "parked") await h.put(".arc/backlog/planned/group/example/meta-example.md", makeMetaFixture("example", { branch: "feat/example", cohort: "group", dependsOn: ["second", "first", "first"], nextTask: "Pointer progress" }));
    const legacy = await resolveComposedLifecycleIndex({ cwd: h.root, fs: h.fs, oracle: { exec: h.exec, acquisitionPolicy: "local", baseBranch: "main" } });
    const index = complete(success(await listLifecycleIndex(h.store))).index;
    const entry = index.get(reference("example").owner);
    expect(entry).toBeDefined();
    expect(entry?.fields.nextTask).toBe("Selected progress");
    expect(entry?.phase).toBe(legacy.index.get("example")?.phase);
    expect(entry?.location).toBe(legacy.index.get("example")?.location);
    expect(success(await isLifecycleSelectedHere(h.store, { reference: reference("example") }))).toBe(legacy.recordsBySlug.get("example")?.writablePath !== undefined);
    expect(success(await isLifecycleSelectedHere(h.store, { reference: reference("example") }))).toBe(scenario === "parked");
    if (scenario === "parked" && entry?.placement.kind === "backlog") {
      expect(resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: entry.reference.owner.name,
        placement: { ...entry.placement, cohort: entry.fields.cohort?.split("/").map((segment) => SlugSchema.parse(segment)) ?? [] } }))
        .toBe(legacy.recordsBySlug.get("example")?.writablePath);
    }
  });
  it("resolves lineage by slug and checkout work-unit claims through public lookup", async () => {
    const fixture = await createInRepoFixture();
    const meta = fixture.reference("work-item/meta");
    success(await fixture.store.write({ action: "put", reference: meta, content: fixture.content(meta), expected: null, placement: { kind: "active" }, provenance: { verb: "stub", lifecycleAction: "stub" } }));
    const transition = fixture.reference("lineage/transition");
    success(await fixture.store.write({ action: "put", reference: transition, content: fixture.content(transition), expected: null, provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    expect(await lookupLifecycle(fixture.store, { kind: "lineage", origin: meta.owner.name })).toEqual(await fixture.store.lookup({ kind: "lineage", origin: meta.owner.name }));
    expect(success(await lookupLifecycle(fixture.store, { kind: "claim", claim: { kind: "work-unit", slug: meta.owner.name } })).reference).toEqual(meta);
  });
  it.each(["active", "planned", "provisional", "completed", "missing"])("serves view's explicit %s query with the same fields and placement", async (name) => {
    const h = await repository();
    const path = name === "active" ? ".arc/active/meta-active.md" : name === "completed" ? ".arc/completed/2026-q4/01_completed/meta-completed.md" : `.arc/backlog/${name}/group/${name}/meta-${name}.md`;
    if (name !== "missing") await h.put(path, makeMetaFixture(name, { state: name === "completed" ? "Shipped" : name === "active" ? "Active" : "Planning", cohort: ["planned", "provisional"].includes(name) ? "group" : null, taskList: `tasks-${name}.md` }));
    const oldIndex = await buildLifecycleIndex({ cwd: h.root, fs: h.fs });
    const old = await resolveExplicitViewTarget({ cwd: h.root, slug: name, index: oldIndex, readFile: h.fs.readFile });
    const outcome = success(await listHeldLifecycleIndex(h.store));
    const entry = outcome.status === "complete" ? outcome.index.get(reference(name).owner) : undefined;
    if (name === "missing") { expect(entry).toBeUndefined(); expect(old.status).toBe("unavailable"); }
    else if (name === "completed") { expect(entry?.location).toBe("completed"); expect(old.status).toBe("completed"); }
    else {
      expect(old.status).toBe("resolved");
      if (old.status !== "resolved" || !entry) throw new Error("Expected explicit target");
      expect(entry.fields).toEqual(parseMetaRecord(await h.fs.readFile(join(h.root, old.metaPath))));
      expect(entry.location).toBe(old.location);
      expect(entry.placement.kind).toBe(old.placement.kind);
      expect(entry.fields.taskList).toBe(`tasks-${name}.md`);
      if (entry.placement.kind === "backlog") expect(entry.fields.cohort?.split("/").map((segment) => SlugSchema.parse(segment))).toEqual(old.placement.kind === "backlog" ? old.placement.cohort : []);
    }
  });
});
