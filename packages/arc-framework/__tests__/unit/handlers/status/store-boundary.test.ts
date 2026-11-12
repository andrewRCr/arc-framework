/** Native named status renders its stored boundary without checkout currentness. */
import { afterEach, expect, it, vi } from "vitest";
import { handleLifecycleStatus } from "../../../../src/handlers/status/lifecycle.js";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { createTestStatusContext } from "../../../helpers/status-context.js";
import { boundaryV2Fixture } from "../../../fixtures/review-boundary.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { PublishedIntegrationBoundaryLocusSchema, ContinuePrePublicationActionSchema } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";
import { recordReferences, type Store } from "../../../../src/lib/store/index.js";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });

async function fixture(state: "Active" | "Integrating" | "Planning" = "Integrating") {
  const h = createReviewHarness();
  const meta = await h.seedMeta("example", { state, currentWorkflow: state === "Integrating"
    ? "integrate-work-unit" : state === "Active" ? "process-task-loop" : "draft-design" });
  const boundary = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture(state === "Integrating"
    ? "publication-pending" : "candidate-fix-pending"),
    ...(state === "Integrating" ? { readinessBinding: canonicalDigest({ readiness: 1 }) } : {}) });
  await h.seedBoundary(meta.reference.owner, boundary);
  const context = await createTestStatusContext({ store: h.store });
  let output = "";
  vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const run = async (json: boolean, holder?: string) => {
    output = "";
    await handleLifecycleStatus(context, "example", { json }, {
      findHoldingCheckout: async () => holder === undefined ? { kind: "none" as const } : { kind: "held" as const, path: holder }, readInFlightWarnings: async () => [], readRoster: async () => [],
    });
    return output;
  };
  return { ...h, boundary, meta, run };
}

it("renders a native owner-selection refusal and reports the boundary after repair", async () => {
  const h = await fixture();
  const read = h.store.read.bind(h.store);
  h.store.read = async input => {
    const result = await read(input);
    return input.reference.kind !== "review/integration-boundary" || result.status !== "ok" ? result
      : { status: "ok", result: { ...result.result, content: JSON.stringify({ ...h.boundary, workUnit: "another" }) } };
  };
  expect(JSON.parse(await h.run(true))).toMatchObject({ status: "refused", refusal: {
    code: "invalid-input", condition: expect.stringContaining("another"),
    remedy: { text: "Name work unit `another`, or run the command from `example`'s checkout." } } });
  h.store.read = read;
  process.exitCode = undefined;
  expect(JSON.parse(await h.run(true))).toMatchObject({ state: "integrating", integrationBoundary: h.boundary });
});

it.each([undefined, "/elsewhere"])("reports native publication and its stored push with holder %s", async holder => {
  const h = await fixture();
  const result = JSON.parse(await h.run(true, holder)) as Record<string, unknown>;
  expect(result).toMatchObject({ state: "integrating", integrationBoundary: h.boundary });
  expect(result).toHaveProperty("integrationBoundary.nextAction.command", "git push origin feat/example");
  const boundary = PublishedIntegrationBoundaryLocusSchema.parse(result.integrationBoundary);
  expect(boundary.schemaVersion).toBe(2);
});

it("renders the version-two stored next-action command for human status", async () => {
  const h = await fixture();
  expect(await h.run(false)).toContain("next: git push origin feat/example");
});

it.each(["Active", "Planning"] as const)("restricts native boundary reporting for %s work", async state => {
  const h = await fixture(state);
  const result = JSON.parse(await h.run(true)) as Record<string, unknown>;
  expect(result.integrationBoundary).toEqual(state === "Active" ? h.boundary : null);
  if (state === "Active") {
    const boundary = PublishedIntegrationBoundaryLocusSchema.parse(result.integrationBoundary);
    expect(ContinuePrePublicationActionSchema.parse(boundary.nextAction)).toEqual(h.boundary.nextAction);
  }
});

it("renders a refused native boundary read through status's typed refusal, and reports it once repaired", async () => {
  const h = createReviewHarness();
  const meta = await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const boundary = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture("publication-pending"),
    readinessBinding: canonicalDigest({ readiness: 1 }) });
  await h.seedBoundary(meta.reference.owner, boundary);
  let held = true;
  // A ref read whose record objects are missing refuses in this shape, naming the record and no command.
  const refusal = { code: "state-unresolvable" as const, class: "recoverable" as const, historyRefs: [],
    reference: recordReferences["review/integration-boundary"](meta.reference.owner),
    condition: "The stored record's objects are missing.", remedy: { text: "Restore or fetch the missing record objects, then retry the read." } };
  const base = h.store;
  const store: Store = { capabilities: base.capabilities, list: input => base.list(input), write: input => base.write(input),
    batch: input => base.batch(input), version: () => base.version(), history: input => base.history(input),
    changes: input => base.changes(input), lookup: input => base.lookup(input), push: input => base.push(input),
    pull: input => base.pull(input), maintain: () => base.maintain(),
    read: async input => held && input.reference.kind === "review/integration-boundary"
      ? { status: "refused", refusal } : base.read(input) };
  const context = await createTestStatusContext({ store });
  let output = "";
  vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const run = async () => {
    output = "";
    await handleLifecycleStatus(context, "example", { json: true }, {
      findHoldingCheckout: async () => ({ kind: "none" as const }), readInFlightWarnings: async () => [], readRoster: async () => [] });
    return JSON.parse(output) as Record<string, unknown>;
  };
  expect(await run()).toEqual({ status: "refused", refusal });
  expect(process.exitCode).toBe(1);
  held = false;
  process.exitCode = undefined;
  expect(await run()).toMatchObject({ state: "integrating", integrationBoundary: boundary });
  expect(process.exitCode).toBeUndefined();
});
