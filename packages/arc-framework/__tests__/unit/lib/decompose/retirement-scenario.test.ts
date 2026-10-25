import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
/** Complete retirement cuts across source kinds and cohort placements. */
import { expect, it } from "vitest";
import { createDecomposeRetirementScenario } from "../../../fixtures/decompose-retirement-scenario.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { CutMapMachineSchema } from "../../../../src/lib/decompose/cut-map-machine.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";
import { readWorkUnit, readLifecycleMetaFields, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { runStoreTeardown } from "../../../../src/lib/work-unit/verbs/teardown-store.js";
import { sortByCanonicalBytes } from "../../../../src/lib/kernel/canonical/canonical-json.js";

it.each([[false, false], [false, true], [true, false], [true, true]] as const)("lands the complete cut and teardown, started=%s atCap=%s", async (started, atCap) => {
  const h = await createDecomposeRetirementScenario(started, atCap);
  const emitted = await runStoreDecomposePreflight(h.ctx, "demo");
  if (emitted.status === "refused") throw Error(JSON.stringify(emitted));
  const machine = CutMapMachineSchema.parse(JSON.parse(emitted.result).machine);
  expect(machine.sourceKind).toBe(started ? "started-planning" : "backlog-stub");
  const map = completeCutMapFixture(machine);
  map.authoring.shape = "heterogeneous";
  if (atCap) map.authoring.placement = { kind: "at-cap", parent: "group/child" };
  map.authoring.destinations.push({ kind: "existing-home", destinationId: "z-home", target: { kind: "work-unit", slug: "home" } });
  const first = map.authoring.sourceAllocations[0];
  if (first?.disposition.kind !== "target") throw Error("Expected allocated source.");
  first.disposition.destinationId = "z-home";
  first.disposition.targetLocator.artifact = "draft-home.md";
  for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["home"] };
  const additive = await runStoreDecomposeAdditive(h.ctx, "demo", "execute", { cutMap: map, cutMapPath: "cut.json" });
  expect(additive).toMatchObject({ status: "ok" });
  if (additive.status === "refused") throw Error(JSON.stringify(additive));
  expect(additive.result.members).toHaveLength(2);
  expect(additive.result.cohorts).toHaveLength(atCap ? 0 : 1);
  for (const write of additive.result.batch.writes) {
    const latest = lifecycleSuccess(await h.store.history({ reference: write.reference }))[0];
    if (latest === undefined || !("batchId" in latest.provenance)) throw Error("Expected additive batch provenance.");
    expect(latest.provenance.batchId).toBe(additive.result.batch.batchId);
  }
  for (const member of additive.result.members) {
    const fields = lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await h.store.read({ reference: member.primary }))));
    expect(fields.cohort).toBe(atCap ? "group/child" : "group");
    for (const copy of member.copies) expect((await h.store.read({ reference: copy.reference })).status).toBe("ok");
  }
  for (const cohort of additive.result.cohorts) expect(lifecycleSuccess(await h.store.read({ reference: cohort.reference })).content).toContain("Coordinate the work.");
  for (const name of ["member-a", "home"]) {
    const primary = lifecycleSuccess(await readWorkUnit(h.store, name));
    const draft = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](primary.reference.owner) }));
    lifecycleSuccess(await h.store.write({ ...recordPut(draft, { content: `${draft.content}\nAuthored destination detail.\n` }),
      provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  }
  const preview = await runStoreDecomposeFinish(h.ctx, "demo");
  expect(preview).toMatchObject({ status: "ok", result: { kind: "preview", lineage: { kind: "decompose", retiredBranches: [] } } });
  if (preview.status === "refused" || preview.result.kind !== "preview"
    || preview.result.mode !== "retirement-finish") throw Error(JSON.stringify(preview));
  const before = lifecycleSuccess(await h.store.version());
  const readMarker = h.teardown.readMarker;
  if (started) h.teardown.readMarker = async () => { throw Error("Injected marker observation failure."); };
  const applied = await runStoreDecomposeFinish(h.ctx, "demo", { applyAuthority: preview.result.applyAuthority });
  expect(applied).toMatchObject({ status: "ok", result: { kind: "applied" } });
  if (applied.status === "refused" || applied.result.kind !== "applied") throw Error(JSON.stringify(applied));
  if (started) expect(applied.result.continuation?.argv).toEqual(["arc", "teardown", boundWorkUnitSubject(h.meta).uid]);
  else expect(applied.result.continuation).toBeUndefined();
  h.teardown.readMarker = readMarker;
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(changes.every(change => "batchId" in change.provenance && change.provenance.batchId !== undefined)).toBe(true);
  expect(new Set(changes.map(change => "batchId" in change.provenance ? change.provenance.batchId : undefined)).size).toBe(1);
  expect(sortByCanonicalBytes(changes.map(change => ({ reference: change.reference, content: change.content }))))
    .toEqual(sortByCanonicalBytes(preview.result.writes.map(write => ({ reference: write.reference, content: write.action === "put" ? write.content : null }))));
  expect((await readWorkUnit(h.store, "demo")).status).toBe("refused");
  expect(await h.store.read({ reference: recordReferences["work-item/cut-map"](h.meta.reference.owner) }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const lineage = lifecycleSuccess(await h.store.read({ reference: recordReferences["lineage/transition"](h.meta.reference.owner) }));
  expect(lineage.fields).toEqual(preview.result.lineage);
  for (const [name, providers] of [["consumer", ["member-a"]], ["home", ["member-a", "provider"]]] as const) {
    const fields = lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await readWorkUnit(h.store, name))));
    expect(new Set(fields.dependsOn)).toEqual(new Set(providers));
  }
  if (atCap) {
    const written = preview.result.writes.find(write => write.action === "put" && write.reference.kind === "cohort/document");
    expect(written?.action === "put" ? written.content : "").toContain("<!-- arc:decompose-fanout:demo:start -->");
  }
  expect(await runStoreTeardown(h.teardown, { subject: { kind: "slug", slug: boundWorkUnitSubject(h.meta).uid }, base: "main" })).toMatchObject({ status: "torn-down" });
  expect(h.files.has(h.markerPath)).toBe(false);
  expect(h.files.get("/repo/local.txt")).toBe("Retained personal content.");
  expect(await runStoreDecomposeFinish(h.ctx, "demo")).toMatchObject({ status: "ok", result: { kind: "landed", members: [{ name: "member-a" }, { name: "member-b" }] } });
});
