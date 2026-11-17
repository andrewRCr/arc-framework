/** Archived corrections complete across native worktrees, while cold save leaves archive discovery to sync. */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { expect, it, vi } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { configureEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema, SlugSchema, type Slug } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences, type RecordReference } from "../../../../src/lib/store/identity.js";
import { createRefStore } from "../../../../src/lib/store/create.js";
import { createDefaultRefStorePorts } from "../../../../src/lib/store/default-ports.js";
import { TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";
import { completedCohortPath } from "../../../../src/lib/store/lifecycle-record-path.js";
import { resolveArcPath } from "../../../../src/lib/layout/index.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { registerProjectionHooks } from "../../../../src/lib/store/projection/command-hooks.js";
import { type ProjectionCommandInput } from "../../../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { locateProjection } from "../../../../src/lib/store/projection/location.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { readProjectionStatus } from "../../../../src/lib/store/projection/status.js";
import { restoreSyncProjection } from "../../../../src/lib/store/projection/sync-materialization.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";
import { handleEdit } from "../../../../src/handlers/edit.js";
import { handleSave } from "../../../../src/handlers/save.js";

type Checkout = ProjectionCommandInput & { identity: Slug };

async function command(input: Checkout, args: readonly string[]) {
  const program = new Command("arc").exitOverride(), exit = process.exitCode;
  let output = "", errors = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { errors += String(chunk); return true; });
  program.command("edit <path>").option("--json").action(async (path: string, options: { json?: boolean }) => {
    await handleEdit({ path, ...options }, input.store, input.checkout);
  });
  program.command("save").option("--json").action(async (options: { json?: boolean }) => { await handleSave(options, input.store); });
  program.command("status").option("--json").action(async () => {
    process.stdout.write(JSON.stringify(await readProjectionStatus(input)) + "\n");
  });
  program.command("sync").option("--json").option("--dry-run").action(async (options: { dryRun?: boolean }) => {
    await restoreSyncProjection(input.store, input.checkout, { dryRun: options.dryRun });
    process.stdout.write("{}\n");
  });
  registerProjectionHooks(program, { input: () => input, writeError: text => { errors += text; } });
  try { await program.parseAsync([...args, "--json"], { from: "user" }); }
  finally { stdout.mockRestore(); stderr.mockRestore(); process.exitCode = exit; }
  // Performance notices share stderr with failures; this scenario asserts correction and recovery, not timing.
  const diagnostics = errors.split("\n").filter(line => line !== "" &&
    !/^projection: .+: (command start|fan-out|full materialization) median \d+\.\d ms exceeds \d+ ms\.$/.test(line));
  expect(diagnostics).toEqual([]);
  return JSON.parse(output) as unknown;
}

