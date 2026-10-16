/** Session repairs use registered CLI inputs and preserve real checkout contents. */
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { renderMetaFile } from "../../src/lib/store/kinds/meta/writers.js";
import { ParsedMetaRecordSchema } from "../../src/lib/active/meta-schema.js";
import { readWorktreeMarker, writeWorktreeMarker, ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs } from "../../src/lib/git/worktree-marker.js";

it("overwrites handoff context, refuses a boundary without writing, then accepts repaired stdin", async () => {
  const f = await repairCliFixture(), meta = await f.h.workUnit();
  await ensureWorktreeMarkerIgnored(f.cwd, f.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(f.cwd, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: new Date(0).toISOString(), createdFor: { kind: "work-unit", name: meta.reference.owner.name } });
  const file = join(f.cwd, ".git/handoff.json");
  await writeFile(file, JSON.stringify({ schemaVersion: 1, sessionContext: "Prior session context", nextAction: "Continue", sessionType: "execution" }));
  expect(await repairCli(f, ["handoff", "write", file])).toMatchObject({ result: { status: "written" } });
  const prior = success(await f.h.context.store.read({ reference: meta.reference }));
  expect(ParsedMetaRecordSchema.parse(prior.fields)).toMatchObject({ sessionContext: "Prior session context", sessionType: "execution" });
  const version = success(await f.h.context.store.version());
  const invalid = { schemaVersion: 1, sessionContext: "Keep\n## Escaped section", nextAction: "Continue" };
  const refused = await repairCli(f, ["handoff", "write", "-"], { stdin: JSON.stringify(invalid) });
  expect(refused).toMatchObject({ exitCode: 1, result: { status: "refused", refusal: { condition: expect.stringContaining("## Escaped section"), remedy: { text: expect.stringContaining("Rewrite") } } } });
  expect(success(await f.h.context.store.version())).toBe(version);
  expect(success(await f.h.context.store.read({ reference: meta.reference }))).toEqual(prior);
  expect(await repairCli(f, ["handoff", "write", "-"], { stdin: JSON.stringify({ ...invalid, sessionContext: "Repaired replacement context" }) })).toMatchObject({ result: { status: "written", stateAtHandoff: version, commitAtHandoff: f.head.trim() } });
  const after = success(await f.h.context.store.read({ reference: meta.reference }));
  expect(ParsedMetaRecordSchema.parse(after.fields)).toMatchObject({ sessionContext: "Repaired replacement context", sessionType: null, stateAtHandoff: version, commitAtHandoff: f.head.trim() });
  expect(after.content).not.toContain("Prior session context");
  expect(success(await f.h.context.store.history({ reference: meta.reference }))).toHaveLength(3);
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
}, 30000);

it("refuses no-slug release of owned live work, then pauses it and releases only its marker", async () => {
  const f = await repairCliFixture(), meta = await f.h.workUnit("release", "test-user", "active", "", "Planning");
  await ensureWorktreeMarkerIgnored(f.cwd, f.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(f.cwd, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: new Date(0).toISOString(), createdFor: { kind: "work-unit", name: meta.reference.owner.name } });
  const dirty = join(f.cwd, "personal-change"); await writeFile(dirty, "Keep this local edit\n");
  expect(await repairCli(f, ["locus", "release", "--json"])).toMatchObject({ result: { status: "refused", reason: expect.stringContaining(`arc pause ${meta.reference.owner.name} --reason <text>`) } });
  expect(await readWorktreeMarker(f.cwd)).toMatchObject({ kind: "present" });
  await repairCli(f, ["pause", meta.reference.owner.name, "--reason", "Waiting for owner input"]);
  const paused = success(await f.h.context.store.read({ reference: meta.reference }));
  expect(ParsedMetaRecordSchema.parse(paused.fields).pause).not.toBeNull();
  expect(await repairCli(f, ["locus", "release", "--json"])).toMatchObject({ result: { status: "released", spawned: false } });
  expect(await readWorktreeMarker(f.cwd)).toEqual({ kind: "absent" });
  expect(success(await f.h.context.store.read({ reference: meta.reference }))).toEqual(paused);
  expect(await readFile(dirty, "utf8")).toBe("Keep this local edit\n");
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
}, 30000);

it("keeps occupied promoted scratch folders until the person repairs the destination, then applies the UID alias move", async () => {
  const f = await repairCliFixture(), source = await f.h.errand("source");
  const reference = RecordReferenceSchema.parse({ ...source.reference, kind: "work-item/meta", owner: { ...source.reference.owner, name: "promoted" } });
  success(await f.h.context.store.batch({ writes: [{ action: "put", reference, expected: source.version,
    content: renderMetaFile("promoted", { owner: "test-user", state: "Planning", currentWorkflow: "draft-design", nextAction: "Continue design", promotionReceipt: `errand-v1/${source.reference.owner.name}/${"a".repeat(32)}` }), placement: { kind: "active" } }], provenance: { verb: "errand-promote", lifecycleAction: "promote" } }));
  const promoted = success(await f.h.context.store.read({ reference: source.reference }));
  expect(promoted.reference.owner).toMatchObject({ ...source.reference.owner, name: "promoted" });
  const renamed = RecordReferenceSchema.parse({ ...promoted.reference, owner: { ...promoted.reference.owner, name: "renamed-promotion" } });
  success(await f.h.context.store.write({ action: "put", reference: renamed, expected: promoted.version, content: promoted.content.replaceAll("promoted", "renamed-promotion"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "transition" } }));
  const root = join(f.cwd, ".arc/user/test-user/scratch/work-unit"), from = join(root, "promoted"), to = join(root, "renamed-promotion");
  await mkdir(from, { recursive: true }); await mkdir(to);
  await writeFile(join(from, "idea"), "Personal promotion idea"); await writeFile(join(to, "other"), "Existing destination idea");
  const before = success(await f.h.context.store.version());
  expect(await repairCli(f, ["user", "reconcile-references", "--apply", "--json"])).toMatchObject({ result: { status: "advisory", plan: { scratch: { moves: [], advisories: [{ reason: "occupied" }] } } } });
  expect(await readFile(join(from, "idea"), "utf8")).toBe("Personal promotion idea"); expect(await readFile(join(to, "other"), "utf8")).toBe("Existing destination idea");
  const savedPersonalFolder = join(f.cwd, ".git/saved-personal-folder");
  await rename(to, savedPersonalFolder);
  expect(await repairCli(f, ["user", "reconcile-references", "--apply", "--json"])).toMatchObject({ result: { status: "applied", plan: { scratch: { moves: [{ from, to }] } } } });
  expect(await readdir(root)).toEqual(["renamed-promotion"]);
  expect(await readFile(join(savedPersonalFolder, "other"), "utf8")).toBe("Existing destination idea");
  expect(await readFile(join(to, "idea"), "utf8")).toBe("Personal promotion idea");
  expect(success(await f.h.context.store.version())).toBe(before);
  expect(success(await f.h.context.store.read({ reference: renamed }))).toMatchObject({ reference: renamed });
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
}, 30000);
