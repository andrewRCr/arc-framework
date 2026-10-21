/** A promoted Errand retains its description without adding it to cut source allocations. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { decomposeContext } from "../../../fixtures/decompose-context.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { createStorePromotionSteps } from "../../../../src/lib/errand/promote-store.js";
import { promoteOrdinaryErrand } from "../../../../src/lib/errand/promote.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDesign, writeMetaOrigin } from "../../../../src/lib/store/kinds/meta/writers.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { checkDecomposeConservation } from "../../../../src/lib/decompose/conservation.js";
import { checkDecomposeTerminalOrigin } from "../../../../src/lib/decompose/check-terminal-origin.js";

it("admits the retained description of an actually promoted origin", async () => {
  const h = createDecomposeHarness(), ctx = decomposeContext(h.store), sha = "1".repeat(40);
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "errand-source" });
  const identity = { version: 3, slug: "errand-source", claimId: "a".repeat(32), owner: "test-user",
    createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", kind: "errand", purpose: "errand",
    intent: "Useful work", branch: "chore/errand-source", origin: "description", originEntry: null,
    state: "open", savedHead: null, changeRequest: null };
  const errand = await h.seed(recordReferences["work-item/record"](owner), JSON.stringify(identity), { kind: "active" },
    { branches: [{ repository: "repo", ref: identity.branch, linkedAs: "created", excluded: [] }] });
  const description = await h.seed(recordReferences["work-item/description"](errand.reference.owner),
    "# Errand description\n\n## Description\n\n### **Useful work**\n\nDescription retained through promotion.\n");
  const git = scriptGitExec([
    { match: ["check-ref-format", "--branch", "feat/origin"], responses: [{ stdout: "feat/origin" }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "refs/heads/feat/origin^{commit}"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "refs/heads/chore/errand-source^{commit}"], responses: [{ stdout: sha }] },
    { match: ["branch", "feat/origin", sha], responses: [{ stdout: "" }] },
    { match: ["switch", "feat/origin"], responses: [{ stdout: "" }] },
  ]);
  const options = { slug: "errand-source", name: "origin", floor: "derivation" as const, type: "feat",
    owner: "test-user", identity: "test-user", class: "Light", store: h.store, exec: git.exec, repository: "repo",
    checkout: async () => ({ kind: "ready" as const, checkoutPath: "/checkout", allocation: "primary" as const, parentCheckoutPath: null }) };
  const steps = createStorePromotionSteps(options);
  expect(await promoteOrdinaryErrand({ ...options, protection: "full", dependencies: { ...steps,
    settleInbox: async frame => frame, settleOccupancy: async frame => frame } })).toMatchObject({ outcome: "applied" });
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  await h.seed(recordReferences["work-item/draft"](primary.reference.owner), "# Origin\n\n## Scope\n\nOwned work.\n");
  await h.handEdit(primary, writeMetaOrigin(writeMetaDesign(primary.content, ["draft-origin.md"]), "Promoted useful work."));
  const preflight = await prepareDecomposePreflight(ctx, "origin");
  if (preflight.status === "refused") throw new Error(JSON.stringify(preflight));
  expect(preflight.result.machine.sourceUnits.every(unit => unit.sourceLocator.artifact === "draft-origin.md")).toBe(true);
  const map = completeCutMapFixture(preflight.result.machine);
  const applied = await runStoreDecomposeAdditive(ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" });
  if (applied.status === "refused") throw new Error(JSON.stringify(applied));
  const acquired = await acquireDecomposeTerminal(ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  expect(acquired.result.acquired.records).toContainEqual(expect.objectContaining({ reference: expect.objectContaining({ kind: "work-item/description" }), content: description.content }));
  expect(checkDecomposeTerminalOrigin(acquired.result)).toMatchObject({ status: "ok" });
  expect(await checkDecomposeConservation(ctx, acquired.result)).toMatchObject({ status: "ok" });
  expect(lifecycleSuccess(await h.store.read({ reference: description.reference })).content).toBe(description.content);
});
