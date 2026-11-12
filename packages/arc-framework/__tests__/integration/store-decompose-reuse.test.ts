/** Decomposition authenticates the live origin from current and retained operands. */
import { expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lifecycleReuseFixture } from "../fixtures/lifecycle-reuse.js";
import { completeCutMapFixture } from "../fixtures/decompose-v4.js";
import { repairCli } from "../helpers/repair-cli.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { CutMapStarterSchema } from "../../src/lib/decompose/cut-map-schema.js";
import { StoredCutMapSchema } from "../../src/lib/store/kinds/cut-map/schema.js";
import { DecomposeAdditiveReportSchema } from "../../src/lib/decompose/additive-report.js";

it.each([false, true])("decomposes the live generation through its operand, former=%s", async former => {
  const f = await lifecycleReuseFixture(former, { state: "Planning", currentWorkflow: null,
    design: [`draft-${former ? "current" : "example"}.md`] }, { kind: "backlog", commitment: "planned" });
  const draft = await f.seed(recordReferences["work-item/draft"](f.live.reference.owner), "# Draft\n\n## Scope\n\nOwned work.\n");
  const oldDraft = await f.seed(recordReferences["work-item/draft"](f.archived.reference.owner), "# Completed draft\n\nCompleted work.\n");
  const preflight = await repairCli(f, ["decompose", "example", "--preflight"], { store: f.store });
  expect(preflight.exitCode ?? 0, preflight.stdout + preflight.stderr).toBe(0);
  const starter = CutMapStarterSchema.parse(preflight.result);
  expect(starter.machine.origin).toMatchObject({ slug: f.name, uid: f.live.reference.owner.type === "person" ? undefined : f.live.reference.owner.uid });
  const mapPath = join(f.cwd, "cut-map.json");
  await writeFile(mapPath, JSON.stringify(completeCutMapFixture(starter.machine)));
  const executed = await repairCli(f, ["decompose", "example", "--execute", mapPath], { store: f.store });
  expect(lifecycleSuccess(await f.store.read({ reference: f.archived.reference }))).toEqual(f.archived);
  expect(lifecycleSuccess(await f.store.read({ reference: f.oldNotes.reference }))).toEqual(f.oldNotes);
  expect(lifecycleSuccess(await f.store.read({ reference: oldDraft.reference }))).toEqual(oldDraft);
  expect(executed.exitCode ?? 0, executed.stdout + executed.stderr).toBe(0);
  const report = DecomposeAdditiveReportSchema.parse(executed.result);
  expect(report).toMatchObject({ origin: f.name, members: [{ slug: "member-a" }, { slug: "member-b" }] });
  const stored = lifecycleSuccess(await f.store.read({ reference: recordReferences["work-item/cut-map"](f.live.reference.owner) }));
  expect(StoredCutMapSchema.parse(JSON.parse(stored.content)).map.machine.origin).toEqual(starter.machine.origin);
  expect(lifecycleSuccess(await f.store.read({ reference: draft.reference }))).toEqual(draft);
}, 60_000);
