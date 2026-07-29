import { describe, expect, it } from "vitest";

import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  prepareGitGraduationTransaction,
  type GitGraduationTransactionDependencies,
} from "../../../src/lib/work-unit/git-graduation-transaction.js";

const HEAD = "a".repeat(40);
const TREE = "b".repeat(40);
const INDEX = "c".repeat(40);
const META_OID = "d".repeat(40);
const DRAFT_OID = "e".repeat(40);
const SOURCE = ".arc/backlog/planned/widget";
const TARGET = ".arc/active";

function meta(owner = "andrew", decompositionReceipt?: `sha256:${string}`): Uint8Array {
  return new TextEncoder().encode(renderMetaFile("widget", {
    state: "Planning",
    owner,
    workClass: "Heavy",
    design: ["draft-widget.md"],
    currentWorkflow: "create-spec",
    ...(decompositionReceipt === undefined ? {} : { decompositionReceipt }),
  }));
}

function dependencies(options: {
  drift?: "source" | "destination" | "branch" | "worktree" | "index";
  metaBytes?: Uint8Array;
  forbidWriteTree?: boolean;
} = {}): GitGraduationTransactionDependencies {
  let metaReads = 0;
  let targetReads = 0;
  let branchReads = 0;
  let worktreeReads = 0;
  let indexReads = 0;
  const exec: GitExec = async (_command, args) => {
    const key = args.join(" ");
    if (key === "rev-parse --verify base^{commit}") return { stdout: `${HEAD}\n` };
    if (key === "rev-parse --verify base^{tree}") return { stdout: `${TREE}\n` };
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
          + `100755 blob ${DRAFT_OID}\t${SOURCE}/draft-widget.md\0`,
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
    resolveAnchor: async () => ({ status: "refused", reason: "unexpected ordinary anchor lookup" }),
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

  it("distinguishes malformed UTF-8 meta structure from invalid UTF-8 bytes", async () => {
    const receiptId = `sha256:${"a".repeat(64)}`;
    const malformedText = [
      "# Metadata: widget",
      "",
      "| --- | --- | --- | --- | --- |",
      "",
      "- **Review Rubric:** [none]",
      `- **Decomposition Receipt:** \`${receiptId}\``,
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
      reason: "source-shape",
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

  it("preserves anchor-policy as a typed refusal instead of classifying message text", async () => {
    const receiptId = `sha256:${"a".repeat(64)}` as const;
    await expect(prepareGitGraduationTransaction(dependencies({
      metaBytes: meta("andrew", receiptId),
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
      reason: "anchor-policy",
      locus: SOURCE,
      detail: expect.stringMatching(/no exact landed anchor/iu),
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
