/** Held dependency diagnostics are part of the strict session contract. */
import { expect, it } from "vitest";
import { CurrentWuReconcileSessionResultSchema } from "../../../src/lib/session-init/current-wu-reconcile-schema.js";
import { runCurrentWuReconcileSessionProbe } from "../../../src/lib/session-init/current-wu-reconcile.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";

it("accepts a held edge with its typed candidates and actionable repair", async () => {
  const h = createLifecycleHarness();
  const target = await h.seedMeta("target");
  await h.seedMeta("dependent", { dependsOn: ["target"] });
  const result = await runCurrentWuReconcileSessionProbe({ store: h.store }, {
    slug: "dependent", metaPath: "unused", checkoutPath: "/memory",
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
