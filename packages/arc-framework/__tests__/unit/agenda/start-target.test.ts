/** Start admission retains lifecycle quality and exact operational refusals. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAgendaStartTarget } from "../../../src/commands/agenda/start-target.js";
import { resolveLifecycleSubject } from "../../../src/lib/store/lifecycle-subject.js";
import { handleLifecycleStatus } from "../../../src/handlers/status/lifecycle.js";
import { createSignalAgendaFixture } from "../../helpers/agenda-signal-fixtures.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createTestStatusContext } from "../../helpers/status-context.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { renderMetaFile, writeMetaCohort } from "../../../src/lib/store/kinds/meta/writers.js";
import { createMemoryRemote } from "../../helpers/store/sync.js";
import { ReferenceBackend } from "../../helpers/store/reference-backend.js";

async function fixture() {
  const h = createLifecycleHarness();
  const { input } = await createSignalAgendaFixture();
  input.entry = await createTestStatusContext({ store: h.store, identity: "test-user", cwd: "/repo" });
  return { input, h };
}
afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });

describe("local Start target admission", () => {
  it.each(["nonexistent", "planning", "active", "integrating", "parked", "shipped"] as const)("withholds a %s target", async state => {
    const { input, h } = await fixture();
    if (state !== "nonexistent") await h.seedMeta("target", { state: state === "planning" ? "Planning" : state === "shipped" ? "Shipped" : state === "integrating" ? "Integrating" : "Active", currentWorkflow: state === "planning" ? "draft-design" : null },
      state === "shipped" ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }
        : state === "parked" ? { kind: "backlog", commitment: "planned" } : { kind: "active" });
    expect(await resolveAgendaStartTarget(input, "target")).toEqual({ kind: "unresolved", reason: `Target 'target' is ${state}.` });
  });

  it("reports an unreadable inventory's condition and resumes after repair", async () => {
    const { input, h } = await fixture();
    await h.seedMeta("target", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
    h.store.state.unreadable.add("work-item");
    const selection = await resolveLifecycleSubject({ ...input.entry, exec: input.entry.io.exec }, "target");
    expect(selection).toMatchObject({ status: "ok", result: { backend: "store", view: { listing: { status: "unreadable" } } } });
    if (selection.status !== "ok" || selection.result.backend !== "store" || selection.result.view.listing.status !== "unreadable") throw Error("Expected inventory fault");
    expect(await resolveAgendaStartTarget(input, "target")).toMatchObject({ kind: "unresolved", reason: expect.stringContaining(selection.result.view.listing.condition) });
    h.store.state.unreadable.clear();
    expect(await resolveAgendaStartTarget(input, "target")).toMatchObject({ kind: "resolved", slug: "target" });
  });

  it("keeps a healthy planned target usable beside unrelated malformed metadata", async () => {
    const { input, h } = await fixture();
    await h.seedMeta("target", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
    await h.seedMeta("broken");
    const broken = [...h.store.state.records.values()].find(record => record.reference.owner.name === "broken");
    if (broken === undefined) throw Error("Missing corruption basis");
    broken.content = "invalid metadata bytes";
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await handleLifecycleStatus(await createTestStatusContext({ store: h.store }), "target", { json: true }, {
      findHoldingCheckout: async () => ({ kind: "none" }), readInFlightWarnings: async () => [],
    });
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ state: "planned", warnings: [expect.stringContaining("broken")] });
    expect(await resolveAgendaStartTarget(input, "target")).toMatchObject({ kind: "resolved", slug: "target" });
  });

  it("names the selected target's rejected lifecycle projection", async () => {
    const { input, h } = await fixture();
    await h.seedMeta("target", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
    const raw = [...h.store.state.records.values()].find(record => record.reference.owner.name === "target");
    if (raw === undefined) throw Error("Missing corruption basis");
    raw.content = writeMetaCohort(raw.content, "Not-A-Slug");
    expect(await resolveAgendaStartTarget(input, "target")).toMatchObject({ kind: "unresolved", reason: expect.stringMatching(/^Meta target: Metadata could not be parsed:/u) });
  });

  it("preserves exact ambiguity rather than treating a refused name as missing", async () => {
    const { input, h } = await fixture();
    await h.seedMeta("target", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
    await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "target" })),
      "# Cohort: target\n\n**Purpose:** Group work.\n\n**Parent:** [none]\n");
    const lookup = await h.store.lookup({ kind: "slug", slug: OwnerIdentitySchema.parse({ type: "cohort", name: "target" }).name });
    expect(lookup).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match" } });
    if (lookup.status !== "refused") throw Error("Expected real ambiguous lookup");
    expect(await resolveAgendaStartTarget(input, "target")).toEqual({ kind: "refused", refusal: lookup.refusal });
  });

  it("retains the named-primary conflict refusal and resolves after the conflict is settled", async () => {
    const { input, h } = await fixture();
    const meta = await h.seedMeta("target", { state: "Planning", owner: "starter", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
    const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
    lifecycleSuccess(await h.store.push());
    const other = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
    for (const [store, owner] of [[h.store, "alice"], [other, "bob"]] as const) {
      const prior = lifecycleSuccess(await store.read({ reference: meta.reference }));
      lifecycleSuccess(await store.write({ action: "put", reference: prior.reference, expected: prior.version,
        content: renderMetaFile("target", { owner, state: "Planning", currentWorkflow: null }), placement: { kind: "backlog", commitment: "planned" },
        provenance: { verb: "test", lifecycleAction: "update" } }));
    }
    lifecycleSuccess(await h.store.push());
    const disputed = lifecycleSuccess(await h.store.read({ reference: meta.reference }));
    expect(disputed.conflicts.length).toBeGreaterThan(0);
    expect(await resolveAgendaStartTarget(input, "target")).toMatchObject({ kind: "refused", refusal: { code: "record-malformed", rule: "lifecycle.meta-conflict",
      condition: expect.stringContaining(JSON.stringify(disputed.conflicts[0])) } });
    lifecycleSuccess(await h.store.write({ action: "put", reference: disputed.reference, expected: disputed.version,
      content: disputed.content, placement: { kind: "backlog", commitment: "planned" }, resolves: disputed.conflicts,
      provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
    expect(await resolveAgendaStartTarget(input, "target")).toMatchObject({ kind: "resolved", slug: "target" });
  });
});
