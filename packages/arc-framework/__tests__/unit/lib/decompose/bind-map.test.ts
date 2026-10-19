/** Completed maps retain repairable decoding, fresh binding, and explicit mode authority. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { bindDecomposeMap } from "../../../../src/lib/decompose/bind-map.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { writeCutMapRecord } from "../../../../src/lib/store/kinds/cut-map/index.js";
import { KIND_MECHANISMS } from "../../../../src/lib/store/registry.js";

it.each([
  { input: { schemaVersion: 3 }, reason: "unsupported-version", locus: "schemaVersion" },
  { input: null, reason: "invalid-structure", locus: "$" },
])("refuses $reason at its locus and binds a newly completed preflight", async ({ input, reason, locus }) => {
  const h = await createDecomposeOriginFixture();
  const refused = await bindDecomposeMap(h.ctx, "origin", "execute", { cutMap: input, cutMapPath: "cut map.json" });
  expect(refused).toMatchObject({ status: "refused", reason, class: "recoverable", locus });
  if (refused.status !== "refused") throw new Error("Expected decoding refusal.");
  if (reason === "unsupported-version") expect(refused.remedy.argv).toEqual(["arc", "decompose", "origin", "--preflight"]);
  else expect(refused.remedy.text).toContain("cut map.json");
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  const result = await bindDecomposeMap(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut map.json" });
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.map).toEqual(map);
  expect(result.result.acquired.primary.version).toBe(h.primary.version);
});

it.each(["inbound-held", "source-conflict", "cut-in-flight"] as const)("repeats %s admission and binds after its repair", async reason => {
  const h = await createDecomposeOriginFixture();
  h.ctx.inboundGrammar = KIND_MECHANISMS["work-item/inbound"].entry;
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  const input = { cutMap: map, cutMapPath: "cut.json" };
  let repair: () => Promise<unknown>;
  if (reason === "inbound-held") {
    const held = await h.seed(recordReferences["work-item/inbound"](h.primary.reference.owner),
      "# Inbound\n\n## Inbound\n\n### Captured work\n\n_Id:_ `1234abcd`\n\nFold this work.\n");
    repair = () => h.handEdit(held, "# Inbound\n\n## Inbound\n");
  } else if (reason === "source-conflict") {
    const reference = recordReferences["work-item/conflict-record"](h.primary.reference.owner, "11111111");
    const label = { actor: "other-writer", time: "2026-10-19T00:00:00.000Z" };
    lifecycleSuccess(await h.store.write({ action: "put", reference, expected: null,
      content: JSON.stringify({ record: h.draft.reference, location: { kind: "hunk", start: 0, end: 1 },
        base: h.draft.content, current: { content: h.draft.content, label }, incoming: { content: "# Competing content\n", label } }),
      provenance: { verb: "sync", lifecycleAction: "merge" } }));
    repair = async () => {
      const conflicted = lifecycleSuccess(await h.store.read({ reference: h.draft.reference }));
      lifecycleSuccess(await h.store.write({ ...recordPut(conflicted), resolves: [reference],
        provenance: { verb: "write-back", lifecycleAction: "resolve" } }));
    };
  } else {
    const stored = await h.seed(recordReferences["work-item/cut-map"](h.primary.reference.owner), writeCutMapRecord(map));
    repair = async () => lifecycleSuccess(await h.store.write({ action: "remove", reference: stored.reference,
      expected: stored.version, provenance: { verb: "decompose", lifecycleAction: "discard" } }));
  }
  expect(await bindDecomposeMap(h.ctx, "origin", "execute", input)).toMatchObject({ status: "refused", reason, class: "recoverable" });
  await repair();
  expect(await bindDecomposeMap(h.ctx, "origin", "execute", input)).toMatchObject({ status: "ok" });
});

it("refuses a stale machine and binds a fresh starter after the source changes", async () => {
  const h = await createDecomposeOriginFixture();
  const before = await prepareDecomposePreflight(h.ctx, "origin");
  if (before.status === "refused") throw new Error(JSON.stringify(before));
  const map = completeCutMapFixture(before.result.machine);
  await h.handEdit(h.draft, h.draft.content + "\nChanged scope.\n");
  const stale = await bindDecomposeMap(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" });
  expect(stale).toMatchObject({ status: "refused", reason: "stale-machine", class: "recoverable", locus: "machine" });
  if (stale.status !== "refused") throw new Error("Expected stale preflight.");
  expect(stale.remedy.argv).toEqual(["arc", "decompose", "origin", "--preflight"]);
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  expect(await bindDecomposeMap(h.ctx, "origin", "execute",
    { cutMap: completeCutMapFixture(fresh.result.machine), cutMapPath: "cut.json" })).toMatchObject({ status: "ok" });
});

it.each(["execute", "extract"] as const)("corrects --%s with a typed action retaining the exact map operand", async mode => {
  const h = await createDecomposeOriginFixture(true);
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine, mode === "execute");
  const cutMapPath = "cut maps/operator's $(literal) `file`.json";
  const input = { cutMap: map, cutMapPath };
  const refused = await bindDecomposeMap(h.ctx, "origin", mode, input);
  expect(refused).toMatchObject({ status: "refused", reason: "wrong-shape-mode", class: "recoverable", locus: "authoring.shape" });
  if (refused.status !== "refused") throw new Error("Expected wrong mode.");
  const correct = mode === "execute" ? "extract" : "execute";
  expect(refused.remedy.argv).toEqual(["arc", "decompose", "origin", `--${correct}`, cutMapPath]);
  expect(await bindDecomposeMap(h.ctx, "origin", correct, input)).toMatchObject({ status: "ok" });
});
