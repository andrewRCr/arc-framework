/** Registered view commands read one selected store and preserve file/content destinations. */
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaDesign } from "../../src/lib/store/kinds/meta/writers.js";
import { formatConflictToken } from "../../src/lib/status/conflict-token.js";
import { writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { conflictViewRecord } from "../helpers/store/view-conflicts.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { runHandlerAt } from "../helpers/handler.js";
import { parseMetaRecord, type MetaRenderOverrides } from "../../src/lib/active/meta-reader.js";

const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/handlers/lifecycle-shared.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/handlers/lifecycle-shared.js")>();
  return { ...original, openDefaultStore: (...args: Parameters<typeof original.openDefaultStore>) => binding.store ?? original.openDefaultStore(...args) };
});
async function fixture(fields: MetaRenderOverrides = {}) {
  const cwd = await createTempRepo();
  onTestFinished(async () => { binding.store = null; await cleanupTempDir(cwd); });
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\n");
  await makeGitExec(cwd)("git", ["config", "arc.identity", "alice"]);
  const h = createLifecycleHarness(), meta = await h.seedMeta("demo", { owner: "alice", ...fields });
  const spec = await h.seed(recordReferences["work-item/spec"](meta.reference.owner), "# Spec\n\n**Purpose:** Selected record content.\n");
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, spawningIdentity: "alice", now: 0, createdFor: boundWorkUnitSubject(meta) });
  binding.store = h.store;
  return { ...h, cwd, meta, spec, run: (args: string[]) => runHandlerAt(cwd, () => dispatchRegisteredCli(["--no-input", "view", ...args])) };
}

// The command's default store keeps its own state under `.git`; view itself writes nothing in the working tree.
async function workingTree(cwd: string): Promise<Record<string, string | null>> {
  const entries = await readdir(cwd, { recursive: true, withFileTypes: true });
  const snapshot = await Promise.all(entries.map(async entry => {
    const file = join(entry.parentPath, entry.name);
    const path = relative(cwd, file);
    if (/^\.git(?:[\\/]|$)/u.test(path)) return [];
    const digest = entry.isFile() ? createHash("sha256").update(await readFile(file)).digest("hex") : null;
    return [[path, digest] as const];
  }));
  return Object.fromEntries(snapshot.flat());
}

