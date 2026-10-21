/** Landed-cut evidence terminates discard and revision without mutating records. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { createDecomposeExtractionFixture } from "../../../fixtures/decompose-extraction.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";
import { runStoreDecomposeDiscard } from "../../../../src/lib/decompose/discard.js";
import { runStoreDecomposeRevisionStarter } from "../../../../src/lib/decompose/revision-starter.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { DecomposeRefusalSchema } from "../../../../src/lib/decompose/refusal.js";

it.each(["retirement", "extraction"] as const)("refuses every discard and revision form after a %s lands, naming its recorded members", async shape => {
  const h = shape === "retirement" ? await createDecomposeTerminalFixture() : await createDecomposeExtractionFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  expect(preview.status).toBe("ok");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority })).toMatchObject({ status: "ok", result: { kind: "applied" } });
  const landed = await runStoreDecomposeFinish(h.ctx, "origin");
  if (landed.status === "refused" || landed.result.kind !== "landed") throw new Error(JSON.stringify(landed));
  const before = lifecycleSuccess(await h.store.version());
  const results = [await runStoreDecomposeDiscard(h.ctx, "origin"),
    await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority }),
    await runStoreDecomposeRevisionStarter(h.ctx, "origin"),
    await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" }),
    await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" }, { applyAuthority: preview.result.applyAuthority })];
  for (const result of results) {
    expect(result).toMatchObject({ status: "refused", reason: "cut-landed", class: "terminal", message: expect.stringContaining("landed") });
    expect(DecomposeRefusalSchema.safeParse(result).success).toBe(true);
    if (result.status !== "refused") throw new Error(JSON.stringify(result));
    for (const member of landed.result.members) expect(result.message).toContain(member.name);
  }
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("does not classify a reused live origin generation from the old retirement lineage", async () => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority })).toMatchObject({ status: "ok" });
  const replacement = await h.seedStub("origin");
  const before = lifecycleSuccess(await h.store.version());
  for (const result of [await runStoreDecomposeDiscard(h.ctx, "origin"), await runStoreDecomposeRevisionStarter(h.ctx, "origin"),
    await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" })])
    expect(result).toMatchObject({ status: "refused", reason: "no-stored-map", class: "recoverable" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: replacement.reference }))).toEqual(replacement);
});

it.each([false, true])("does not treat discard history as a landed cut, extraction=%s", async extraction => {
  const h = await createDecomposeTerminalFixture({ extraction, started: extraction });
  const preview = await runStoreDecomposeDiscard(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "discarded" } });
  const before = lifecycleSuccess(await h.store.version());
  for (const result of [await runStoreDecomposeDiscard(h.ctx, "origin"), await runStoreDecomposeRevisionStarter(h.ctx, "origin"),
    await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" })])
    expect(result).toMatchObject({ status: "refused", reason: "no-stored-map", class: "recoverable" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});
