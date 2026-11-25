/** Record-backed extraction retains exact current source-unit bytes. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { planDecomposeSourceThinning } from "../../../../src/lib/decompose/thinning.js";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { decomposeContext } from "../../../fixtures/decompose-context.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { decodeCutMap } from "../../../../src/lib/decompose/cut-map-decode.js";
import { writeMetaDesign } from "../../../../src/lib/store/kinds/meta/writers.js";

it("preserves kept BOM, CRLF, Unicode, trailing whitespace, and repeated-heading bytes exactly", async () => {
  const h = await createDecomposeOriginFixture(true);
  const content = "\uFEFF# Origin\r\n\r\n## Shared\r\nMove this.\r\n\r\n## Transfer\r\nDrop this.\r\n\r\n## Shared\r\nKeep 😀  \r\n";
  const draft = await h.handEdit(h.draft, content);
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine, true);
  for (const [index, unit] of map.machine.sourceUnits.entries()) {
    const allocation = map.authoring.sourceAllocations[index];
    if (allocation === undefined) throw new Error("Missing allocation.");
    const locator = unit.sourceLocator;
    if (locator.kind === "preamble" || (locator.kind === "section" && locator.headingSource === "Shared" && locator.occurrence === 1)) {
      allocation.disposition = { kind: "retained-origin" };
    } else if (locator.kind === "section" && locator.headingSource === "Transfer") allocation.disposition = { kind: "drop", reason: "Superseded." };
  }
  const retainedContent = "\uFEFF# Origin\r\n\r\n## Shared\r\nKeep 😀  \r\n";
  expect(planDecomposeSourceThinning(map, fresh.result.acquired.artifacts)).toEqual({ status: "ok", result: {
    artifacts: [{ basename: "draft-origin.md", record: draft, retainedContent }],
    writes: [{ action: "put", reference: draft.reference, expected: draft.version, content: retainedContent }],
  } });
});

it("removes the design record keeping no units and leaves a fully retained record unwritten", async () => {
  const h = createDecomposeHarness();
  const primary = await h.seedMeta("origin", { state: "Planning", currentWorkflow: "generate-tasks", design: ["spec-origin.md"] });
  const prd = await h.seed(recordReferences["work-item/companion"](primary.reference.owner, "spec-prd"), "# PRD\n\n## Keep\n\nStay.\n");
  const rfc = await h.seed(recordReferences["work-item/companion"](primary.reference.owner, "spec-rfc"), "# RFC\n\n## Transfer\n\nMove.\n");
  await h.handEdit(primary, writeMetaDesign(primary.content, ["spec-origin-prd.md", "spec-origin-rfc.md"]));
  const notes = await h.seed(recordReferences["work-item/notes"](primary.reference.owner), "# Notes\n\nRemain untouched.\n");
  const fresh = await prepareDecomposePreflight(decomposeContext(h.store), "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine, true);
  for (const [index, unit] of map.machine.sourceUnits.entries()) {
    const allocation = map.authoring.sourceAllocations[index];
    if (allocation === undefined) throw new Error("Missing allocation.");
    allocation.disposition = unit.sourceLocator.artifact === "spec-origin-rfc.md"
      ? { kind: "target", destinationId: "member-a", targetLocator: { ...unit.sourceLocator, artifact: "spec-member-a-rfc.md" } }
      : { kind: "retained-origin" };
  }
  expect(decodeCutMap(map).status).toBe("accepted");
  expect(planDecomposeSourceThinning(map, fresh.result.acquired.artifacts)).toEqual({ status: "ok", result: {
    artifacts: [{ basename: "spec-origin-prd.md", record: prd, retainedContent: prd.content },
      { basename: "spec-origin-rfc.md", record: rfc, retainedContent: null }],
    writes: [{ action: "remove", reference: rfc.reference, expected: rfc.version }],
  } });
  expect(fresh.result.acquired.artifacts.some(artifact => artifact.record.reference.kind === notes.reference.kind)).toBe(true);
});

it("resolves allocations by locator against the acquired current record rather than saved source bytes", async () => {
  const h = await createDecomposeOriginFixture(true);
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine, true);
  const allocation = map.authoring.sourceAllocations.find(entry => map.machine.sourceUnits.some(unit =>
    unit.sourceId === entry.sourceId && unit.sourceLocator.kind === "section"));
  if (allocation === undefined) throw new Error("Missing section allocation.");
  allocation.disposition = { kind: "retained-origin" };
  const current = await h.handEdit(h.draft, "# Origin\n\n## Scope\n\nCurrent 😀 bytes.  \n");
  const result = planDecomposeSourceThinning(map, [{ basename: "draft-origin.md", record: current }]);
  expect(result).toMatchObject({ status: "ok", result: { artifacts: [{ retainedContent: "## Scope\n\nCurrent 😀 bytes.  \n" }],
    writes: [{ expected: current.version, content: "## Scope\n\nCurrent 😀 bytes.  \n" }] } });
});