it("renders the claimed work unit's furthest record without a projected file or file writes", async () => {
  const f = await fixture(), before = await workingTree(f.cwd);
  const result = await f.run([]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Selected record content.");
  expect(await workingTree(f.cwd)).toEqual(before);
}, 30_000);

it("reads the explicitly named Planning unit at the pause gate from an Integrating checkout", async () => {
  const f = await fixture({ state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const name = "other";
  await f.seedMeta(name, { owner: "alice", state: "Planning", currentWorkflow: "draft-design" });
  const named = await f.run(["meta", "--for", name]);
  expect(named.exitCode, named.stderr).toBe(0);
  expect(parseMetaRecord(named.stdout).state).toBe("Planning");
  const workflow = await readFile(join(import.meta.dirname,
    "../../arc/system/workflows/arc/work-unit-lifecycle/park-work-unit.md"), "utf8");
  const gate = workflow.slice(workflow.indexOf("### 1)"), workflow.indexOf("### 2)"));
  const reads = [...gate.matchAll(/`arc view (meta[^`]*)`/gu)].map(match => match[1]);
  const command = reads.find(read => read?.includes("--for")) ?? reads[0];
  if (!command) throw new Error("Missing meta read in the pause gate");
  const result = await f.run(command.replace("{name}", name).split(/\s+/u));
  expect(result.exitCode, result.stderr).toBe(0);
  expect(parseMetaRecord(result.stdout).state, `pause gate for ${name}`).toBe("Planning");
}, 30_000);

it("keeps integration's paired-design presence check sensitive to a missing declared RFC", async () => {
  const f = await fixture();
  await writeFile(join(f.cwd, ".gitignore"), ".arc/user/*/\n");
  const meta = await f.seedMeta("layered", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const companion = (key: string) => recordReferences["work-item/companion"](meta.reference.owner, key);
  const prd = await f.seed(companion("spec-prd"), "# PRD\n\n**Purpose:** Product requirements.\n");
  const rfc = await f.seed(companion("spec-rfc"), "# RFC\n\n**Purpose:** Technical design.\n");
  const names = ["spec-layered-prd.md", "spec-layered-rfc.md"];
  lifecycleSuccess(await f.store.write({ ...recordPut(meta, { content: writeMetaDesign(meta.content, names) }),
    provenance: { verb: "repoint-design", lifecycleAction: "spec-finalized" } }));

  const workflow = await readFile(join(import.meta.dirname,
    "../../arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8");
  const step = workflow.split("### 4) Spec-presence + alignment checks")[1]?.split("### 5)")[0];
  expect(step).toMatch(/Design:[\s\S]*`arc view meta --for \{name\}`/u);
  expect(step).toMatch(/every declared spec file[\s\S]*both[\s\S]*-prd\.md` and `spec-\{name\}-rfc\.md`/u);
  expect(step).toMatch(/missing or unreadable[\s\S]*stop and name[\s\S]*repeat this check/u);

  const metaPath = join(f.cwd, ".arc/active/in-flight/layered/meta-layered.md");
  const folder = dirname(metaPath);
  await mkdir(folder, { recursive: true });
  await writeFile(metaPath, writeMetaDesign(meta.content, names));
  await writeFile(join(folder, "spec-layered-prd.md"), prd.content);
  await writeFile(join(folder, "spec-layered-rfc.md"), rfc.content);

  expect(await f.run(["spec", "--for", "layered"])).toMatchObject({ exitCode: 0, stdout: "spec is not present.\n" });
  const pathCommand = step?.match(/`arc view (meta --for \{name\} --path)`/u)?.[1];
  if (pathCommand === undefined) throw new Error("Missing named projection lookup");
  const projection = await f.run(pathCommand.replace("{name}", "layered").split(/\s+/u));
  expect(projection.exitCode, projection.stderr).toBe(0);
  expect(projection.stdout).toBe(`${metaPath}\n`);
  const design = parseMetaRecord((await f.run(["meta", "--for", "layered"])).stdout).design;
  expect(design).toEqual(names);
  const readDesign = (name: string) => readFile(join(dirname(projection.stdout.trim()), name), "utf8");
  await expect(readDesign("spec-layered-prd.md")).resolves.toBe(prd.content);
  await expect(readDesign("spec-layered-rfc.md")).resolves.toBe(rfc.content);

  lifecycleSuccess(await f.store.write({ action: "remove", reference: rfc.reference, expected: rfc.version,
    provenance: { verb: "remove", lifecycleAction: "edit" } }));
  await rm(join(folder, "spec-layered-rfc.md"));
  await expect(readDesign("spec-layered-prd.md")).resolves.toBe(prd.content);
  await expect(readDesign("spec-layered-rfc.md")).rejects.toMatchObject({ code: "ENOENT" });
}, 30_000);

it("keeps a projected conflict's path usable and emits its notice in text and path modes", async () => {
  const f = await fixture(), current = await conflictViewRecord(f, f.spec,
    f.spec.content.replace("Selected record content.", "Local intent."), f.spec.content.replace("Selected record content.", "Incoming intent."));
  if (current.conflicts.length === 0) throw new Error("Expected genuine merge conflict evidence");
  // The checkout claims the work unit, so its projected files sit in the claimed active folder.
  const path = join(f.cwd, ".arc/active/current/spec-demo.md");
  await mkdir(join(f.cwd, ".arc/active/current"), { recursive: true });
  await writeFile(path, "# Spec\n\n**Purpose:** Projected content.\n");
  const result = await f.run(["spec", "--for", "demo", "--path"]);
  expect(result.exitCode, result.stderr).toBe(0); expect(result.stdout).toBe(`${path}\n`);
  for (const conflict of current.conflicts) expect(result.stderr).toContain(`arc status --conflicts ${formatConflictToken(conflict)}`);
  const text = await f.run(["spec", "--for", "demo"]);
  expect(text.exitCode).toBe(0); expect(text.stdout).toContain("Projected content.");
  for (const conflict of current.conflicts) expect(text.stderr).toContain(`arc status --conflicts ${formatConflictToken(conflict)}`);
}, 30_000);

it("refuses a registered path request for unprojected record content with the rendering remedy", async () => {
  const f = await fixture(), result = await f.run(["spec", "--for", "demo", "--path"]);
  expect(result.exitCode).toBe(1); expect(result.stdout).toBe("");
  expect(result.stderr).toContain("has no file in this checkout");
  expect(result.stderr).toContain("arc view spec --for demo");
  expect(result.stderr).not.toContain("without a registered checkout");
}, 30_000);

it("detects an in-place config overwrite in the working-tree snapshot", async () => {
  const { cwd } = await fixture();
  const before = await workingTree(cwd);
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: next\n");
  expect(await workingTree(cwd)).not.toEqual(before);
}, 30_000);
