/** Complete surviving-origin cuts over the checked store with a closed Git boundary. */
import { expect, it } from "vitest";
import { createDecomposeExtractionFixture } from "../../../fixtures/decompose-extraction.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";
import { readWorkUnit, readLifecycleMetaFields } from "../../../../src/lib/store/lifecycle-write.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { sortByCanonicalBytes } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";

const scenarios: { name: string; active: boolean; placement: CutMap["authoring"]["placement"] }[] = [
  { name: "Planning/direct-member", active: false, placement: { kind: "direct-member" } },
  { name: "Planning/cohort", active: false, placement: { kind: "cohort", cohort: "group", purpose: "Coordinate work." } },
  { name: "Planning/subcohort", active: false, placement: { kind: "subcohort", cohort: "group/child", purpose: "Coordinate work.", parentPurpose: "Coordinate related work." } },
  { name: "Planning/at-cap", active: false, placement: { kind: "at-cap", parent: "group/child" } },
  { name: "Active/cohort", active: true, placement: { kind: "cohort", cohort: "group", purpose: "Coordinate work." } },
];

it.each(scenarios)("finishes an authored extraction end to end from $name", async ({ placement, active }) => {
  const h = await createDecomposeExtractionFixture(placement, active);
  const before = lifecycleSuccess(await h.store.version());
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview" || preview.result.mode !== "extraction-finish") {
    throw new Error(JSON.stringify(preview));
  }
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(preview.result.artifacts).toEqual([
    { basename: "spec-origin-prd.md", reference: h.prd.reference, retainedContent: "# Origin PRD\n\n## Keep\n\nSurviving scope.\n\n" },
    { basename: "spec-origin-rfc.md", reference: h.rfc.reference, retainedContent: null },
  ]);
  const applied = await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority });
  expect(applied).toMatchObject({ status: "ok", result: { kind: "applied", members: [{ name: "member-a" }], notices: [] } });
  if (applied.status === "refused" || applied.result.kind !== "applied") throw new Error(JSON.stringify(applied));
  expect(applied.result.continuation).toBeUndefined();
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(sortByCanonicalBytes(changes.map(change => ({ reference: change.reference, content: change.content }))))
    .toEqual(sortByCanonicalBytes(preview.result.writes.map(write => ({ reference: write.reference, content: write.action === "put" ? write.content : null }))));
  for (const change of changes) expect(change.provenance).toMatchObject({ verb: "decompose", lifecycleAction: "terminal", batchId: expect.any(String) });
  expect(new Set(changes.map(change => "verb" in change.provenance ? change.provenance.batchId : undefined)).size).toBe(1);
  const origin = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  expect(origin.reference).toEqual(h.primary.reference);
  expect(origin.placement).toEqual(h.primary.placement);
  expect(lifecycleSuccess(readLifecycleMetaFields(origin))).toMatchObject({ state: active ? "Active" : "Planning",
    cohort: placement.kind === "direct-member" ? "previous" : placement.kind === "at-cap" ? placement.parent : placement.cohort });
  expect(lifecycleSuccess(await h.store.read({ reference: h.prd.reference })).content).toBe(preview.result.artifacts[0]?.retainedContent);
  for (const reference of [h.rfc.reference, h.additive.storedMap]) {
    expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }
  for (const record of [h.member, h.tasks, h.notes]) expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
  for (const [slug, dependsOn] of [["consumer", ["member-a"]], ["home", ["member-a", "provider"]]] as const) {
    expect(lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await readWorkUnit(h.store, slug)))).dependsOn).toEqual(dependsOn);
  }
  expect(await h.store.lookup({ kind: "lineage", origin: "origin" })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  if (placement.kind === "at-cap") {
    const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "child" }));
    expect(lifecycleSuccess(await h.store.read({ reference })).content).toContain("- `member-a`");
  }
  const landedAt = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeFinish(h.ctx, "origin")).toMatchObject({ status: "ok", result: {
    kind: "landed", mode: "extraction-finish", origin: h.map.machine.origin, members: [{ name: "member-a" }],
  } });
  expect(lifecycleSuccess(await h.store.version())).toBe(landedAt);
});
