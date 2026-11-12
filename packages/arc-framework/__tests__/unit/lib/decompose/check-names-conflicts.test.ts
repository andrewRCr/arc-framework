/** Selected cohort decisions require resolution without blocking unrelated cohorts. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { fileDecomposeConflict, resolveDecomposeConflict } from "../../../fixtures/decompose-conflict.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { writeMetaCohort } from "../../../../src/lib/store/kinds/meta/writers.js";
import { readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { withCompetingBatch } from "../../../helpers/store/decompose-harness.js";
import type { DecomposeResult } from "../../../../src/lib/decompose/refusal.js";

function decomposeSuccess<T>(result: DecomposeResult<T>): T {
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  return result.result;
}

const placements = [
  { kind: "cohort", conflictName: "group" },
  { kind: "subcohort", conflictName: "group" },
  { kind: "subcohort", conflictName: "child" },
  { kind: "at-cap", conflictName: "group" },
  { kind: "at-cap", conflictName: "child" },
] as const;

async function fixture(kind: "cohort" | "subcohort" | "at-cap") {
  const h = await createDecomposeOriginFixture();
  const group = await h.seedCohort("group"), child = await h.seedCohort("group/child");
  if (kind === "at-cap") await h.handEdit(h.primary, writeMetaCohort(h.primary.content, "group/child"));
  const fresh = decomposeSuccess(await prepareDecomposePreflight(h.ctx, "origin"));
  const map = completeCutMapFixture(fresh.machine);
  map.authoring.placement = kind === "cohort" ? { kind, cohort: "group" }
    : kind === "subcohort" ? { kind, cohort: "group/child" } : { kind, parent: "group/child" };
  return { ...h, group, child, map };
}

it.each(placements.flatMap(placement => (["additive", "revision"] as const).map(mode => ({ ...placement, mode }))))(
  "refuses disputed $conflictName in selected $kind decisions during $mode and completes after resolution", async ({ kind, conflictName, mode }) => {
    const h = await fixture(kind);
    const input = { cutMap: h.map, cutMapPath: "cut.json" };
    if (mode === "revision") decomposeSuccess(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", input));
    const selected = conflictName === "group" ? h.group : h.child;
    await fileDecomposeConflict(h.store, selected);
    const before = lifecycleSuccess(await h.store.version());
    const result = mode === "additive" ? await runStoreDecomposeAdditive(h.ctx, "origin", "execute", input)
      : await runStoreDecomposeRevision(h.ctx, "origin", input);
    expect(result).toMatchObject({ status: "refused", reason: "record-conflict", class: "recoverable",
      message: expect.stringContaining(`cohort/cohort/${conflictName}/abcdef12`),
      remedy: { text: expect.stringContaining("write-back") } });
    expect(lifecycleSuccess(await h.store.version())).toBe(before);
    await resolveDecomposeConflict(h.store, selected);
    if (mode === "additive") decomposeSuccess(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", input));
    else {
      const preview = decomposeSuccess(await runStoreDecomposeRevision(h.ctx, "origin", input));
      if (preview.kind !== "preview") throw Error("Expected revision preview.");
      decomposeSuccess(await runStoreDecomposeRevision(h.ctx, "origin", input, { applyAuthority: preview.applyAuthority }));
    }
    expect((await readWorkUnit(h.store, "member-a")).status).toBe("ok");
    expect(lifecycleSuccess(await h.store.read({ reference: selected.reference })).conflicts).toEqual([]);
  });

it.each(placements)("binds selected $kind $conflictName conflicts at additive publication and completes after resolution", async ({ kind, conflictName }) => {
  const h = await fixture(kind);
  const selected = conflictName === "group" ? h.group : h.child;
  let competing: unknown;
  h.ctx.executor.store = withCompetingBatch(h.store, async () => {
    await fileDecomposeConflict(h.store, selected);
    competing = lifecycleSuccess(await h.store.version());
  });
  const input = { cutMap: h.map, cutMapPath: "cut.json" };
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", input)).toMatchObject({ status: "refused" });
  expect(lifecycleSuccess(await h.store.version())).toBe(competing);
  expect(await readWorkUnit(h.store, "member-a")).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  await resolveDecomposeConflict(h.store, selected);
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", input)).toMatchObject({ status: "ok" });
});

it("preserves an unrelated cohort conflict while publishing a clean selected cohort", async () => {
  const h = await fixture("cohort");
  const unrelated = await h.seedCohort("unrelated");
  const conflict = await fileDecomposeConflict(h.store, unrelated);
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" }))
    .toMatchObject({ status: "ok" });
  expect(lifecycleSuccess(await h.store.read({ reference: unrelated.reference }))).toEqual(conflict.subject);
  expect(lifecycleSuccess(await h.store.read({ reference: conflict.conflict.reference }))).toEqual(conflict.conflict);
});
