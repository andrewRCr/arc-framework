/** Invalid source prerequisites refuse with a locus and become usable after repair. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { acquireDecomposeOrigin } from "../../../../src/lib/decompose/acquire-origin.js";
import { deriveDecomposeSource } from "../../../../src/lib/decompose/source-facts.js";
import { sameReference } from "../../../../src/lib/store/identity.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaState, writeMetaCurrentWorkflow, writeMetaDesign, writeMetaTaskList } from "../../../../src/lib/store/kinds/meta/writers.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";

async function source(h: Awaited<ReturnType<typeof createDecomposeOriginFixture>>) {
  const acquired = await acquireDecomposeOrigin(h.ctx, "origin");
  return acquired.status === "refused" ? acquired : deriveDecomposeSource(acquired.result);
}

it.each([
  ["Owner", "`test-user`"], ["Priority", "`P3`"], ["Origin", "[internal]"],
] as const)("refuses a legacy missing %s and proceeds after its owning repair", async (locus, value) => {
  const h = await createDecomposeOriginFixture();
  const raw = [...h.store.state.records.values()].find(record => sameReference(record.reference, h.primary.reference));
  if (raw === undefined) throw new Error("Expected origin metadata.");
  // Existing invalid state is an observation, rather than a newly admitted invalid write.
  raw.content = raw.content.replace(value, "[none]");
  const refusal = await source(h);
  expect(refusal).toMatchObject({ status: "refused", reason: "source-artifact", class: "recoverable", locus });
  if (locus === "Owner" && refusal.status === "refused") expect(refusal.remedy.text).toContain("arc handover origin --to");
  const current = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(current, { content: h.primary.content }),
    provenance: { verb: locus === "Owner" ? "handover" : "write-back", lifecycleAction: "repair" } }));
  expect(await source(h)).toMatchObject({ status: "ok" });
});

it("refuses a copied design without its first-line H1 and proceeds after write-back repair", async () => {
  const h = await createDecomposeOriginFixture();
  const bad = await h.handEdit(h.draft, "## Untitled design\n\nOwned work.\n");
  expect(await source(h)).toMatchObject({ status: "refused", reason: "source-artifact", class: "recoverable",
    locus: "draft-origin.md" });
  await h.handEdit(bad, h.draft.content);
  expect(await source(h)).toMatchObject({ status: "ok" });
});

it("refuses an Integrating origin with restoring commands and proceeds after reopening", async () => {
  const h = await createDecomposeOriginFixture();
  lifecycleSuccess(await h.store.write({ ...recordPut(h.primary, { placement: { kind: "active" },
    content: writeMetaCurrentWorkflow(writeMetaState(h.primary.content, "Integrating"), "integrate-work-unit") }),
    provenance: { verb: "publish", lifecycleAction: "integrate" } }));
  const refusal = await source(h);
  expect(refusal).toMatchObject({ status: "refused", reason: "origin-state", class: "recoverable" });
  if (refusal.status !== "refused") throw new Error("Expected an Integrating refusal.");
  expect(refusal.remedy.text).toContain("arc reopen origin");
  expect(refusal.remedy.text).toContain("arc deactivate origin");
  expect(refusal.remedy.text).toContain("arc decompose origin --discard");
  const current = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(current, {
    content: writeMetaCurrentWorkflow(writeMetaState(current.content, "Active"), "process-task-loop") }),
    provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
  expect(await source(h)).toMatchObject({ status: "ok" });
});

it("refuses an archived origin terminally without an executable repair", async () => {
  const h = await createDecomposeOriginFixture();
  lifecycleSuccess(await h.store.write({ ...recordPut(h.primary, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    content: writeMetaCurrentWorkflow(writeMetaState(h.primary.content, "Shipped"), null) }),
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  expect(await source(h)).toMatchObject({ status: "refused", reason: "origin-state", class: "terminal" });
});

it.each(["Design", "artifact", "Task List"] as const)("refuses an invalid %s and proceeds after its repair", async (failure) => {
  const h = await createDecomposeOriginFixture();
  if (failure === "artifact") {
    lifecycleSuccess(await h.store.write({ action: "remove", reference: h.draft.reference, expected: h.draft.version,
      provenance: { verb: "remove-artifact", lifecycleAction: "remove" } }));
  } else {
    const raw = [...h.store.state.records.values()].find(record => sameReference(record.reference, h.primary.reference));
    if (raw === undefined) throw new Error("Expected origin metadata.");
    raw.content = failure === "Design" ? writeMetaDesign(raw.content, ["spec-foreign.md"])
      : writeMetaTaskList(raw.content, "tasks-origin.md");
  }
  expect(await source(h)).toMatchObject({ status: "refused", reason: "planning-profile", class: "recoverable",
    locus: failure === "artifact" ? "draft-origin.md" : failure });
  if (failure === "artifact") await h.seed(recordReferences["work-item/draft"](h.primary.reference.owner), h.draft.content);
  else {
    const current = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
    await h.handEdit(current, h.primary.content);
  }
  expect(await source(h)).toMatchObject({ status: "ok" });
});

it("refuses a malformed source basename at the pure derivation boundary and accepts the repaired input", async () => {
  const h = await createDecomposeOriginFixture();
  const acquired = await acquireDecomposeOrigin(h.ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  const malformed = { ...acquired.result, artifacts: [...acquired.result.artifacts,
    { basename: "nested/notes.md", record: h.draft }] };
  expect(deriveDecomposeSource(malformed)).toMatchObject({ status: "refused", reason: "source-artifact",
    class: "recoverable", locus: "nested/notes.md" });
  expect(deriveDecomposeSource(acquired.result)).toMatchObject({ status: "ok" });
});
