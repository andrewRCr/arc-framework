import { describe, expect, it } from "vitest";

import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  prepareGitGraduationTransaction,
  type GitGraduationTransactionDependencies,
  type PrepareGitGraduationTransactionInput,
} from "../../../src/lib/work-unit/git-graduation-transaction.js";

const HEAD = "a".repeat(40);
const TREE = "b".repeat(40);
const INDEX = "c".repeat(40);
const META_OID = "d".repeat(40);
const DRAFT_OID = "e".repeat(40);
const SOURCE = ".arc/backlog/planned/widget";
const TARGET = ".arc/active";

function meta(owner = "andrew"): Uint8Array {
  return new TextEncoder().encode(renderMetaFile("widget", {
    state: "Planning",
    owner,
    workClass: "Heavy",
    design: ["draft-widget.md"],
    currentWorkflow: "create-spec",
  }));
}

function dependencies(options: {
  drift?: "source" | "destination" | "branch" | "worktree" | "index";
  metaBytes?: Uint8Array;
  forbidWriteTree?: boolean;
  extraArtifact?: { basename: string; head: string; tree: string };
} = {}): GitGraduationTransactionDependencies {
  let metaReads = 0;
  let targetReads = 0;
  let branchReads = 0;
  let worktreeReads = 0;
  let indexReads = 0;
  const exec: GitExec = async (_command, args) => {
    const key = args.join(" ");
    if (key === "rev-parse --verify base^{commit}") return { stdout: `${options.extraArtifact?.head ?? HEAD}\n` };
    if (key === "rev-parse --verify base^{tree}") return { stdout: `${options.extraArtifact?.tree ?? TREE}\n` };
    if (key === "rev-parse --verify HEAD^{tree}") return { stdout: `${TREE}\n` };
    if (key === "write-tree") {
      if (options.forbidWriteTree === true) throw new Error("write-tree must not run for spawned graduation");
      indexReads += 1;
      return { stdout: `${options.drift === "index" && indexReads > 1 ? "f".repeat(40) : INDEX}\n` };
    }
    if (key === `ls-tree --full-tree -r -z base -- ${SOURCE}`) {
      return {
        stdout:
          `100644 blob ${META_OID}\t${SOURCE}/meta-widget.md\0`
          + `100755 blob ${DRAFT_OID}\t${SOURCE}/draft-widget.md\0`
          + (options.extraArtifact === undefined ? ""
            : `100644 blob ${"1".repeat(40)}\t${SOURCE}/${options.extraArtifact.basename}\0`),
      };
    }
    if (key === `ls-tree --full-tree -r -z base -- ${TARGET}`) {
      targetReads += 1;
      return {
        stdout: options.drift === "destination" && targetReads > 1
          ? `100644 blob ${META_OID}\t${TARGET}/meta-widget.md\0`
          : "",
      };
    }
    if (key === "for-each-ref --format=%(refname) refs/heads/plan/widget") {
      branchReads += 1;
      return {
        stdout: options.drift === "branch" && branchReads > 1
          ? "refs/heads/plan/widget\n"
          : "",
      };
    }
    if (key === "worktree list --porcelain") {
      worktreeReads += 1;
      return {
        stdout:
          `worktree /repo\nHEAD ${HEAD}\nbranch refs/heads/main\n\n`
          + (options.drift === "worktree" && worktreeReads > 1
            ? `worktree /wt\nHEAD ${HEAD}\nbranch refs/heads/other\n\n`
            : ""),
      };
    }
    if (key.startsWith("ls-files --stage -z -- ")) {
      return {
        stdout:
          `100755 ${DRAFT_OID} 0\t${SOURCE}/draft-widget.md\0`
          + `100644 ${META_OID} 0\t${SOURCE}/meta-widget.md\0`,
      };
    }
    throw new Error(`unexpected git call: ${key}`);
  };
  return {
    exec,
    readBlob: async (_ref, path) => {
      if (options.extraArtifact !== undefined && path === `${SOURCE}/${options.extraArtifact.basename}`) {
        return new TextEncoder().encode("# Research\n");
      }
      if (path.endsWith("meta-widget.md")) {
        metaReads += 1;
        if (options.metaBytes !== undefined) return options.metaBytes;
        return options.drift === "source" && metaReads > 1 ? meta("someone-else") : meta();
      }
      if (path.endsWith("draft-widget.md")) return new TextEncoder().encode("# Draft\n");
      return null;
    },
    readWorktreeFile: async (path) => {
      if (path === `${SOURCE}/meta-widget.md`) return meta();
      if (path === `${SOURCE}/draft-widget.md`) return new TextEncoder().encode("# Draft\n");
      return null;
    },
    pathExists: async () => false,
  };
}

