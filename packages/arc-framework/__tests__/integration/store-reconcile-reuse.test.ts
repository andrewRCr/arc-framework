/** Reconciliation selects an operand's live generation while retaining archived records. */
import { expect, it } from "vitest";
import { repairCli } from "../helpers/repair-cli.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { lifecycleReuseFixture } from "../fixtures/lifecycle-reuse.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn } from "../../src/lib/store/kinds/meta/writers.js";

it.each([false, true])("reconciles the bound live generation, former operand=%s", async former => {
  const f = await lifecycleReuseFixture(former);
  await f.seedMeta("done", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  lifecycleSuccess(await f.store.write({ ...recordPut(f.live, { content: writeMetaDependsOn(f.live.content, ["done"]) }),
    provenance: { verb: "fixture", lifecycleAction: "arrange" } }));
  const spec = await f.seed(recordReferences["work-item/spec"](f.archived.reference.owner), "# Completed design\n");
  const owner = f.live.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the live owner's UID");
  await ensureWorktreeMarkerIgnored(f.cwd, f.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(f.cwd, { spawnedByArc: false,
    createdFor: { kind: "work-unit", name: f.name, uid: owner.uid }, spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  const result = await repairCli(f, ["wu", "reconcile", "example", "--apply", "--json"], { store: f.store });
  expect(lifecycleSuccess(await f.store.read({ reference: f.live.reference }))).toMatchObject({ reference: { owner: { name: f.name } }, fields: { dependsOn: [] } });
  for (const record of [f.archived, f.oldNotes, spec]) expect(lifecycleSuccess(await f.store.read({ reference: record.reference }))).toEqual(record);
  expect(result.exitCode, result.stdout + result.stderr).not.toBe(1);
  expect(result.result).toMatchObject({ slug: f.name, status: "applied" });
  expect(result.result).not.toMatchObject({ status: "conflict" });
}, 60_000);

it("reconciles an ended holder's own record instead of its live namesake", async () => {
  const f = await lifecycleReuseFixture(false);
  await f.seedMeta("done", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  lifecycleSuccess(await f.store.write({ ...recordPut(f.live, { content: writeMetaDependsOn(f.live.content, ["done"]) }),
    provenance: { verb: "fixture", lifecycleAction: "arrange" } }));
  const before = lifecycleSuccess(await f.store.read({ reference: f.live.reference })), owner = f.archived.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the ended owner's UID");
  await ensureWorktreeMarkerIgnored(f.cwd, f.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(f.cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "example", uid: owner.uid },
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  const result = await repairCli(f, ["wu", "reconcile", "--apply", "--json"], { store: f.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ status: "clean", dependency: { before: [], after: [] } });
  for (const record of [before, f.archived, f.oldNotes]) expect(lifecycleSuccess(await f.store.read({ reference: record.reference }))).toEqual(record);
}, 30_000);
