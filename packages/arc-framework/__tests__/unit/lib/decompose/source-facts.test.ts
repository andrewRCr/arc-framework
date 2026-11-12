/** Source derivation follows lifecycle state and the authored Design pointers. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { decomposeContext } from "../../../fixtures/decompose-context.js";
import { acquireDecomposeOrigin } from "../../../../src/lib/decompose/acquire-origin.js";
import { deriveDecomposeSource } from "../../../../src/lib/decompose/source-facts.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { writeMetaPause, writeMetaDesign } from "../../../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { cutSourceId } from "../../../../src/lib/decompose/cut-map-machine.js";
import { digestBytes } from "../../../../src/lib/kernel/canonical/canonical-json.js";

async function source(kind: "backlog-stub" | "started-planning" | "active-origin", paused = false) {
  const h = createDecomposeHarness();
  const primary = await h.seedMeta("origin", { state: kind === "active-origin" ? "Active" : "Planning",
    currentWorkflow: kind === "backlog-stub" ? null : kind === "started-planning" ? "draft-design" : "process-task-loop",
    design: ["draft-origin.md"] }, kind === "backlog-stub"
    ? { kind: "backlog", commitment: "planned" } : { kind: "active" });
  const draft = await h.seed(recordReferences["work-item/draft"](primary.reference.owner), "# Draft\n\n## Scope\n\nOwned work.\n");
  if (paused) lifecycleSuccess(await h.store.write({ ...recordPut(primary, { content: writeMetaPause(primary.content,
    { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Waiting.", waitsOn: null,
      resumeNotes: null, open: false }) }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const acquired = await acquireDecomposeOrigin(decomposeContext(h.store), "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  return { ...h, primary, draft, acquired: acquired.result };
}

it.each(["backlog-stub", "started-planning", "active-origin"] as const)("derives %s from records without Git pins", async (sourceKind) => {
  const h = await source(sourceKind);
  const result = deriveDecomposeSource(h.acquired);
  expect(result).toMatchObject({ status: "ok", result: { sourceKind, origin: { slug: "origin" },
    planningProfile: { kind: "draft", sourceDesign: ["draft-origin.md"] } } });
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.sourceUnits.map(unit => unit.sourceLocator)).toEqual([
    expect.objectContaining({ artifact: "draft-origin.md" }), expect.objectContaining({ artifact: "draft-origin.md" }),
  ]);
  expect(Object.keys(result.result).sort()).toEqual(["origin", "planningProfile", "sourceKind", "sourceUnits"]);
});

it.each(["backlog-stub", "started-planning", "active-origin"] as const)("allows a paused %s", async (sourceKind) => {
  const h = await source(sourceKind, true);
  expect(deriveDecomposeSource(h.acquired)).toMatchObject({ status: "ok", result: { sourceKind } });
});

it("scans only an Active origin's design artifacts, leaving its task list and notes outside the cut", async () => {
  const h = await source("active-origin");
  await h.seed(recordReferences["work-item/task-list"](h.primary.reference.owner), "# Task List: origin\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Build**\n");
  await h.seed(recordReferences["work-item/notes"](h.primary.reference.owner), "# Notes\n\n## Detail\n\nRetained notes.\n");
  const acquired = await acquireDecomposeOrigin(decomposeContext(h.store), "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  const result = deriveDecomposeSource(acquired.result);
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect([...new Set(result.result.sourceUnits.map(unit => unit.sourceLocator.artifact))]).toEqual(["draft-origin.md"]);
});

it.each(["draft", "single-spec", "paired-spec"] as const)("keeps the %s profile when unrelated artifacts are present", async (kind) => {
  const h = createDecomposeHarness();
  const sourceDesign = kind === "draft" ? ["draft-origin.md"] : kind === "single-spec" ? ["spec-origin.md"]
    : ["spec-origin-prd.md", "spec-origin-rfc.md"];
  const primary = await h.seedMeta("origin", { state: "Planning", currentWorkflow: null,
    design: kind === "paired-spec" ? ["draft-origin.md"] : sourceDesign },
    { kind: "backlog", commitment: "planned" });
  if (kind === "paired-spec") {
    for (const key of ["spec-prd", "spec-rfc"]) await h.seed(recordReferences["work-item/companion"](primary.reference.owner, key), "# Paired spec\n\nDesign.\n");
    lifecycleSuccess(await h.store.write({ ...recordPut(primary, { content: writeMetaDesign(primary.content, sourceDesign) }),
      provenance: { verb: "repoint-design", lifecycleAction: "spec-finalized" } }));
  } else await h.seed(recordReferences[kind === "draft" ? "work-item/draft" : "work-item/spec"](primary.reference.owner), "# Design\n\nOwned work.\n");
  await h.seed(recordReferences[kind === "draft" ? "work-item/spec" : "work-item/draft"](primary.reference.owner), "# Incidental artifact\n\nNot the selected profile.\n");
  const acquired = await acquireDecomposeOrigin(decomposeContext(h.store), "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  expect(deriveDecomposeSource(acquired.result)).toMatchObject({ status: "ok", result: { planningProfile: { kind, sourceDesign } } });
});

it("scans every planning artifact role into content-bound version-four units", async () => {
  const h = await source("started-planning");
  const owner = h.primary.reference.owner;
  await h.seed(recordReferences["work-item/spec"](owner), "# Extra spec\n\n## Detail\n\nSpec work.\n");
  await h.seed(recordReferences["work-item/task-list"](owner), "# Task List: origin\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Build**\n");
  await h.seed(recordReferences["work-item/notes"](owner), "# Notes\n\nNotes work.\n");
  await h.seed(recordReferences["work-item/companion"](owner, "context"), "# Context\n\nCompanion work.\n");
  const acquired = await acquireDecomposeOrigin(decomposeContext(h.store), "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  const result = deriveDecomposeSource(acquired.result);
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect([...new Set(result.result.sourceUnits.map(unit => unit.sourceLocator.artifact))].sort())
    .toEqual(acquired.result.artifacts.map(artifact => artifact.basename).sort());
  const sourceLocator = { artifact: "draft-origin.md", kind: "preamble" as const };
  expect(result.result.sourceUnits).toContainEqual({ sourceLocator, sourceId: cutSourceId({ sourceLocator }),
    contentDigest: digestBytes(new TextEncoder().encode("# Draft\n\n")) });
  const ids = result.result.sourceUnits.map(unit => unit.sourceId);
  expect(ids).toEqual([...ids].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))));
});