describe("prepareGitGraduationTransaction", () => {
  it("captures and revalidates exact stored, destination, branch, worktree, and index facts", async () => {
    const result = await prepareGitGraduationTransaction(dependencies({ forbidWriteTree: true }), {
      cwd: "/repo",
      slug: "widget",
      location: "planned",
      sourceRef: "base",
      sourceDirectory: SOURCE,
      targetDirectory: TARGET,
      mode: "spawned",
      worktreePath: "/wt",
      classResolution: { kind: "preserved", value: "Heavy" },
      spawn: {
        locationTemplate: "../{repo}.{name}",
        repo: "repo",
        spawningIdentity: "andrew",
      },
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.transaction.source.artifacts).toHaveLength(2);
    expect(result.transaction.source.artifacts[0]).toMatchObject({
      objectKind: "blob",
      mode: "100755",
      oid: DRAFT_OID,
    });
    expect(result.transaction.occupation).toEqual({
      mode: "spawned",
      baseHead: HEAD,
      branch: { kind: "absent", ref: "refs/heads/plan/widget" },
      worktree: { kind: "absent", path: "/wt" },
      indexTree: TREE,
      operation: {
        kind: "spawned",
        branch: "plan/widget",
        base: HEAD,
        worktreePath: "/wt",
        locationTemplate: "../{repo}.{name}",
        repo: "repo",
        wuName: "widget",
        spawningIdentity: "andrew",
      },
    });
  });

  it.each(["rename", "move out"] as const)("names the unexpected artifact repair and allows retry after %s", async (repair) => {
    const request: PrepareGitGraduationTransactionInput = {
      cwd: "/repo", slug: "widget", location: "planned", sourceRef: "base", sourceDirectory: SOURCE,
      targetDirectory: TARGET, mode: "spawned", worktreePath: "/wt",
      classResolution: { kind: "preserved", value: "Heavy" },
      spawn: { locationTemplate: "../{repo}.{name}", repo: "repo", spawningIdentity: "andrew" },
    };
    const refusal = await prepareGitGraduationTransaction(dependencies({ forbidWriteTree: true,
      extraArtifact: { basename: "research.md", head: "f".repeat(40), tree: "9".repeat(40) },
    }), request);
    expect(refusal).toMatchObject({ status: "refused", reason: "source-shape", locus: SOURCE });
    if (refusal.status !== "refused") throw new Error("Expected an artifact-shape refusal");
    expect(refusal.detail).toContain(`${SOURCE}/research.md`);
    expect(refusal.detail).toContain("Rename a regular file to <kind>-widget.md");
    expect(refusal.detail).toContain(`directly inside ${SOURCE}`);
    expect(refusal.detail).toContain("move this entry out of the directory");
    expect(refusal.detail).toContain("Commit the repair to the configured base branch");
    expect(refusal.detail).toContain("push or merge it there when origin is available");
    expect(refusal.detail).toContain("rerun arc start widget");
    const unchangedSource = await prepareGitGraduationTransaction(dependencies({ forbidWriteTree: true,
      extraArtifact: { basename: "research.md", head: "f".repeat(40), tree: "9".repeat(40) },
    }), request);
    expect(unchangedSource).toMatchObject({ status: "refused", reason: "source-shape", locus: SOURCE });
    const retried = await prepareGitGraduationTransaction(dependencies({ forbidWriteTree: true,
      ...(repair === "rename" ? { extraArtifact: { basename: "notes-widget.md", head: HEAD, tree: TREE } } : {}),
    }), request);
    expect(retried.status).toBe("ready");
    if (retried.status !== "ready") throw new Error("Expected successful retry after artifact repair");
    expect(retried.transaction.source.artifacts.map(({ basename }) => basename)).toEqual(repair === "rename"
      ? ["draft-widget.md", "meta-widget.md", "notes-widget.md"] : ["draft-widget.md", "meta-widget.md"]);
    expect(retried.transaction.occupation.baseHead).toBe(HEAD);
  });

  it("distinguishes malformed UTF-8 meta structure from invalid UTF-8 bytes", async () => {
    const malformedText = [
      "# Metadata: widget",
      "",
      "| --- | --- | --- | --- | --- |",
      "",
      "- **Review Rubric:** [none]",
      "",
      "---",
      "",
    ].join("\n");

    await expect(prepareGitGraduationTransaction(dependencies({
      metaBytes: new TextEncoder().encode(malformedText),
    }), {
      cwd: "/repo",
      slug: "widget",
      location: "planned",
      sourceRef: "base",
      sourceDirectory: SOURCE,
      targetDirectory: TARGET,
      mode: "spawned",
      worktreePath: "/wt",
      classResolution: { kind: "preserved", value: "Heavy" },
      spawn: {
        locationTemplate: "../{repo}.{name}",
        repo: "repo",
        spawningIdentity: "andrew",
      },
    })).resolves.toMatchObject({
      status: "refused",
      reason: "transaction",
      detail: expect.stringMatching(/malformed|core-block|table/iu),
    });

    await expect(prepareGitGraduationTransaction(dependencies({
      metaBytes: Uint8Array.from([0xff]),
    }), {
      cwd: "/repo",
      slug: "widget",
      location: "planned",
      sourceRef: "base",
      sourceDirectory: SOURCE,
      targetDirectory: TARGET,
      mode: "spawned",
      worktreePath: "/wt",
      classResolution: { kind: "preserved", value: "Heavy" },
      spawn: {
        locationTemplate: "../{repo}.{name}",
        repo: "repo",
        spawningIdentity: "andrew",
      },
    })).resolves.toMatchObject({
      status: "refused",
      reason: "source-shape",
      detail: expect.stringMatching(/not valid UTF-8/iu),
    });
  });

  it.each(["source", "destination", "branch", "worktree", "index"] as const)(
    "refuses when the captured %s preimage drifts before the first write",
    async (drift) => {
      const inPlace = drift === "index";
      await expect(prepareGitGraduationTransaction(dependencies({ drift }), {
      cwd: "/repo",
      slug: "widget",
      location: "planned",
      sourceRef: "base",
      sourceDirectory: SOURCE,
      targetDirectory: TARGET,
      mode: inPlace ? "in-place" : "spawned",
      worktreePath: inPlace ? "/repo" : "/wt",
      classResolution: { kind: "preserved", value: "Heavy" },
      ...(inPlace
        ? {}
        : {
            spawn: {
              locationTemplate: "../{repo}.{name}",
              repo: "repo",
              spawningIdentity: "andrew",
            },
          }),
      })).resolves.toMatchObject({
        status: "refused",
        reason: "snapshot-drift",
        locus: SOURCE,
        detail: expect.any(String),
      });
    },
  );
});
