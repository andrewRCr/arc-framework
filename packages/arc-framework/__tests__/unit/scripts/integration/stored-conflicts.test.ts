/** Native lifecycle readers refuse a conflicted record, naming its conflicts, and proceed once they are resolved. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { RecordReferenceSchema, recordReferences, type RecordReference } from "../../../../src/lib/store/identity.js";
type RecordKind = RecordReference["kind"];
import { readStoredLifecycleSummary } from "../../../../src/scripts/integration/lifecycle-record.js";
import { writeWorkUnitLandingCommit } from "../../../../src/scripts/integration/landing-link.js";
import { exportWorkUnitSpec } from "../../../../src/lib/work-unit/design-export.js";
import { StoreRefusalError } from "../../../../src/lib/store/refusal-error.js";

async function conflicted(kind: RecordKind) {
  const h = createReviewHarness();
  const primary = await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const read = h.store.read.bind(h.store);
  const state = { conflicted: true, conflict: undefined as RecordReference | undefined };
  h.store.read = async input => {
    const result = await read(input);
    if (!state.conflicted || result.status !== "ok" || input.reference.kind !== kind) return result;
    // The ref backend names an open conflict as its family's conflict record, keyed by the captured conflict.
    state.conflict = RecordReferenceSchema.parse({ owner: result.result.reference.owner,
      kind: `${result.result.reference.kind.split("/")[0]}/conflict-record`, key: "conflict-1" });
    return { status: "ok", result: { ...result.result, conflicts: [state.conflict] } };
  };
  return { ...h, primary, state };
}

it("reports a conflicted meta as an incomplete lifecycle and binds its version once resolved", async () => {
  const h = await conflicted("work-item/meta");
  const input = { store: h.store, workUnit: "example", archiveCadence: "manual" as const, storageVersion: "v1" };
  const refused = await readStoredLifecycleSummary(input);
  expect(refused).toMatchObject({ recordVersion: null, summary: { complete: false,
    artifactFacts: [{ message: expect.stringContaining(JSON.stringify(h.state.conflict)) }] } });
  expect(refused.summary.artifactFacts[0]?.message).toContain("Resolve the named conflict records");
  h.state.conflicted = false;
  const resolved = await readStoredLifecycleSummary(input);
  expect(resolved.recordVersion).toBe(h.primary.version);
  expect(resolved.summary.state).not.toBe("nonexistent");
  expect(JSON.stringify(resolved.summary.artifactFacts)).not.toContain("conflict");
});

it("refuses a landing link over a conflicted meta and writes it once resolved", async () => {
  const h = await conflicted("work-item/meta"), before = lifecycleSuccess(await h.store.version());
  const write = () => writeWorkUnitLandingCommit({ store: h.store, projectId: async () => "project", workUnit: "example",
    sha: "a".repeat(40) });
  await expect(write()).rejects.toThrow("Resolve the named conflict records");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  h.state.conflicted = false;
  await write();
  expect(lifecycleSuccess(await h.store.read({ reference: h.primary.reference })).links?.landingCommit)
    .toMatchObject({ sha: "a".repeat(40) });
});

it("exports no side of a conflicted spec and exports it once resolved", async () => {
  const h = await conflicted("work-item/spec");
  await h.seed(recordReferences["work-item/spec"](h.primary.reference.owner), "# Stored design\n");
  const cwd = await mkdtemp(join(tmpdir(), "arc-design-conflict-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const exported = () => exportWorkUnitSpec({ cwd, workUnit: "example", store: h.store, owner: h.primary.reference.owner,
    trackDesignDocs: "specs", exec: async () => ({ stdout: "" }) });
  const error = await exported().then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(StoreRefusalError);
  expect((error as StoreRefusalError).refusal).toMatchObject({ code: "record-malformed",
    condition: expect.stringContaining(JSON.stringify(h.state.conflict)) });
  await expect(readFile(join(cwd, ".arc/specs/example/spec-example.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  h.state.conflicted = false;
  expect(await exported()).toMatchObject({ path: ".arc/specs/example/spec-example.md" });
});
