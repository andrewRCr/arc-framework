/** Omitted operands keep checkout identity while name admission still refuses live clashes. */
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { attestStorePublication } from "../helpers/store/publication-fixture.js";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { renderMetaFile } from "../../src/lib/store/kinds/meta/writers.js";

async function fixture(second: boolean, verb = "") {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  const repository = randomUUID();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: repository })), "{}");
  if (verb === "") { await h.seedMeta("first-dependency"); await h.seedMeta("other-dependency"); }
  const first = await h.seedMeta("first", verb === "" ? { dependsOn: ["first-dependency"] } : {});
  const other = await h.seedMeta("other", verb === "" ? { dependsOn: ["other-dependency"] } : {});
  const primary = second ? other : first, owner = primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the checkout owner's UID");
  if (verb === "publish") await attestStorePublication({ ...f, ...h, live: primary, name: "example", repository });
  if (verb === "reopen") {
    lifecycleSuccess(await h.store.write({ ...recordPut(primary, { content: renderMetaFile(owner.name,
      { state: "Integrating", owner: "test-user", workClass: "Light", currentWorkflow: "integrate-work-unit", taskList: "tasks-example.md" }) }),
      provenance: { verb: "fixture", lifecycleAction: "arrange" } }));
    const tasks = "# Task List: example\n\n### `[x]` **1.1 Done**\n";
    await h.seed(recordReferences["work-item/task-list"](owner), tasks);
    await mkdir(join(f.cwd, ".arc/active"), { recursive: true });
    await writeFile(join(f.cwd, ".arc/active/tasks-example.md"), tasks);
  }
  const store = createClashDouble(h.store, { slug: "example", holders: [first.reference, other.reference] });
  await ensureWorktreeMarkerIgnored(f.cwd, f.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(f.cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "example", uid: owner.uid },
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  const records = await Promise.all([first, other].map(record => h.store.read({ reference: record.reference }).then(lifecycleSuccess)));
  return { f, h, store, records };
}
const cases = [
  { name: "activate", args: ["activate", "--type", "feat", "--task", "Work", "--action", "Continue"], json: false },
  { name: "publish", args: ["publish"], json: false },
  { name: "publish JSON", args: ["publish", "--json"], json: true },
  { name: "reopen", args: ["reopen"], json: false },
  { name: "set-class", args: ["set-class", "Heavy"], json: false },
];
it.each(cases.flatMap(test => [false, true].map(second => ({ ...test, second }))))(
  "$name refuses its checkout's clashed name without an operand, second=$second", async test => {
    const { f, h, store, records } = await fixture(test.second, test.args[0]);
    const expected = await store.lookup({ kind: "slug", slug: SlugSchema.parse("example") });
    if (expected.status !== "refused") throw new Error("Expected the live clash");
    const result = await repairCli(f, test.args, { store });
    expect(result.exitCode, result.stdout + result.stderr).toBe(1);
    if (test.json) expect(result.result).toMatchObject({ refusal: expected.refusal });
    else for (const record of records) {
      if (record.reference.owner.type !== "work-item") throw new Error("Expected a work-item owner");
      expect(result.stdout + result.stderr).toContain(record.reference.owner.uid);
      expect(result.stdout + result.stderr).toContain(`arc rename ${record.reference.owner.uid} <new-slug>`);
    }
    for (const record of records) expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
  }, 60_000);

it.each([false, true].flatMap(second => [false, true].map(operand => ({ second, operand }))))(
  "reconcile uses its exact checkout owner through the clash, second=$second, operand=$operand", async test => {
    const { f, h, store, records } = await fixture(test.second);
    const result = await repairCli(f, ["wu", "reconcile", ...(test.operand ? ["example"] : []), "--json"], { store });
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    expect(result.result).toMatchObject({ status: "clean", slug: "example",
      dependency: { before: [test.second ? "other-dependency" : "first-dependency"] } });
    for (const record of records) expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
  }, 60_000);
