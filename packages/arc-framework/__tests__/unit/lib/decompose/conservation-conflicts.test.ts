/** Finish refuses disputed destination decisions until their owner resolves the conflict. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { createDecomposeExtractionFixture } from "../../../fixtures/decompose-extraction.js";
import { fileDecomposeConflict, resolveDecomposeConflict } from "../../../fixtures/decompose-conflict.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";
import { readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";

it.each([
  [false, "member"], [false, "home"], [false, "cohort"],
  [true, "member"], [true, "home"], [true, "cohort"],
] as const)("refuses %s extraction finish with a conflicted %s decision, then completes after resolution", async (extraction, kind) => {
  const h = extraction ? await createDecomposeExtractionFixture(kind === "cohort" ? { kind: "at-cap", parent: "group/child" } : undefined)
    : await createDecomposeTerminalFixture({ withHome: kind === "home" });
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  const reference = kind === "cohort"
    ? recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: extraction ? "child" : "group" }))
    : kind === "home" ? recordReferences["work-item/draft"](lifecycleSuccess(await readWorkUnit(h.store, "home")).reference.owner)
      : extraction ? recordReferences["work-item/companion"](lifecycleSuccess(await readWorkUnit(h.store, "member-a")).reference.owner, "spec-rfc")
        : recordReferences["work-item/draft"](lifecycleSuccess(await readWorkUnit(h.store, "member-a")).reference.owner);
  let subject = lifecycleSuccess(await h.store.read({ reference }));
  if (!extraction && kind === "home") subject = await h.handEdit(subject, `${subject.content}\n## Scope\n\nAuthored scope.\n`);
  const filed = await fileDecomposeConflict(h.store, subject);
  const before = lifecycleSuccess(await h.store.version());
  const refusal = await runStoreDecomposeFinish(h.ctx, "origin");
  expect(refusal).toMatchObject({ status: "refused", reason: "record-conflict", class: "recoverable",
    message: expect.stringContaining("abcdef12"), remedy: { text: expect.stringContaining("markers") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: filed.conflict.reference }))).toEqual(filed.conflict);
  await resolveDecomposeConflict(h.store, subject);
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "applied" } });
});
