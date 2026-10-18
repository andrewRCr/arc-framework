/** Terminal scratch aliases follow authenticated history without moving personal files. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, onTestFinished } from "vitest";
import { applyScratchReconcile } from "../../src/lib/user-reference-scratch.js";
import { RecordReferenceSchema, recordReferences } from "../../src/lib/store/identity.js";
import { batchLifecycleWrites, recordPut } from "../../src/lib/store/lifecycle-write.js";
import { LineageRecordSchema, writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import type { Store } from "../../src/lib/store/contract.js";
import { createLifecycleHarness, lifecycleSuccess as ok } from "../helpers/store/lifecycle-harness.js";
import { createMemoryRemote } from "../helpers/store/sync.js";
import { ReferenceBackend } from "../helpers/store/reference-backend.js";
import { renderMetaFile } from "../../src/lib/store/kinds/meta/writers.js";
import { runStoreAbandon } from "../../src/lib/work-unit/verbs/abandon-store.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { createDefaultLocusPorts } from "../../src/lib/work-unit/locus-ports.js";
import { createUserIOContext } from "../../src/lib/io-context.js";

async function fixture(kind: "abandon" | "decompose" = "abandon") {
  const cwd = await mkdtemp(join(tmpdir(), "arc-scratch-terminal-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const h = createLifecycleHarness();
  const retire = async (name: string) => {
    const original = await h.seedMeta("former", { owner: "andrew" });
    const reference = RecordReferenceSchema.parse({ ...original.reference, owner: { ...original.reference.owner, name } });
    ok(await h.store.write({ ...recordPut(original, { content: original.content.replaceAll("former", name) }), reference,
      provenance: { verb: "rename", lifecycleAction: "rename" } }));
    const current = ok(await h.store.read({ reference }));
    if (kind === "decompose") await h.seedMeta(`${name}-part`);
    const lineage = recordReferences["lineage/transition"](current.reference.owner);
    const content = writeLineageRecord(LineageRecordSchema.parse({ schemaVersion: 2, kind,
      origin: { name, ...("uid" in current.reference.owner ? { uid: current.reference.owner.uid } : {}) },
      successors: kind === "decompose" ? [{ name: `${name}-part` }] : [], incoming: [], retiredBranches: [],
      ...(kind === "decompose" ? { outgoing: [] } : {}) }));
    ok(await batchLifecycleWrites(h.store, [{ action: "remove", reference: current.reference, expected: current.version },
      { action: "put", reference: lineage, expected: null, content }], { verb: kind, lifecycleAction: kind }));
    return ok(await h.store.read({ reference: lineage }));
  };
  const terminal = await retire("current");
  const path = join(cwd, ".arc/user/andrew/scratch/work-unit/former");
  await mkdir(path, { recursive: true }); await writeFile(join(path, "idea"), "Still wanted");
  return { ...h, cwd, path, terminal, retire, input: { cwd, identity: "andrew", store: h.store } };
}

it.each(["abandon", "decompose"] as const)("reports a former name as ended after %s removed the renamed primary", async kind => {
  const h = await fixture(kind);
  expect(await applyScratchReconcile(h.input)).toMatchObject({ moves: [], advisories: [{ path: h.path, reason: "ended" }] });
  expect(await readFile(join(h.path, "idea"), "utf8")).toBe("Still wanted");
});

it("withholds an ambiguous terminal alias and keeps personal files", async () => {
  const h = await fixture(); await h.retire("another-current");
  await expect(applyScratchReconcile(h.input)).rejects.toThrow(/ambiguous.*retry/iu);
  expect(await readFile(join(h.path, "idea"), "utf8")).toBe("Still wanted");
});

it("withholds incomplete terminal discovery and retries after inventory repair", async () => {
  const h = await fixture(); let incomplete = true;
  const store = Object.create(h.store) as Store;
  store.list = async input => {
    const result = await h.store.list(input);
    return incomplete && input.kind === "lineage/transition" && result.status === "ok" && result.result.status === "complete"
      ? { status: "ok", result: { ...result.result, missed: true } } : result;
  };
  const input = { ...h.input, store };
  await expect(applyScratchReconcile(input)).rejects.toThrow(/incomplete.*retry/iu);
  expect(await readFile(join(h.path, "idea"), "utf8")).toBe("Still wanted");
  incomplete = false;
  expect(await applyScratchReconcile(input)).toMatchObject({ moves: [], advisories: [{ path: h.path, reason: "ended" }] });
});

it("withholds conflicted terminal history and retries after explicit resolution", async () => {
  const h = await fixture(), remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  ok(await writer.write({ action: "put", reference: recordReferences["work-item/meta"](h.terminal.reference.owner), expected: null,
    content: renderMetaFile("current", { owner: "andrew", state: "Active", currentWorkflow: "process-task-loop" }),
    placement: { kind: "active" }, links: { branches: [{ repository: "project", ref: "feat/current", linkedAs: "created", excluded: [] }] },
    provenance: { verb: "seed-lifecycle", lifecycleAction: "create" } }));
  const exec = async () => { throw new Error("No checkout artifacts apply"); };
  const executor = buildExecutorContext({ cwd: "/absent", store: writer, io: { ...createUserIOContext(), exec },
    identity: "andrew", teamMode: false, internalTemplateDir: "/templates", projectId: async () => "project",
    locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null } });
  expect(await runStoreAbandon({ executor }, { name: "current", confirmed: true })).toMatchObject({ status: "abandoned" });
  ok(await h.store.sync());
  const disputed = ok(await h.store.read({ reference: h.terminal.reference })); expect(disputed.conflicts.length).toBeGreaterThan(0);
  const blocked = applyScratchReconcile(h.input);
  await expect(blocked).rejects.toThrow(/conflict.*retry/iu);
  for (const reference of disputed.conflicts) await expect(blocked).rejects.toThrow(JSON.stringify(reference));
  for (const reference of disputed.conflicts) {
    const conflict = ok(await h.store.read({ reference }));
    ok(await h.store.write({ action: "remove", reference, expected: conflict.version, resolves: [reference],
      provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  }
  expect(await applyScratchReconcile(h.input)).toMatchObject({ moves: [], advisories: [{ path: h.path, reason: "ended" }] });
  expect(await readFile(join(h.path, "idea"), "utf8")).toBe("Still wanted");
});
