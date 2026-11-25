/** Complete machines authenticate acquired facts without further store reads. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { acquireDecomposeOrigin } from "../../../../src/lib/decompose/acquire-origin.js";
import { deriveDecomposeMachine } from "../../../../src/lib/decompose/machine-facts.js";
import { CutMapMachineSchema } from "../../../../src/lib/decompose/cut-map-machine.js";
import { cutMachineIssue } from "../../../../src/lib/decompose/cut-map-machine-validation.js";
import { assertSchemaAccepts } from "../../../helpers/schema-assertion.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";

it("derives one self-authenticating machine from acquired records with all further I/O forbidden", async () => {
  const h = await createDecomposeOriginFixture();
  const acquired = await acquireDecomposeOrigin(h.ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  const forbidden = async (): Promise<never> => { throw new Error("Pure derivation performed I/O."); };
  h.store.read = forbidden; h.store.list = forbidden; h.store.lookup = forbidden;
  const derived = deriveDecomposeMachine(acquired.result);
  expect(derived.status).toBe("ok");
  if (derived.status === "refused") throw new Error(JSON.stringify(derived));
  expect(assertSchemaAccepts(CutMapMachineSchema, derived.result)).toMatchObject({ sourceKind: "backlog-stub",
    origin: { slug: "origin" }, incomingEdges: [], outgoingEdges: [] });
  expect(cutMachineIssue(derived.result)).toBeNull();
});

it("names duplicate provider-generation edges at Depends On and proceeds once the aliases are folded", async () => {
  const h = await createDecomposeOriginFixture();
  await h.seedRenamedWorkUnit("provider", "current-provider");
  const primary = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
  const duplicated = await h.handEdit(primary, writeMetaDependsOn(primary.content, ["provider", "current-provider"]));
  const acquired = await acquireDecomposeOrigin(h.ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  expect(deriveDecomposeMachine(acquired.result)).toMatchObject({ status: "refused", reason: "outgoing-edge-duplicate",
    class: "recoverable", locus: "Depends On" });
  await h.handEdit(duplicated, writeMetaDependsOn(duplicated.content, ["current-provider"]));
  const repaired = await acquireDecomposeOrigin(h.ctx, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(deriveDecomposeMachine(repaired.result)).toMatchObject({ status: "ok" });
});
