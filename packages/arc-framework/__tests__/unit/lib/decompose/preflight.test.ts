/** Preflight emits authenticated author slots without persisting observations. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { runStoreDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { parseCutMapStarter } from "../../../../src/lib/decompose/cut-map-starter.js";
import { cutPreflightId } from "../../../../src/lib/decompose/cut-map-machine.js";
import { canonicalize } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";

it("emits a canonical authenticated starter with every source and edge author slot", async () => {
  const h = await createDecomposeOriginFixture();
  await h.seedStub("provider");
  await h.handEdit(h.primary, writeMetaDependsOn(h.primary.content, ["provider"]));
  await h.seedMeta("dependent", { state: "Planning", currentWorkflow: null, dependsOn: ["origin"] },
    { kind: "backlog", commitment: "planned" });
  const result = await runStoreDecomposePreflight(h.ctx, "origin");
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  const decoded = parseCutMapStarter(JSON.parse(result.result));
  expect(decoded).not.toBeNull();
  if (decoded === null) throw new Error("Expected a valid starter.");
  expect(decoded.schemaVersion).toBe(4);
  const { preflightId, ...facts } = decoded.machine;
  expect(preflightId).toBe(cutPreflightId(facts));
  expect(decoded.machine.incomingEdges).toHaveLength(1);
  expect(decoded.machine.outgoingEdges).toHaveLength(1);
  expect(decoded.machine.sourceUnits.length).toBeGreaterThan(0);
  const author = { status: "author" };
  expect(decoded.authoring).toEqual({ shape: author, placement: author, destinations: author,
    internalEdges: author, externalEdges: author,
    sourceAllocations: decoded.machine.sourceUnits.map(({ sourceId }) => ({ sourceId, ownership: author, disposition: author })),
    incomingDispositions: decoded.machine.incomingEdges.map(({ edgeId }) => ({ edgeId, disposition: author })),
    outgoingDispositions: decoded.machine.outgoingEdges.map(({ edgeId }) => ({ edgeId, disposition: author })),
  });
  expect(result.result).toBe(canonicalize(decoded));
});

it("returns identical bytes on repeated preflight over unchanged records", async () => {
  const h = await createDecomposeOriginFixture();
  const first = await runStoreDecomposePreflight(h.ctx, "origin");
  const second = await runStoreDecomposePreflight(h.ctx, "origin");
  expect(first.status).toBe("ok");
  expect(second).toEqual(first);
});

it("leaves all record histories and the store state version unchanged", async () => {
  const h = await createDecomposeOriginFixture();
  const unrelated = await h.seedStub("unrelated");
  const references = [h.primary.reference, h.draft.reference, unrelated.reference];
  const before = await Promise.all(references.map(reference => h.store.history({ reference })));
  const version = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposePreflight(h.ctx, "origin")).toMatchObject({ status: "ok" });
  expect(await Promise.all(references.map(reference => h.store.history({ reference })))).toEqual(before);
  expect(lifecycleSuccess(await h.store.version())).toEqual(version);
});
