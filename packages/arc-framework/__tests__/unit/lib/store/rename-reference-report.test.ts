/** Authored rename advice preserves each original artifact reference's distinct destination. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { ownedArtifactRenames } from "../../../../src/lib/store/rename-artifact-names.js";
import { workUnitRenameReferenceReport } from "../../../../src/lib/store/rename-reference-report.js";

it("keeps distinct artifact destinations in ambiguous-resolution advice without editing shared content", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("source", { state: "Planning", currentWorkflow: "create-spec", design: ["draft-source.md"] });
  const draft = await h.seed(recordReferences["work-item/draft"](primary.reference.owner), "# Draft: source\n");
  const companion = await h.seed(recordReferences["work-item/companion"](primary.reference.owner, "draft-renamed"), "# Companion\n");
  const waiting = await h.seedMeta("waiting", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "provisional" });
  const shared = await h.seed(recordReferences["work-item/draft"](waiting.reference.owner),
    "# Draft: waiting\n\nRead `draft-source.md` and `draft-renamed-source.md`.\n");
  const records = [primary, draft, companion, waiting, shared], before = lifecycleSuccess(await h.store.version());
  const report = workUnitRenameReferenceReport({ primary, records, entries: [], resolution: "ambiguous",
    source: "source", target: "renamed-source", artifactRenames: ownedArtifactRenames(records, primary, "renamed-source") });
  expect(report.references).toEqual([{ record: { type: "work-unit", name: "waiting", uid: expect.any(String) }, edits: [{
    kind: "text", document: shared.reference, line: 3,
    replacement: "Read `draft-renamed-source.md` and `draft-renamed-renamed-source.md`.",
  }] }]);
  expect(lifecycleSuccess(await h.store.read({ reference: shared.reference }))).toEqual(shared);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});
