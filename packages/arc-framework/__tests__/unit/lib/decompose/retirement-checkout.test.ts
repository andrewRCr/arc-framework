/** Decomposition's physical admission follows the exact retiring owner. */
import { expect, it } from "vitest";
import { workUnitHoldersFixture } from "../../../helpers/store/work-unit-holders.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { decomposeContext } from "../../../fixtures/decompose-context.js";
import { readWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { checkDecomposeRetirementCheckout } from "../../../../src/lib/decompose/retirement-checkout.js";

it.each([false, true])("admits only the retiring live owner's checkout, live held=%s", async held => {
  const h = await workUnitHoldersFixture(), before = await readWorktreeMarker(h.oldPath);
  if (held) await h.write(h.livePath, boundWorkUnitSubject(h.live));
  const ctx = decomposeContext(h.store);
  ctx.executor = { ...ctx.executor, cwd: h.cwd, exec: h.exec, locusPorts: h.ports };
  ctx.removal = { exec: h.exec, check: async path => ({ kind: "would-refuse", remedy: {
    text: path === h.livePath ? "Keep live edits." : "Keep archived edits.",
  } }) };
  expect(await checkDecomposeRetirementCheckout(ctx, h.live)).toMatchObject(held
    ? { status: "refused", reason: "removal-check", locus: h.livePath, remedy: { text: "Keep live edits." } }
    : { status: "ok", result: null });
  expect(await h.store.read({ reference: h.live.reference })).toMatchObject({ status: "ok", result: h.live });
  expect(await readWorktreeMarker(h.oldPath)).toEqual(before);
});
it("refuses an unbound retiring holder with its recovery exits before physical admission", async () => {
  const h = await workUnitHoldersFixture(), ctx = decomposeContext(h.store);
  await h.write(h.livePath, { kind: "work-unit", name: "demo" });
  ctx.executor = { ...ctx.executor, cwd: h.cwd, exec: h.exec, locusPorts: h.ports };
  const result = await checkDecomposeRetirementCheckout(ctx, h.live);
  expect(result).toMatchObject({ status: "refused", reason: "removal-check", remedy: { text: expect.stringContaining("arc materialize demo --here") } });
  expect(JSON.stringify(result)).toContain("arc locus release");
  expect(await h.store.read({ reference: h.live.reference })).toMatchObject({ status: "ok", result: h.live });
});
