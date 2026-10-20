/** Shared landed readers refuse disputed terminal lineage and recover after explicit resolution. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { fileDecomposeConflict, resolveDecomposeConflict } from "../../../fixtures/decompose-conflict.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";
import { runStoreDecomposeDiscard } from "../../../../src/lib/decompose/discard.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { runStoreDecomposeRevisionStarter } from "../../../../src/lib/decompose/revision-starter.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";

it.each(["finish", "discard", "revise", "starter"] as const)("%s refuses conflicted landed lineage and resumes its report after resolution", async mode => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority })).toMatchObject({ status: "ok" });
  const subject = lifecycleSuccess(await h.store.read({ reference: recordReferences["lineage/transition"](h.primary.reference.owner) }));
  await fileDecomposeConflict(h.store, subject);
  const run = () => mode === "finish" ? runStoreDecomposeFinish(h.ctx, "origin")
    : mode === "discard" ? runStoreDecomposeDiscard(h.ctx, "origin")
      : mode === "starter" ? runStoreDecomposeRevisionStarter(h.ctx, "origin")
        : runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" });
  const before = lifecycleSuccess(await h.store.version());
  expect(await run()).toMatchObject({ status: "refused", reason: "record-conflict", class: "recoverable",
    message: expect.stringContaining("abcdef12"), remedy: { text: expect.stringContaining("markers") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await resolveDecomposeConflict(h.store, subject);
  const resolved = lifecycleSuccess(await h.store.version());
  expect(await run()).toMatchObject(mode === "finish" ? { status: "ok", result: { kind: "landed" } }
    : { status: "refused", reason: "cut-landed", class: "terminal" });
  expect(lifecycleSuccess(await h.store.version())).toBe(resolved);
});
