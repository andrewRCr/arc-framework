import { storedCutMapFixture } from "../../../fixtures/stored-cut-map.js";
/** A cut cannot conserve transferred content in the generation it retires. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { observedDecomposeWrite } from "../../../helpers/store/decompose-batch.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { prepareDecomposeTerminal } from "../../../../src/lib/decompose/terminal-preparation.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeCutMapRecord } from "../../../../src/lib/store/kinds/cut-map/index.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";

function success<T>(input: { status: "ok"; result: T } | { status: "refused" }): T {
  if (input.status === "refused") throw new Error(JSON.stringify(input));
  return input.result;
}

function selfHome(map: CutMap, slug: string) {
  const unit = map.machine.sourceUnits.find(candidate => candidate.sourceLocator.kind === "section");
  const allocation = map.authoring.sourceAllocations.find(candidate => candidate.sourceId === unit?.sourceId);
  if (unit === undefined || allocation === undefined) throw new Error("Expected source section.");
  map.authoring.shape = "heterogeneous";
  map.authoring.destinations.push({ kind: "existing-home", destinationId: "z-self",
    target: { kind: "draft-block", slug, locator: unit.sourceLocator } });
  allocation.disposition = { kind: "target", destinationId: "z-self", targetLocator: unit.sourceLocator };
}

it.each(["additive", "revision"] as const)("refuses a canonical or former origin home during %s and admits a surviving destination", async mode => {
  const h = await createDecomposeOriginFixture();
  const renamed = await runStoreRename({ ...h.ctx.executor, baseBranch: "main" }, { sourceSlug: "origin", targetSlug: "renamed" });
  if (renamed.status !== "renamed") throw new Error(JSON.stringify(renamed));
  const map = completeCutMapFixture(success(await prepareDecomposePreflight(h.ctx, "renamed")).machine);
  if (mode === "revision") success(await runStoreDecomposeAdditive(h.ctx, "renamed", "execute", { cutMap: map, cutMapPath: "cut.json" }));
  const before = success(await h.store.version());
  for (const slug of ["origin", "renamed"]) {
    const invalid = structuredClone(map);
    selfHome(invalid, slug);
    const input = { cutMap: invalid, cutMapPath: "cut.json" };
    const result = mode === "additive" ? await runStoreDecomposeAdditive(h.ctx, "renamed", "execute", input)
      : await runStoreDecomposeRevision(h.ctx, "renamed", input);
    expect(result).toMatchObject({ status: "refused", reason: "retiring-origin-destination", class: "recoverable" });
    expect(success(await h.store.version())).toBe(before);
  }
  const input = { cutMap: map, cutMapPath: "cut.json" };
  if (mode === "additive") expect(await runStoreDecomposeAdditive(h.ctx, "renamed", "execute", input)).toMatchObject({ status: "ok" });
  else {
    const preview = success(await runStoreDecomposeRevision(h.ctx, "renamed", input));
    if (preview.kind !== "preview") throw new Error("Expected preview.");
    expect(await runStoreDecomposeRevision(h.ctx, "renamed", input, { applyAuthority: preview.applyAuthority })).toMatchObject({ status: "ok" });
  }
});

it("refuses a previously stored self-home at terminal conservation and continues after revision", async () => {
  const h = await createDecomposeOriginFixture();
  const map = completeCutMapFixture(success(await prepareDecomposePreflight(h.ctx, "origin")).machine);
  const applied = success(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" }));
  const invalid = structuredClone(map);
  selfHome(invalid, "origin");
  const stored = success(await h.store.read({ reference: applied.storedMap }));
  success(await observedDecomposeWrite(h.store, { ...recordPut(stored, { content: writeCutMapRecord(storedCutMapFixture(invalid)) }),
    provenance: { verb: "decompose", lifecycleAction: "revise" } }));
  const before = success(await h.store.version());
  expect(await prepareDecomposeTerminal(h.ctx, "origin", "retirement"))
    .toMatchObject({ status: "refused", reason: "retiring-origin-destination", class: "recoverable",
      remedy: { argv: ["arc", "decompose", "origin", "--revise"],
        text: expect.stringMatching(/arc decompose origin --revise.*preview.*apply.*--finish/u) } });
  expect(success(await h.store.version())).toBe(before);
  const input = { cutMap: map, cutMapPath: "cut.json" };
  const preview = success(await runStoreDecomposeRevision(h.ctx, "origin", input));
  if (preview.kind !== "preview") throw new Error("Expected preview.");
  success(await runStoreDecomposeRevision(h.ctx, "origin", input, { applyAuthority: preview.applyAuthority }));
  expect(await prepareDecomposeTerminal(h.ctx, "origin", "retirement")).toMatchObject({ status: "ok" });
});
