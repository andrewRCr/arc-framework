/** Reconciliation selects an operand's live generation while retaining archived records. */
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";

it("reconciles the live generation through its former operand", async () => {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  const archived = await h.seedMeta("example", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const notes = await h.seed(recordReferences["work-item/notes"](archived.reference.owner), "# Completed notes\n");
  const live = await h.seedMeta("example");
  const renamed = await repairCli(f, ["rename", "example", "current"], { store: h.store });
  expect(renamed.exitCode, renamed.stdout + renamed.stderr).not.toBe(1);
  await writeWorktreeOwnershipMarker(f.cwd, { createdByArc: true,
    createdFor: { kind: "work-unit", name: "current" }, spawningIdentity: "test-user" });
  const result = await repairCli(f, ["wu", "reconcile", "example", "--apply", "--json"], { store: h.store });
  expect(lifecycleSuccess(await h.store.read({ reference: live.reference })).reference.owner.name)
    .toBe("current");
  expect(lifecycleSuccess(await h.store.read({ reference: archived.reference }))).toEqual(archived);
  expect(lifecycleSuccess(await h.store.read({ reference: notes.reference }))).toEqual(notes);
  expect(result.exitCode, result.stdout + result.stderr).not.toBe(1);
  expect(result.result).toMatchObject({ slug: "current" });
  expect(result.result).not.toMatchObject({ status: "conflict" });
}, 60_000);
