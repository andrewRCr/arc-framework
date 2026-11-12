/** Real transient allocation, editor output, and marker-free writer failure. */
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeProvisioningDependencies, type NodeProvisioningRuntimeOptions } from "../../../src/lib/locus/provisioning-runtime.js";
import { provisionTransientLocus } from "../../../src/lib/locus/provisioning.js";
import type { LocusIdentityV1 } from "../../../src/lib/locus/schema/identity.js";
import { readWorktreeMarkerGeneration } from "../../../src/lib/git/worktree-marker.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import { EditorDocumentsWriteError } from "../../../src/lib/schema-command/editor-documents.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../../helpers/integration.js";

const directory = resolveArcPath({ kind: "editor-document-root" });
const branch = "chore/editor";
const identity: LocusIdentityV1 = { kind: "errand", key: "editor", claimId: "a".repeat(32), protection: "full",
  branch, purpose: "errand", origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null };
describe("transient editor-document provisioning", () => {
  let root: string;
  let linked: string;
  beforeEach(async () => {
    root = await createTempRepo("arc-transient-documents-");
    linked = `${root}-editor`;
    const exec = makeGitExec(root);
    await writeFile(join(root, ".gitignore"), "# existing rules\n");
    await exec("git", ["add", ".gitignore"]);
    await exec("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "seed"]);
  });
  afterEach(async () => { await Promise.all([cleanupTempDir(linked), cleanupTempDir(root)]); });

  function provision(allocation: "spawn" | "primary", writeEditorDocuments?: NodeProvisioningRuntimeOptions["writeEditorDocuments"]) {
    const exec = makeGitExec(root);
    return provisionTransientLocus({ proposal: { kind: "proposal",
      allocation: allocation === "spawn" ? { kind: "spawn", primaryPath: root } : { kind: "primary", checkoutPath: root },
      subject: { kind: "errand", key: identity.key, claimId: identity.claimId } },
      protection: "full", identity, branch, expectedBranchHead: null, base: "main", locationTemplate: linked,
      repo: "repo", spawningIdentity: "test-user", parentCheckoutPath: null, establishedAt: "2026-10-08T00:00:00.000Z",
      dependencies: createNodeProvisioningDependencies({ exec, base: "main", branch, postCreateScript: "",
        registeredHarnessDirs: "", writeEditorDocuments }),
    });
  }

  it("writes the directory and exclude before publishing the spawned ready marker", async () => {
    expect(await provision("spawn")).toMatchObject({ kind: "provisioned", receipt: { allocation: "spawned" } });
    expect((await stat(join(linked, directory))).isDirectory()).toBe(true);
    expect((await readFile(join(root, ".git/info/exclude"), "utf8")).split(/\r?\n/u)).toContain(`${directory}/`);
    expect(await readWorktreeMarkerGeneration(linked)).toMatchObject({ kind: "present", marker: { provisioning: "ready" } });
    expect(await readFile(join(linked, ".gitignore"), "utf8")).toBe("# existing rules\n");
    expect((await makeGitExec(root)("git", ["status", "--porcelain"], { cwd: linked })).stdout).toBe("");
  });

  it.each(["spawn", "primary"] as const)("leaves no allocated branch or marker after a %s writer failure", async (allocation) => {
    const result = await provision(allocation, async () => ({ ok: false, target: "documents", detail: "documents denied" }));
    expect(result).toMatchObject({ kind: "error", error: expect.any(EditorDocumentsWriteError), evidence: { kind: "identity-only" } });
    const exec = makeGitExec(root);
    expect((await exec("git", ["for-each-ref", "--format=%(refname)", `refs/heads/${branch}`])).stdout).toBe("");
    expect(await readWorktreeMarkerGeneration(root)).toEqual({ kind: "absent" });
    expect((await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim()).toBe("main");
    if (allocation === "spawn") {
      await expect(stat(linked)).rejects.toMatchObject({ code: "ENOENT" });
      expect((await exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(linked);
    }
  });
});
