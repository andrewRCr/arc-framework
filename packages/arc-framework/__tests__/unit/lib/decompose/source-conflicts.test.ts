/** Open source conflicts retain specific repair evidence before generic inventory refusal. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { acquireDecomposeOrigin } from "../../../../src/lib/decompose/acquire-origin.js";
import { deriveDecomposeSource } from "../../../../src/lib/decompose/source-facts.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";

it.each(["draft", "meta"] as const)("names a %s conflict's token and subject, then proceeds after resolving write-back", async (role) => {
  const h = await createDecomposeOriginFixture();
  const subject = role === "draft" ? h.draft : h.primary;
  const reference = recordReferences["work-item/conflict-record"](subject.reference.owner, "11111111");
  const label = { actor: "other-writer", time: "2026-10-19T00:00:00.000Z" };
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: null,
    content: JSON.stringify({ record: subject.reference, location: { kind: "hunk", start: 0, end: 1 },
      base: subject.content, current: { content: subject.content, label }, incoming: { content: "# Competing content\n", label } }),
    provenance: { verb: "sync", lifecycleAction: "merge" } }));
  const acquired = await acquireDecomposeOrigin(h.ctx, "origin");
  const refusal = acquired.status === "refused" ? acquired : deriveDecomposeSource(acquired.result);
  expect(refusal).toMatchObject({ status: "refused", reason: "source-conflict", class: "recoverable" });
  if (refusal.status !== "refused") throw new Error("Expected a source-conflict refusal.");
  expect(refusal.message).toContain("work-item/work-item/origin/11111111");
  expect(refusal.message).toContain(subject.reference.kind);
  expect(refusal.remedy.text).toContain("markers");
  expect(refusal.remedy.argv).toBeUndefined();
  const conflicted = lifecycleSuccess(await h.store.read({ reference: subject.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(conflicted), resolves: [reference],
    provenance: { verb: "write-back", lifecycleAction: "resolve" } }));
  const repaired = await acquireDecomposeOrigin(h.ctx, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(deriveDecomposeSource(repaired.result)).toMatchObject({ status: "ok" });
});