async function index(input: Checkout) {
  const location = await locateProjection(input.checkout, createProjectionEnginePorts(input.checkout));
  const disk = await readProjectionIndex(location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("No usable archive index");
  return { location, index: disk.index };
}

async function edit(input: Checkout, path: string, content: string): Promise<void> {
  const entry = (await index(input)).index.entries[path];
  if (entry?.kind !== "record") throw new Error(`Missing archive record: ${path}`);
  await writeFile(join(input.checkout, path), renderStampedFile({ content, stamp: entry.base.blob }));
}

async function opened(input: Checkout, path: string): Promise<void> {
  expect((await index(input)).index.entries[path]).toHaveProperty("opened", true);
  expect((await stat(join(input.checkout, path))).mode & 0o200).toBe(0o200);
}

async function relocked(input: Checkout, path: string): Promise<void> {
  expect(await command(input, ["save"])).toMatchObject({ status: "ok", result: {
    relocked: expect.arrayContaining([expect.objectContaining({ path, remedy: { text: expect.stringContaining(`arc edit ${path}`) } })]),
  } });
  expect((await index(input)).index.entries[path]).not.toHaveProperty("opened");
  expect((await stat(join(input.checkout, path))).mode & 0o222).toBe(0);
}

it("corrects owned and shared archive records across native worktrees, then repairs a cold partition with sync", async () => {
  const quarter = ArchiveQuarterSchema.parse("2026-q4");
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter } }), { f } = h;
  const primary: Checkout = { checkout: f.root, store: f.store, identity: SlugSchema.parse("andrew") };
  const meta = Object.keys(h.projected.index.entries)[0]!;
  const owner = (name: string) => OwnerIdentitySchema.parse({ type: "work-item", name });
  const holder = async (name: string, identity: string) => seed(f, recordReferences["work-item/meta"](owner(name)),
    makeMetaFixture(name, { state: "Active", owner: identity, currentWorkflow: "process-task-loop", workClass: "Light", priority: "P1" }), { kind: "active" });
  const own = await holder("owner-work", "andrew"), peer = await holder("peer-work", "bob");
  await seed(f, recordReferences["work-item/meta"](owner("cold")),
    makeMetaFixture("cold", { state: "Shipped", owner: "andrew", currentWorkflow: null }),
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3") });
  const body = "# Cohort: shared\n\n**Parent:** [none]\n\n**Purpose:** Coordinate archived work.\n";
  const liveCohort = await seed(f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "shared" })), body);
  success(await f.store.write({ ...update(f, liveCohort, body), placement: { kind: "completed", quarter },
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const cohort = success(await f.store.read({ reference: liveCohort.reference })), cohortPath = completedCohortPath(cohort);
  const errand = async (name: string, claimId: string, existing: boolean) => {
    const record = await seed(f, recordReferences["work-item/record"](owner(name)), JSON.stringify(TransientIdentityRecordSchema.parse({
      version: 3, kind: "errand", purpose: "errand", slug: name, claimId, createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z", intent: "An archived correction", branch: `chore/${name}`, owner: "andrew",
      origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null,
    })), { kind: "completed", quarter });
    const reference = recordReferences["work-item/description"](record.reference.owner);
    if (existing) await seed(f, reference, "## Description\n\nOriginal archived description.\n");
    return { reference, path: resolveArcPath({ kind: "errand-description", slug: SlugSchema.parse(name), placement: { kind: "completed", quarter } }) };
  };
  const fresh = await errand("fresh-note", "a".repeat(32), false), existing = await errand("existing-note", "b".repeat(32), true);
  await f.ports.exec("git", ["config", "extensions.worktreeConfig", "true"], { cwd: f.root });
  const linked = async (record: typeof own, identity: string): Promise<Checkout> => {
    const checkout = join(f.root, ".arc-fixture", record.reference.owner.name);
    await f.ports.exec("git", ["worktree", "add", "-b", `feat/${record.reference.owner.name}`, checkout], { cwd: f.root });
    await configureEngineCheckout(checkout);
    await f.ports.exec("git", ["config", "--worktree", "arc.identity", identity], { cwd: checkout });
    await writeWorktreeMarker(checkout, { spawnedByArc: true, spawningIdentity: identity, createdAt: new Date(0).toISOString(),
      createdFor: boundWorkUnitSubject(record) });
    const native = createRefStore(createDefaultRefStorePorts({ checkoutRoot: checkout, backingRepository: async () => null }));
    return { checkout, identity: SlugSchema.parse(identity), store: withFanOut(native, createProjectionFanOutDependencies(checkout)) };
  };
  const correction = await linked(own, "andrew"), reviewer = await linked(peer, "bob");
  for (const checkout of [primary, correction, reviewer]) expect(await command(checkout, ["status"])).toMatchObject({ kind: "ready" });
  expect(success(await correction.store.history({ reference: h.primary.reference })).length).toBeGreaterThan(0);

  expect(await command(correction, ["edit", join(correction.checkout, meta)])).toMatchObject({ status: "ok" });
  let content = h.primary.content;
  for (const note of ["First archived correction.", "Second archived correction."]) {
    content += `\n${note}\n`;
    await edit(correction, meta, content);
    expect(await command(correction, ["status"])).toMatchObject({ kind: "ready", files: expect.arrayContaining([
      expect.objectContaining({ path: meta, opened: true }),
    ]) });
    expect(success(await f.store.read({ reference: h.primary.reference })).content).toBe(content);
    await opened(correction, meta);
    expect(await readFile(join(primary.checkout, meta), "utf8")).toContain(note);
    expect((await stat(join(primary.checkout, meta))).mode & 0o222).toBe(0);
  }
  await relocked(correction, meta);

  const adopt = async (path: string, reference: RecordReference, text: string) => {
    expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    await mkdir(dirname(join(correction.checkout, path)), { recursive: true });
    await writeFile(join(correction.checkout, path), text);
    expect(await command(correction, ["edit", join(correction.checkout, path)])).toMatchObject({ status: "ok" });
    await command(correction, ["status"]);
    expect(success(await f.store.read({ reference })).content).toBe(text);
    await opened(correction, path);
    await relocked(correction, path);
    expect((await stat(join(primary.checkout, path))).mode & 0o222).toBe(0);
  };
  await adopt(`${h.folder}/correction.md`, recordReferences["work-item/companion"](h.primary.reference.owner, "correction.md"), "A new archived companion.\n");
  await adopt(fresh.path, fresh.reference, "## Description\n\nNew archived Errand description.\n");

  for (const [checkout, path, reference, text] of [
    [reviewer, cohortPath, cohort.reference, body + "\nA correction by another person.\n"],
    [correction, existing.path, existing.reference, "## Description\n\nAn owner's archived correction.\n"],
  ] as const) {
    expect(await command(checkout, ["edit", join(checkout.checkout, path)])).toMatchObject({ status: "ok" });
    await edit(checkout, path, text);
    await relocked(checkout, path);
    expect(success(await f.store.read({ reference })).content).toBe(text);
    expect((await stat(join(primary.checkout, path))).mode & 0o222).toBe(0);
  }

  await command(correction, ["status"]);
  const disk = await index(correction);
  const header = JSON.parse(await readFile(join(disk.location.stateDir, "index"), "utf8")) as {
    groups: Record<string, { name: string; unsettled: boolean }>;
  };
  const cold = header.groups[".arc/completed/2026-q3"];
  if (cold === undefined || cold.unsettled) throw new Error("No settled cold archive quarter");
  const partition = join(disk.location.stateDir, cold.name), damaged = "A deliberately mismatched cold archive partition.\n";
  await writeFile(partition, damaged);
  const native = createProjectionEnginePorts(correction.checkout);
  const noArchive: Checkout = { ...correction, ports: () => ({ ...native, walkFs: { readdir: path => {
    if (path.replaceAll("\\", "/").includes("/.arc/completed")) throw new Error("Save must not discover archive folders");
    return readdirSync(path, { withFileTypes: true });
  } } }) };
  expect(await command(noArchive, ["save"])).toMatchObject({ status: "ok" });
  expect(await readFile(partition, "utf8")).toBe(damaged);
  const refusal = await checkProjectionRemoval(correction.checkout, { store: correction.store, identity: correction.identity });
  expect(refusal).toMatchObject({ kind: "unobservable", detail: expect.stringContaining("arc sync") });
  await command(correction, ["sync"]);
  expect((await index(correction)).index.entries[meta]).not.toHaveProperty("opened");
  expect(await checkProjectionRemoval(correction.checkout, { store: correction.store, identity: correction.identity })).toEqual({ kind: "passes" });
  expect(success(await f.store.read({ reference: h.primary.reference })).content).toBe(content);
}, 240_000);
