/** A repeated finish reports terminal lineage without reapplying any writes. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";
import { runStoreAbandon } from "../../../../src/lib/work-unit/verbs/abandon-store.js";

it("reports a retirement's landed members on every repeated finish", async () => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority })).toMatchObject({ status: "ok", result: { kind: "applied" } });
  const before = lifecycleSuccess(await h.store.version());
  for (const options of [{}, { applyAuthority: preview.result.applyAuthority }]) {
    expect(await runStoreDecomposeFinish(h.ctx, "origin", options)).toMatchObject({ status: "ok", result: { kind: "landed",
      origin: { slug: "origin" }, members: [{ name: "member-a" }, { name: "member-b" }] } });
  }
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("refuses a live origin with no stored map", async () => {
  const h = await createDecomposeOriginFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  expect(await runStoreDecomposeFinish(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "no-stored-map" });
});

it("preserves an abandoned origin's slug refusal", async () => {
  const h = await createDecomposeOriginFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  expect(await runStoreAbandon(h.ctx, { name: "origin", confirmed: true })).toMatchObject({ status: "abandoned" });
  expect(await runStoreDecomposeFinish(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "store", storeRefusal: { code: "not-found" } });
});

it("selects a live reused origin generation ahead of the old landed lineage", async () => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority })).toMatchObject({ status: "ok", result: { kind: "applied" } });
  const replacement = await h.seedStub("origin");
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeFinish(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "no-stored-map" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: replacement.reference }))).toEqual(replacement);
});
