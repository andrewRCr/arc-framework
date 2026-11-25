/** Only uncontested source bytes may acquire clean authority in a new member. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { decomposeContext } from "../../../fixtures/decompose-context.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { fileDecomposeConflict, resolveDecomposeConflict } from "../../../fixtures/decompose-conflict.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";

function success<T>(input: { status: "ok"; result: T } | { status: "refused" }): T {
  if (input.status === "refused") throw new Error(JSON.stringify(input));
  return input.result;
}

it.each((["notes", "tasks"] as const).flatMap(role => (["additive", "revision"] as const).map(mode => ({ role, mode }))))("refuses a disputed $role copy in $mode, then copies its resolved content", async ({ role, mode }) => {
  const h = createDecomposeHarness();
  const primary = await h.seedMeta("origin", { state: "Active", design: ["draft-origin.md"] });
  await h.seed(recordReferences["work-item/draft"](primary.reference.owner), "# Origin\n\n## Scope\n\nOwned work.\n");
  const reference = role === "notes" ? recordReferences["work-item/notes"](primary.reference.owner)
    : recordReferences["work-item/task-list"](primary.reference.owner);
  const source = await h.seed(reference, role === "notes" ? "# Notes origin\n\n## Scope\n\nShared notes.\n"
    : "# Tasks origin\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Work**\n\n- _Goal:_ Keep work bounded.\n");
  const ctx = decomposeContext(h.store);
  const map = completeCutMapFixture(success(await prepareDecomposePreflight(ctx, "origin")).machine, true);
  await fileDecomposeConflict(h.store, source);
  if (mode === "revision") {
    // This cut retains the disputed companion without consuming its content.
    success(await runStoreDecomposeAdditive(ctx, "origin", "extract", { cutMap: map, cutMapPath: "cut.json" }));
    const member = map.authoring.destinations[0];
    if (member?.kind !== "new-member") throw new Error("Expected member.");
    member.slug = "member-c";
    for (const allocation of map.authoring.sourceAllocations) if (allocation.disposition.kind === "target")
      allocation.disposition.targetLocator.artifact = "draft-member-c.md";
  }
  const allocation = map.authoring.sourceAllocations[0];
  if (allocation === undefined) throw new Error("Expected allocation.");
  const slug = mode === "revision" ? "member-c" : "member-a";
  allocation.disposition = { kind: "target", destinationId: "member-a",
    targetLocator: { kind: "preamble", artifact: `${role}-${slug}.md` } };
  const input = { cutMap: map, cutMapPath: "cut.json" };
  const before = success(await h.store.version());
  const refused = mode === "additive" ? await runStoreDecomposeAdditive(ctx, "origin", "extract", input)
    : await runStoreDecomposeRevision(ctx, "origin", input);
  expect(refused).toMatchObject({ status: "refused", reason: "record-conflict", class: "recoverable" });
  expect(success(await h.store.version())).toBe(before);
  await resolveDecomposeConflict(h.store, source);
  if (mode === "additive") success(await runStoreDecomposeAdditive(ctx, "origin", "extract", input));
  else {
    const preview = success(await runStoreDecomposeRevision(ctx, "origin", input));
    if (preview.kind !== "preview") throw new Error("Expected preview.");
    success(await runStoreDecomposeRevision(ctx, "origin", input, { applyAuthority: preview.applyAuthority }));
  }
  const member = success(await readWorkUnit(h.store, slug));
  const target = role === "notes" ? recordReferences["work-item/notes"](member.reference.owner)
    : recordReferences["work-item/task-list"](member.reference.owner);
  expect(success(await h.store.read({ reference: target }))).toMatchObject({ conflicts: [], content: source.content.replace("origin", slug) });
});
