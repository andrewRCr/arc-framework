/** One checkout carries hand edits through stale merges, resolution, and production write-check repair. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";

const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});

import { dispatchRegisteredCli } from "../../../helpers/registered-cli.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { configureEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { TASK_RULE_CONTENT } from "../../../helpers/store/task-rule-input.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { createKindRegistry } from "../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../src/lib/store/kinds/registrations.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { ConflictRecordSchema } from "../../../../src/lib/store/conflict.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const directories: string[] = [];
afterEach(async () => { binding.store = null; await removeGitBackedDirs(directories.splice(0)); });

async function command(checkout: string, args: readonly string[]) {
  const cwd = process.cwd(), exit = process.exitCode;
  const events: { stream: "stdout" | "stderr"; text: string }[] = [];
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { events.push({ stream: "stdout", text: String(chunk) }); return true; });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { events.push({ stream: "stderr", text: String(chunk) }); return true; });
  try {
    process.chdir(checkout); process.exitCode = undefined;
    await dispatchRegisteredCli([...args, "--json"]);
    const json: unknown = JSON.parse(events.filter(event => event.stream === "stdout").map(event => event.text).join(""));
    return { json, events, exitCode: process.exitCode ?? 0 };
  } finally { stdout.mockRestore(); stderr.mockRestore(); process.chdir(cwd); process.exitCode = exit; }
}

async function fixture() {
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const source = createReferenceFixture({}, { "work-item/meta": { parser: META_REGISTRATION.parser },
    "work-item/task-list": registry["work-item/task-list"] });
  source.identity("andrew");
  const document = await seed(source, RecordReferenceSchema.parse({ kind: "personal/document",
    owner: { type: "person", name: "andrew" }, key: "scratch/round-trip.md" }), "opening\nbase\nclosing\n");
  await seed(source, source.reference("work-item/meta"), makeMetaFixture("work-item-one", {
    owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop", design: ["spec-work-item-one.md"],
  }));
  const tasks = await seed(source, source.reference("work-item/task-list"), TASK_RULE_CONTENT);
  const documentPath = ".arc/user/andrew/scratch/round-trip.md";
  const tasksPath = ".arc/active/in-flight/work-item-one/tasks-work-item-one.md";
  const projected = await seedProjection({ store: source.store, files: [
    { reference: document.reference, path: documentPath }, { reference: tasks.reference, path: tasksPath },
  ] });
  directories.push(projected.checkout);
  await configureEngineCheckout(projected.checkout);
  binding.store = source.store;
  const file = (path: string) => readFile(join(projected.checkout, path), "utf8");
  const edit = async (path: string, content: string) => {
    const stamp = parseStampedFile(await file(path)).stamp;
    if (stamp === null) throw new Error("The projected file lost its stamp");
    const text = renderStampedFile({ content, stamp });
    await writeFile(join(projected.checkout, path), text);
    return text;
  };
  return { ...source, ...projected, document, tasks, documentPath, tasksPath, file, edit };
}

it("persists a hand edit, draws a stale stored conflict, resolves it, and preserves a refused edit until repair", async () => {
  const h = await fixture();
  await h.edit(h.documentPath, "opening\nfirst edit\nclosing\n");
  expect((await command(h.checkout, ["status"])).exitCode).toBe(0);
  const first = success(await h.store.read({ reference: h.document.reference }));
  expect(first.content).toBe("opening\nfirst edit\nclosing\n");
  expect(success(await h.store.history({ reference: first.reference }))[0]?.provenance).toMatchObject({ verb: "write-back" });

  success(await h.store.write({ action: "put", reference: first.reference, expected: first.version,
    content: "opening\nstored edit\nclosing\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
  await h.edit(h.documentPath, "opening\nstale incoming edit\nclosing\n");
  const saved = await command(h.checkout, ["save"]);
  expect(saved.json).toMatchObject({ status: "ok", result: { version: success(await h.store.version()) } });
  const clashed = success(await h.store.read({ reference: first.reference }));
  expect(clashed.conflicts).toHaveLength(1);
  const conflict = clashed.conflicts[0];
  if (conflict === undefined) throw new Error("The stale write produced no conflict");
  const record = success(await h.store.read({ reference: conflict }));
  expect(ConflictRecordSchema.parse(JSON.parse(record.content)).record).toEqual(first.reference);
  const drawing = await h.file(h.documentPath);
  expect(drawing).toContain("<<<<<<<");
  expect(drawing).toContain("stored edit");
  expect(drawing).toContain("stale incoming edit");

  await h.edit(h.documentPath, "opening\nchosen resolution\nclosing\n");
  expect((await command(h.checkout, ["save"])).json).toMatchObject({ status: "ok" });
  const resolved = success(await h.store.read({ reference: first.reference }));
  expect(resolved.content).toBe("opening\nchosen resolution\nclosing\n");
  expect(resolved.conflicts).toEqual([]);
  expect(success(await h.store.history({ reference: conflict }))[0]).toMatchObject({ content: null, provenance: { verb: "save" } });
  expect(parseStampedFile(await h.file(h.documentPath)).content).toBe(resolved.content);

  const refusedBytes = await h.edit(h.tasksPath, TASK_RULE_CONTENT.replace("`[ ]`", "`[x]`"));
  const refused = await command(h.checkout, ["status"]);
  expect(refused.exitCode).toBe(0);
  expect(await h.file(h.tasksPath)).toBe(refusedBytes);
  expect(success(await h.store.read({ reference: h.tasks.reference })).content).toBe(TASK_RULE_CONTENT);
  const refusalAt = refused.events.findIndex(event => event.stream === "stderr" && event.text.includes("task-list.close"));
  const outputAt = refused.events.findIndex(event => event.stream === "stdout");
  expect(refusalAt).toBeGreaterThanOrEqual(0);
  expect(outputAt).toBeGreaterThan(refusalAt);
  expect(refused.json).toMatchObject({ mode: "full", projection: { ok: true, value: { kind: "ready", files: expect.arrayContaining([
    expect.objectContaining({ path: h.tasksPath, refused: expect.objectContaining({ reason: expect.stringContaining("task-list.close") }) }),
  ]) } } });

  const repaired = `${TASK_RULE_CONTENT}\nIndependent note.\n`;
  await h.edit(h.tasksPath, repaired);
  expect((await command(h.checkout, ["save"])).json).toMatchObject({ status: "ok", result: { version: success(await h.store.version()) } });
  expect(success(await h.store.read({ reference: h.tasks.reference })).content).toBe(repaired);
});
