/** Registered promotion settles dependency edges under production storage write checks. */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
const completed = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
const args = ["errand", "promote", "source", "--name", "reused", "--floor", "derivation", "--class", "Light", "--json"];
async function fixture() {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: randomUUID() })), "{}");
  expect(await repairCli(f, ["errand", "open", "source", "--intent", "Keep useful work", "--json"], { store: h.store }))
    .toMatchObject({ result: { outcome: "applied" } });
  await writeFile(join(f.cwd, "useful-work.txt"), "Useful work\n");
  await f.exec("git", ["add", "useful-work.txt"]); await f.exec("git", ["commit", "-m", "Useful work"]);
  const reference = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("source") })).reference;
  const primary = lifecycleSuccess(await h.store.read({ reference }));
  return { ...f, ...h, primary, marker: await readWorktreeMarker(f.cwd), cut: (await f.exec("git", ["rev-parse", "HEAD"])).stdout.trim() };
}
it("promotion settles a stub's completed dependency in its role-change batch", async () => {
  const f = await fixture(), archived = await f.seedMeta("reused", { state: "Shipped", currentWorkflow: null }, completed);
  const dependent = await f.seedMeta("waiting", { state: "Planning", currentWorkflow: null, dependsOn: ["reused"] },
    { kind: "backlog", commitment: "planned" });
  expect(await repairCli(f, args, { store: f.store })).toMatchObject({ result: { outcome: "applied", branch: "feat/reused" } });
  expect(lifecycleSuccess(await f.store.read({ reference: dependent.reference }))).toMatchObject({ fields: { dependsOn: [] } });
  expect(lifecycleSuccess(await f.store.read({ reference: archived.reference }))).toEqual(archived);
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference }))).toMatchObject({
    reference: { kind: "work-item/meta", owner: { ...f.primary.reference.owner, name: "reused" } } });
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(f.cut);
}, 30_000);
it.each(["active", "paused"] as const)("promotion preserves a %s dependent's write-rule remedy and resumes after its owner repairs the edge", async kind => {
  const f = await fixture(), archived = await f.seedMeta("reused", { state: "Shipped", currentWorkflow: null }, completed);
  const dependent = await f.seedMeta("dependent", { dependsOn: kind === "active" ? ["reused"] : [] });
  const { writeMetaPause, writeMetaDependsOn } = await import("../../src/lib/store/kinds/meta/writers.js");
  const { MetaPauseSchema } = await import("../../src/lib/active/meta-schema.js");
  const { recordPut } = await import("../../src/lib/store/lifecycle-write.js");
  const pause = MetaPauseSchema.parse({ pausedBy: "test-user", since: "2026-10-24T00:00:00Z", reason: "Waiting on the provider",
    waitsOn: { kind: "work-unit", slug: "reused" }, resumeNotes: null, open: false });
  if (kind === "paused") lifecycleSuccess(await f.store.write({ ...recordPut(dependent, { content: writeMetaPause(dependent.content, pause) }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const held = lifecycleSuccess(await f.store.read({ reference: dependent.reference })), before = lifecycleSuccess(await f.store.version());
  const result = await repairCli(f, args, { store: f.store });
  expect(result).toMatchObject({ exitCode: 1, result: { outcome: "refused", recommendedPromptText: expect.stringContaining(
    kind === "active" ? "arc wu reconcile --apply" : "arc pause dependent --waits-on") } });
  expect(lifecycleSuccess(await f.store.version())).toBe(before);
  expect(lifecycleSuccess(await f.store.read({ reference: held.reference }))).toEqual(held);
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference }))).toEqual(f.primary);
  expect(lifecycleSuccess(await f.store.read({ reference: archived.reference }))).toEqual(archived);
  expect(await readWorktreeMarker(f.cwd)).toEqual(f.marker);
  expect((await f.exec("git", ["branch", "--list", "feat/reused"])).stdout.trim()).toBe("");
  lifecycleSuccess(await f.store.write({ ...recordPut(held, { content: kind === "active" ? writeMetaDependsOn(held.content, [])
    : writeMetaPause(held.content, { ...pause, waitsOn: null }) }), provenance: { verb: kind === "active" ? "write-back" : "pause", lifecycleAction: "repair" } }));
  expect(await repairCli(f, args, { store: f.store })).toMatchObject({ result: { outcome: "applied", branch: "feat/reused" } });
}, 30_000);
