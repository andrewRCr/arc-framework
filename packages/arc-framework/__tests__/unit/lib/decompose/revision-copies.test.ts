/** New revision members obey the same companion-copy boundary as additive scaffolds. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordReferences, sameReference } from "../../../../src/lib/store/identity.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { runStoreDecomposeRevisionStarter } from "../../../../src/lib/decompose/revision-starter.js";
import { DecomposeRevisionStarterReportSchema } from "../../../../src/lib/decompose/revision-starter-report.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";

const taskText = "# Tasks origin\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Work**\n\n- _Goal:_ Keep work bounded.\n";

async function revisionMap(h: Awaited<ReturnType<typeof createDecomposeTerminalFixture>>, role: "tasks" | "notes", targetRole = role): Promise<CutMap> {
  const raw = await runStoreDecomposeRevisionStarter(h.ctx, "origin");
  expect(raw.status).toBe("ok");
  if (raw.status === "refused") throw new Error(JSON.stringify(raw));
  const report = DecomposeRevisionStarterReportSchema.parse(JSON.parse(raw.result));
  const map = completeCutMapFixture(report.status === "carried" ? report.map.machine : report.starter.machine);
  map.authoring.destinations.push({ kind: "new-member", destinationId: "z-added", slug: "added", workClass: "Light" });
  for (const allocation of map.authoring.sourceAllocations) {
    const source = map.machine.sourceUnits.find(unit => unit.sourceId === allocation.sourceId);
    if (source?.sourceLocator.artifact === `${role}-origin.md` && allocation.disposition.kind === "target") {
      allocation.disposition.destinationId = "z-added";
      allocation.disposition.targetLocator.artifact = `${targetRole}-added.md`;
    }
  }
  return map;
}

async function apply(h: Awaited<ReturnType<typeof createDecomposeTerminalFixture>>, map: CutMap) {
  const preview = await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" });
  expect(preview.status).toBe("ok");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
}

it.each(["tasks", "notes"] as const)("refuses an untitled %s copy on an added member and admits its repaired source", async role => {
  const h = await createDecomposeTerminalFixture();
  const text = role === "tasks" ? taskText : "# Notes origin\n\n## Scope\n\nNotes to copy.\n";
  const reference = role === "tasks" ? recordReferences["work-item/task-list"](h.primary.reference.owner) : recordReferences["work-item/notes"](h.primary.reference.owner);
  const source = await h.seed(reference, text.slice(text.indexOf("\n") + 1));
  const map = await revisionMap(h, role);
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }))
    .toMatchObject({ status: "refused", reason: "scaffold-title-missing", locus: `${role}-origin.md` });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await h.handEdit(source, text);
  await apply(h, await revisionMap(h, role));
  const added = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("added") }));
  expect(lifecycleSuccess(await h.store.read({ reference: role === "tasks" ? recordReferences["work-item/task-list"](added.reference.owner)
    : recordReferences["work-item/notes"](added.reference.owner) })).content).toBe(text.replace("origin", "added"));
});

it("refuses copying completed tasks onto an added member and admits targeting notes", async () => {
  const h = await createDecomposeTerminalFixture();
  await h.seed(recordReferences["work-item/task-list"](h.primary.reference.owner), taskText.replace("`[ ]`", "`[x]`"));
  await h.seed(recordReferences["work-item/notes"](h.primary.reference.owner), "# Notes origin\n\n## Notes\n\nKeep notes.\n");
  const map = await revisionMap(h, "tasks");
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }))
    .toMatchObject({ status: "refused", reason: "completed-task", locus: "tasks-origin.md", message: expect.stringContaining("1.1") });
  await apply(h, await revisionMap(h, "tasks", "notes"));
});

it.each(["descriptor", "segmentation"] as const)("names a legacy task copy's %s diagnostic and admits its repaired source", async rule => {
  const h = await createDecomposeTerminalFixture();
  const source = await h.seed(recordReferences["work-item/task-list"](h.primary.reference.owner), taskText);
  const invalid = rule === "descriptor" ? taskText.replace("- _Goal:_ Keep work bounded.",
    "- _Goal:_ Keep work bounded across\n  a wrapped line.\n- _Context:_ Preserve context.")
    : taskText.replace("## **Phase 1:** Work", "## **Phase 1:** Work\n\n_Mode:_ `layer`");
  // A legacy source can predate the creation checks enforced on its new copy.
  for (const record of h.store.state.records.values()) if (sameReference(record.reference, source.reference)) record.content = invalid;
  const map = await revisionMap(h, "tasks");
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }))
    .toMatchObject({ status: "refused", reason: "scaffold-task-list", locus: "tasks-origin.md", message: expect.stringContaining(`task-list.${rule}`) });
  await h.handEdit(source, taskText);
  await apply(h, await revisionMap(h, "tasks"));
});
