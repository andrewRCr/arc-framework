import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { writeMetaPause } from "../../../src/lib/store/kinds/meta/writers.js";
import { expect, it } from "vitest";
import { withPausedCurrentWuActions } from "../../../src/lib/session-init/paused-current-wu-actions.js";
import { runCurrentWuReconcileSessionProbe } from "../../../src/lib/session-init/current-wu-reconcile.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { LineageRecordSchema } from "../../../src/lib/store/kinds/lineage/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
it("a paused work unit replaces only its typed apply action, preserving the recorded recommendation", async () => {
  const h = createLifecycleHarness();
  const retired = await h.seedMeta("retired");
  const dependent = await h.seedMeta("dependent", { dependsOn: ["retired"] });
  await h.seedMeta("successor");
  const lineage = LineageRecordSchema.parse({ schemaVersion: 2, kind: "rename", origin: { name: "retired" }, successors: [{ name: "successor" }], incoming: [] });
  await h.seed(recordReferences["lineage/transition"](OwnerIdentitySchema.parse({ type: "work-item", name: "retired" })), JSON.stringify(lineage));
  lifecycleSuccess(await h.store.write({ action: "remove", reference: retired.reference, expected: retired.version, provenance: { verb: "fixture-retire", lifecycleAction: "rename" } }));
  const pause = MetaPauseSchema.parse({ reason: "Wait", since: "2026-10-14T00:00:00Z", pausedBy: "test-user", open: false });
  const pausedContent = writeMetaPause(dependent.content, pause);
  lifecycleSuccess(await h.store.write({ ...recordPut(dependent, { content: pausedContent }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const prepared = await runCurrentWuReconcileSessionProbe({ store: h.store }, { slug: "dependent", metaPath: ".arc/active/meta-dependent.md", checkoutPath: "/repo" });
  expect(prepared.status).toBe("pending");
  const context = { pause: parseMetaRecord(pausedContent).pause };
  const paused = withPausedCurrentWuActions(prepared, h.store, context);
  expect(paused.actions).toEqual([
    { text: "arc wu reconcile dependent --json", argv: ["arc", "wu", "reconcile", "dependent", "--json"] },
    { text: "Run arc resume dependent, then arc wu reconcile dependent --apply --json once resumed.", argv: ["arc", "resume", "dependent"], checkout: "/repo" },
  ]);
  expect(withPausedCurrentWuActions(prepared, h.store, null)).toEqual(prepared);
  expect(paused.recommendedCommand).toEqual(["arc", "wu", "reconcile", "dependent", "--apply", "--json"]);
  expect(paused.recommendedPromptText).toBe(prepared.recommendedPromptText);
});
