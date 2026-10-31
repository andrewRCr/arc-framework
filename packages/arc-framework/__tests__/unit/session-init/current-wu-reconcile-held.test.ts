/** Held dependency diagnostics are part of the strict session contract. */
import { expect, it } from "vitest";
import { CurrentWuReconcileSessionResultSchema } from "../../../src/lib/session-init/current-wu-reconcile-schema.js";
import { runCurrentWuReconcileSessionProbe } from "../../../src/lib/session-init/current-wu-reconcile.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../../helpers/store/clash-double.js";
import { boundWorkUnitCheckout } from "../../helpers/store/bound-checkout.js";

it("accepts a held edge with its typed candidates and actionable repair", async () => {
  const h = createLifecycleHarness();
  const target = await h.seedMeta("target");
  const dependent = await h.seedMeta("dependent", { dependsOn: ["target"] });
  const checkoutPath = await boundWorkUnitCheckout(dependent);
  const result = await runCurrentWuReconcileSessionProbe({ store: h.store }, {
    slug: "dependent", metaPath: "unused", checkoutPath,
  });
  if (result.status === "unavailable") throw new Error("Expected a plan");
  const withoutHeld = { ...result, dependency: { ...result.dependency } };
  delete withoutHeld.dependency.held;
  expect(CurrentWuReconcileSessionResultSchema.safeParse(withoutHeld).success).toBe(true);
  const held = { edge: "target", name: "target", cause: "unresolved-follow",
    candidates: [target.reference], repair: { text: "Edit the edge to name the intended holder." } };
  expect(CurrentWuReconcileSessionResultSchema.safeParse({ ...result,
    dependency: { ...result.dependency, held: [held] }, status: "pending", recommendedAction: "surface",
    recommendedCommand: ["arc", "wu", "reconcile", "dependent", "--json"], recommendedPromptText: "Inspect the held edge.",
  }).success).toBe(true);
});

it("names held edges in the pending session prompt and offers inspection", async () => {
  const h = createLifecycleHarness();
  const target = await h.seedMeta("target"), other = await h.seedMeta("other");
  const dependent = await h.seedMeta("dependent", { dependsOn: ["target"] });
  const checkoutPath = await boundWorkUnitCheckout(dependent);
  const store = createClashDouble(h.store, { slug: "target", holders: [target.reference, other.reference] });
  const result = await runCurrentWuReconcileSessionProbe({ store }, {
    slug: "dependent", metaPath: "unused", checkoutPath,
  });
  expect(result).toMatchObject({ status: "pending", recommendedAction: "surface",
    actions: [{ argv: ["arc", "wu", "reconcile", "dependent", "--json"] }],
    recommendedCommand: ["arc", "wu", "reconcile", "dependent", "--json"],
    dependency: { held: [{ edge: "target", cause: "tie" }] },
  });
  expect(result.recommendedPromptText).toContain("held dependency");
  expect(result.recommendedPromptText).toContain("`target`");
  expect(CurrentWuReconcileSessionResultSchema.safeParse(result).success).toBe(true);
});
