/** Decomposition editor provisioning, retry on owned candidates, and partial isolation. */
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import { executeGitV3DecomposeCommand, executeGitV3ExtractionCommand, type GitV3DecomposeOperationDependencies } from "../../../src/lib/work-unit/git-decompose-v3-operation.js";
import type { V3DecomposeCutMap } from "../../../src/lib/work-unit/decompose-v3-schema.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../../helpers/integration.js";
import { runCli } from "../../helpers/run-cli.js";

const execFileAsync = promisify(execFile);
const directory = resolveArcPath({ kind: "editor-document-root" });
const draft = "# Draft: origin\n\n- **Origin:** [internal]\n- **Purpose:** Split this concern.\n\n---\n\n## Problem / Motivation\n\nOne concern.\n\n## Alternatives\n\nAn alternative.\n\n## Unknowns and Assumptions\n\nAn unknown.\n\n## Scope Estimate\n\nMedium.\n";
const meta = (active: boolean) => renderMetaFile("origin", { state: "Planning", owner: "test-user", workClass: "Heavy",
  priority: "P1", origin: "internal", design: ["draft-origin.md"], currentWorkflow: "draft-design",
  nextAction: "Begin draft-design", ...(active ? { branch: "plan/origin" } : {}) });

describe("decomposition editor-document provisioning", () => {
  let root: string;
  let dependencies: GitV3DecomposeOperationDependencies;
  beforeEach(async () => {
    root = await createTempRepo("arc-decomposition-documents-");
    const exec = makeGitExec(root);
    async function write(path: string, contents: string) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), contents);
    }
    await write(".arc/system/arc-config.yml", "branch.base: main\nbranch.protection: full\npm.mode: arc-in-git\n");
    await write(".arc/backlog/ROADMAP.md", "# Roadmap: Project Status\n");
    await write(".arc/backlog/planned/origin/draft-origin.md", draft);
    await write(".arc/backlog/planned/origin/meta-origin.md", meta(false));
    await write(".arc/reference/shared.txt", "shared\n");
    await exec("git", ["add", "."]);
    await exec("git", ["commit", "-m", "prepare base"]);
    await exec("git", ["switch", "-c", "plan/origin"]);
    await mkdir(join(root, ".arc/active"));
    for (const name of ["draft", "meta"]) await exec("git", ["mv", `.arc/backlog/planned/origin/${name}-origin.md`, `.arc/active/${name}-origin.md`]);
    await write(".arc/active/meta-origin.md", meta(true));
    await exec("git", ["add", "."]);
    await exec("git", ["commit", "-m", "start origin"]);
    await exec("git", ["init", "--bare", ".git/test-origin.git"]);
    await exec("git", ["remote", "add", "origin", ".git/test-origin.git"]);
    await exec("git", ["push", "origin", "main", "plan/origin"]);
    await exec("git", ["switch", "main"]);
    dependencies = { cwd: root, exec, spawningIdentity: "test-user",
      cohortTemplate: await readFile("arc/reference/templates/arc/work-unit/template-cohort.md"),
      readBlob: async (ref, path) => {
        try { return new Uint8Array((await execFileAsync("git", ["show", `${ref}:${path}`], { cwd: root, encoding: "buffer" })).stdout); }
        catch { return null; }
      },
      readObject: async (oid) => new Uint8Array((await execFileAsync("git", ["cat-file", "-p", oid], { cwd: root, encoding: "buffer" })).stdout),
    };
  });
  afterEach(async () => {
    const roster = (await makeGitExec(root)("git", ["worktree", "list", "--porcelain"])).stdout;
    for (const line of roster.split("\n")) if (line.startsWith("worktree ") && line.slice(9) !== root) await cleanupTempDir(line.slice(9));
    await cleanupTempDir(root);
  });

  async function command(mode: "execute" | "extract", protection: "full" | "partial" = "full") {
    await writeFile(join(root, ".arc/system/arc-config.yml"), `branch.base: main\nbranch.protection: ${protection}\npm.mode: arc-in-git\n`);
    const preflight = await runCli(["decompose", "origin", "--preflight"], { cwd: root });
    expect(preflight.exitCode, preflight.stderr).toBe(0);
    const starter = JSON.parse(preflight.stdout) as V3DecomposeCutMap;
    const extraction = mode === "extract";
    const completedMap = { schemaVersion: 3, machine: starter.machine, authoring: {
      shape: extraction ? "extraction" : "heterogeneous", placement: { kind: "direct-member" },
      destinations: [...(extraction ? [] : [{ kind: "existing-home", destinationId: "existing", target: { kind: "document", path: ".arc/reference/shared.txt" } }]),
        { kind: "new-member", destinationId: "member", slug: "member", workClass: "Heavy" }],
      internalEdges: [], externalEdges: [], incomingDispositions: [], outgoingDispositions: [],
      sourceAllocations: starter.machine.sourceUnits.map((unit, index) => ({ sourceId: unit.sourceId, ownership: "destination-owned",
        disposition: extraction && index === 0 ? { kind: "retained-origin" } : { kind: "target", destinationId: "member",
          targetLocator: { ...unit.sourceLocator, artifact: "draft-member.md" } } })),
    } };
    const cutMapPath = join(root, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    const execute = extraction ? executeGitV3ExtractionCommand : executeGitV3DecomposeCommand;
    return () => execute(dependencies, { protection, baseBranch: "main", origin: "origin", cutMapPath });
  }

  it.each(["execute", "extract"] as const)("provisions a full-protection %s candidate", async (mode) => {
    const result = await (await command(mode))();
    expect(result.status, JSON.stringify(result)).toBe("staged");
    if (result.status !== "staged" || result.operation.occupation.protection !== "full") throw new Error(JSON.stringify(result));
    expect((await stat(join(result.operation.occupation.path, directory))).isDirectory()).toBe(true);
    expect((await readFile(join(root, ".git/info/exclude"), "utf8")).split(/\r?\n/u)).toContain(`${directory}/`);
  });

  it.each(["execute", "extract"] as const)("retries %s after a writer failure on its owned candidate", async (mode) => {
    const execute = await command(mode);
    dependencies.writeEditorDocuments = async () => ({ ok: false, target: "documents", detail: "documents denied" });
    const failed = await execute();
    expect(failed).toMatchObject({ status: "refused", stage: "occupation", reason: "occupation-failed" });
    expect(failed.status === "refused" ? failed.remedy.argv : []).toContain(`--${mode}`);
    const candidateBranch = "chore/decompose-origin";
    const before = (await dependencies.exec("git", ["worktree", "list", "--porcelain"])).stdout;
    expect(before).toContain(candidateBranch);
    dependencies.writeEditorDocuments = undefined;
    const retried = await execute();
    expect(retried.status).toBe("staged");
    if (retried.status !== "staged" || retried.operation.occupation.protection !== "full") throw new Error(JSON.stringify(retried));
    expect((await stat(join(retried.operation.occupation.path, directory))).isDirectory()).toBe(true);
    expect((await dependencies.exec("git", ["worktree", "list", "--porcelain"])).stdout).toBe(before);
    expect((await readFile(join(root, ".git/info/exclude"), "utf8")).split(/\r?\n/u)).toContain(`${directory}/`);
  });

  it.each(["execute", "extract"] as const)("skips editor provisioning under partial protection for %s", async (mode) => {
    const execute = await command(mode, "partial");
    dependencies.writeEditorDocuments = async () => ({ ok: false, target: "documents", detail: "must not run" });
    const result = await execute();
    expect(result.status, JSON.stringify(result)).toBe("staged");
    await expect(stat(join(root, directory))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(root, ".git/info/exclude"), "utf8")).not.toContain(`${directory}/`);
  });
});
