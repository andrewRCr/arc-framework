/** Archive completion follows native candidate checks and actual state publication. */
import { readFile } from "node:fs/promises";
import { Command, Option } from "commander";
import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { success } from "../helpers/store/suite-tools.js";
import { ArchiveCommandInputSchema } from "../../src/handlers/lifecycle.js";
import { scanCommanderSource } from "../../src/lib/command-input/source-scanner.js";
import { runArchive, type ArchiveResult } from "../../src/lib/work-unit/verbs/archive.js";
import type { ExecuteTransitionContext } from "../../src/lib/work-unit/lifecycle-executor.js";
import { createRefStore, RecordReferenceSchema, runStoreMigrate, runStoreRemote, type Store } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { renderMetaFile } from "../../src/lib/store/kinds/meta/writers.js";

const identity = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "example" } });
const project = "34567890-1234-4234-8234-123456789abc", foreign = "abcdef01-1234-4234-8234-123456789abc";
const provenance = { verb: "seed", lifecycleAction: "create" };

async function archive(store: Store, cwd: string): Promise<ArchiveResult> {
  const registered = scanCommanderSource({ file: "cli.ts", sourceText: await readFile(new URL("../../src/cli.ts", import.meta.url), "utf8") }).commands
    .find(command => command.path === "archive");
  if (!registered) throw new Error("Archive command registration is absent");
  const command = new Command("archive").argument("[slug]").exitOverride();
  for (const option of registered.options) command.addOption(new Option(option.flags).default(option.defaultValue));
  const forbidden = async (): Promise<never> => { throw new Error("Tracked lifecycle access"); };
  const executor: ExecuteTransitionContext = { cwd, store, indexFs: { readdir: forbidden, readFile: forbidden }, setPhase: forbidden,
    relocateArtifacts: forbidden, reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden, writeSoftFields: forbidden,
    writeBranchField: forbidden, writeDesignField: forbidden, writeCurrentWorkflowField: forbidden };
  let result: ArchiveResult | undefined;
  command.action(async (slug: string | undefined, options: unknown) => {
    const input = ArchiveCommandInputSchema.parse({ slug, ...typeof options === "object" && options !== null ? options : {} });
    if (!input.slug) throw new Error("Archive target is absent");
    result = await runArchive({ executor, fs: { readdir: forbidden }, clock: () => new Date("2026-10-14T12:00:00Z") },
      { name: input.slug, prUrl: input.prUrl, completed: input.completed });
  });
  await command.parseAsync(["example"], { from: "user" });
  if (!result) throw new Error("Archive command produced no result");
  return result;
}

it.each(["project-check", "automatic-timeout"] as const)("keeps completion pending after a native %s and succeeds after repair", async failure => {
  const h = await refSyncFixture(), clock = createRefClock(new Date(0), 0);
  success(await h.a.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: failure === "project-check" ? foreign : project }), provenance }));
  await h.a.git(["push", "origin", "refs/arc/*:refs/arc/*"]);
  const remoteRegistry = (await h.remote("git", ["rev-parse", "refs/arc/project/registry"])).stdout.trim();
  success(await h.b.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: project }), provenance }));
  const made = success(await h.b.store.write({ action: "put", reference, expected: null, placement: { kind: "active" }, provenance,
    content: renderMetaFile("example", { state: "Active", owner: "andrew", workClass: "Light", currentWorkflow: "process-task-loop" }) }));
  await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
  let armed = failure === "automatic-timeout";
  const ports = { ...h.b.ports, ...clock, exec: async (...args: Parameters<typeof h.b.ports.exec>) => {
    if (armed && args[1].includes("config") && args[1].includes("remote.origin.arc-state") && args[1].includes("push")) {
      armed = false; clock.advance(120_000);
    }
    return h.b.ports.exec(...args);
  } };
  const store = createRefStore(ports), first = await archive(store, h.b.root);
  expect.soft(first).toMatchObject({ status: "rejected", persisted: true, remedy: { argv: ["arc", "archive", "example"] } });
  const completed = success(await store.read({ reference: made.reference }));
  expect(completed.placement?.kind).toBe("completed");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/archive/"])).stdout).toBe("");
  if (failure === "project-check") await h.b.git(["push", `--force-with-lease=refs/arc/project/registry:${remoteRegistry}`, "origin", "refs/arc/project/registry:refs/arc/project/registry"]);
  expect(await archive(store, h.b.root)).toMatchObject({ status: "archived", destination: { sequence: "01" } });
  expect(success(await store.read({ reference: made.reference })).version).toBe(completed.version);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/archive/2026-q4"])).stdout.trim()).toBe("refs/arc/archive/2026-q4");
}, 30_000);

it.each(["primary", "cohort-closeout"] as const)("completes local-only %s beside unfinished layout cleanup", async stage => {
  const h = await refSyncFixture();
  success(await h.a.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: project }), provenance }));
  const group = success(await h.a.store.write({ action: "put", expected: null, provenance,
    reference: RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "group" } }),
    content: "# Cohort: group\n\n**Purpose:** Complete the local work.\n" }));
  const seed = (name: string) => h.a.store.write({ action: "put", expected: null, placement: { kind: "active" }, provenance,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
    content: renderMetaFile(name, { state: "Active", owner: "andrew", workClass: "Light", currentWorkflow: "process-task-loop", cohort: "group" }) });
  const made = success(await seed("example"));
  if (stage === "cohort-closeout") {
    const sibling = success(await seed("sibling"));
    expect(await archive(h.a.store, h.a.root)).toMatchObject({ status: "archived" });
    expect(success(await h.a.store.read({ reference: group.reference })).placement?.kind).not.toBe("completed");
    const current = success(await h.a.store.read({ reference: sibling.reference }));
    success(await h.a.store.write({ action: "put", reference: current.reference, expected: current.version, provenance,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
      content: renderMetaFile("sibling", { state: "Shipped", owner: "andrew", workClass: "Light", cohort: "group" }) }));
  }
  const remoteBefore = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  await expect(runStoreRemote({ ...h.a.ports, migrateStep: async step => {
    if (step === "layout.delete") throw new Error("Paused source cleanup");
  } }, { remote: "origin", role: "off" })).rejects.toThrow("Paused source cleanup");
  const pushed = success(await h.a.store.push());
  expect(pushed.states).toEqual(expect.arrayContaining([{ status: "no-remote" }, expect.objectContaining({ status: "move-unfinished" })]));
  expect(pushed.publishes).toEqual([]);
  expect(await archive(h.a.store, h.a.root)).toMatchObject({ status: "archived", cohortSwept: expect.stringContaining("cohort-group") });
  const completed = success(await h.a.store.read({ reference: made.reference }));
  const closed = success(await h.a.store.read({ reference: group.reference }));
  expect(completed.placement).toMatchObject({ kind: "completed", sequence: "01" });
  expect(closed.placement).toMatchObject({ kind: "completed", sequence: stage === "primary" ? "01" : "03", closeout: "a" });
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim()).toBe("refs/arc/tmp/migrate/move");
  expect(await archive(h.a.store, h.a.root)).toMatchObject({ status: "archived" });
  expect(success(await h.a.store.read({ reference: made.reference })).version).toBe(completed.version);
  expect(success(await h.a.store.read({ reference: group.reference })).version).toBe(closed.version);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(remoteBefore);
  expect(await runStoreMigrate(h.a.ports)).toMatchObject({ status: "ok" });
  expect(await archive(h.a.store, h.a.root)).toMatchObject({ status: "archived" });
  expect(success(await h.a.store.read({ reference: made.reference })).version).toBe(completed.version);
}, 30_000);
