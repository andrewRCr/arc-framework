/** Abandonment observes only its live owner's holder before the terminal batch. */
import { expect, it } from "vitest";
import { workUnitHoldersFixture } from "../../../helpers/store/work-unit-holders.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { decomposeContext } from "../../../fixtures/decompose-context.js";
import { readWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { runStoreAbandon } from "../../../../src/lib/work-unit/verbs/abandon-store.js";

it.each([false, true])("checks only the live holder before abandonment, live held=%s", async held => {
  const h = await workUnitHoldersFixture(), before = await readWorktreeMarker(h.oldPath);
  if (held) await h.write(h.livePath, boundWorkUnitSubject(h.live));
  const executor = { ...decomposeContext(h.store).executor, cwd: h.cwd, exec: h.exec, locusPorts: h.ports };
  const result = await runStoreAbandon({ executor, baseBranch: "main", removal: { exec: h.exec,
    check: async path => ({ kind: "would-refuse", remedy: { text: path === h.livePath ? "Keep live edits." : "Keep archived edits." } }) } },
  { name: "demo", confirmed: true });
  expect(result).toMatchObject(held ? { status: "rejected", reason: "Keep live edits." } : { status: "abandoned" });
  expect(await h.store.read({ reference: h.live.reference })).toMatchObject(held ? { status: "ok" } : { status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.archived.reference }))).toEqual(h.archived);
  expect(await readWorktreeMarker(h.oldPath)).toEqual(before);
});
