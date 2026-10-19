/** Stored view content and projected files preserve their own destination semantics. */
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createViewDependencies } from "../../../src/handlers/view.js";
import { resolveViewArtifact } from "../../../src/lib/view-artifact.js";
import { runView } from "../../../src/commands/view.js";
import { conflictViewRecord } from "../../helpers/store/view-conflicts.js";
import { formatConflictToken } from "../../../src/lib/status/conflict-token.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-view-content-")); folders.push(cwd);
  const h = createLifecycleHarness(), meta = await h.seedMeta("demo");
  const spec = await h.seed(recordReferences["work-item/spec"](meta.reference.owner), "# Spec\n\n**Purpose:** Stored intent.\n");
  const { exec } = scriptGitExec([{ match: { predicate: () => true }, responses: [{ failure: { exitCode: 128, stderr: "fatal: not a git repository" } }] }]);
  const deps = createViewDependencies(cwd, path => readFile(path, "utf8"), exec, "alice", h.store);
  const options = { cwd, kind: "spec", project: false, identity: "alice", forSlug: "demo", nonInteractive: true };
  const bindings = { resolveArtifact: (input: Parameters<typeof resolveViewArtifact>[0]) => resolveViewArtifact(input, deps), readFile: deps.readFile };
  return { ...h, cwd, meta, spec, deps, options, bindings };
}

it("renders the selected unprojected record through a distinct store content arm", async () => {
  const f = await fixture();
  expect(await resolveViewArtifact(f.options, f.deps)).toMatchObject({ status: "resolved", source: "store", content: f.spec.content,
    ref: f.spec.version, displayLabel: "demo:spec", workUnit: "demo" });
  const result = await runView(f.options, f.bindings);
  expect(result.exitCode).toBe(0); expect(result.stderr).toBe("");
  expect(result.stdout).toContain("Stored intent.");
});

it.each(["path", "editor"] as const)("gives the store rendering remedy when %s has no projected file", async destination => {
  const f = await fixture();
  const result = await runView({ ...f.options, [destination]: true, editorAllowed: destination === "editor",
    nonInteractive: destination !== "editor" }, { ...f.bindings, launchEditor: async () => { throw new Error("Unprojected content must not launch an editor"); } });
  expect(result.exitCode).toBe(1); expect(result.stdout).toBe("");
  expect(result.stderr).toContain("spec"); expect(result.stderr).toContain("demo");
  expect(result.stderr).toContain("has no file in this checkout");
  expect(result.stderr).toContain("arc view spec --for demo");
  expect(result.stderr).not.toContain("without a registered checkout");
});


it.each([true, false].flatMap(projected => ["display", "path", "editor"].map(destination => ({ projected, destination }))))("retains conflict notices for projected=$projected at $destination", async ({ projected, destination }) => {
  const f = await fixture();
  const current = await conflictViewRecord(f, f.spec, f.spec.content.replace("Stored intent.", "Local intent."), f.spec.content.replace("Stored intent.", "Incoming intent."));
  if (current.conflicts.length === 0) throw new Error("The concurrent writer fixture produced no conflict");
  const path = join(f.cwd, ".arc/active/spec-demo.md"), opened = join(f.cwd, "editor-output.txt");
  const projection = "# Spec\n\n**Purpose:** Projected conflict view.\n";
  if (projected) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, projection); }
  const options = { ...f.options, ...(destination === "display" ? {} : { [destination]: true }),
    editorAllowed: destination === "editor", nonInteractive: destination !== "editor" };
  const result = await runView(options, { ...f.bindings, launchEditor: async selected => { await writeFile(opened, await readFile(selected, "utf8")); } });
  for (const conflict of current.conflicts) expect(result.stderr).toContain(`arc status --conflicts ${formatConflictToken(conflict)}`);
  expect(result.exitCode).toBe(projected || destination === "display" ? 0 : 1);
  if (destination === "display") expect(result.stdout).toContain((projected ? projection : current.content).trim());
  else if (destination === "path" && projected) expect(result.stdout).toBe(`${path}\n`);
  else if (destination === "editor" && projected) expect(await readFile(opened, "utf8")).toBe(projection);
  else { expect(result.stdout).toBe(""); expect(result.stderr).toContain("has no file in this checkout"); }
});
