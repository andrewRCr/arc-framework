/** Built-CLI coverage for the read-only landed decomposition handoff. */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalize,
  digestBytes,
} from "../../src/lib/canonical/canonical-json.js";
import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import { v3DecomposeReceiptPath } from "../../src/lib/work-unit/decompose-v3-preparation.js";
import { v3DecompositionEvidenceFixture } from "../fixtures/decompose-v3.js";
import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArcNoTty,
} from "./helpers.js";

const encoder = new TextEncoder();

function meta(slug: string): string {
  return renderMetaFile(slug, {
    state: "Planning",
    owner: "test-user",
    branch: null,
    workClass: "Light",
    priority: "P1",
    cohort: "origin",
    dependsOn: [],
  });
}

async function write(repo: string, path: string, content: string): Promise<void> {
  const absolute = join(repo, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

async function repositoryState(repo: string): Promise<{
  head: string;
  refs: string;
  status: string;
}> {
  return {
    head: await git(repo, ["rev-parse", "HEAD"]),
    refs: await git(repo, ["for-each-ref", "--format=%(refname) %(objectname)"]),
    status: await git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]),
  };
}

describe("arc decompose --handoff", () => {
  let repo: string | undefined;

  afterEach(async () => {
    if (repo !== undefined) await cleanupTempDir(repo);
  });

  it("emits the exact landed handoff without changing repository state", async () => {
    repo = await createTempRepo("arc-decompose-handoff-");
    const content = {
      "result 0": meta("member-a"),
      "result 1": meta("member-b"),
      "cohort topology": "# Cohort: `origin`\n\n**Purpose:** Published members\n",
      "roadmap before": "# Roadmap before\n",
      "roadmap after": "# Roadmap after\n",
    };
    await write(repo, ".arc/system/arc-config.yml", "branch.base: main\n");
    await write(repo, ".arc/backlog/ROADMAP.md", content["roadmap before"]);
    await git(repo, ["add", ".arc"]);
    await git(repo, ["commit", "-m", "prepare decomposition base"]);
    const preparedBase = await git(repo, ["rev-parse", "HEAD"]);
    const { receipt } = v3DecompositionEvidenceFixture({
      resultBaseHead: preparedBase,
      digestLabel: (label) =>
        digestBytes(encoder.encode(content[label as keyof typeof content] ?? label)),
    });
    for (const result of receipt.finalized.managedPathResults) {
      if (result.after.kind === "absent") continue;
      const label = result.path.endsWith("meta-member-a.md")
        ? "result 0"
        : result.path.endsWith("meta-member-b.md")
          ? "result 1"
          : result.path.endsWith("cohort-origin.md")
            ? "cohort topology"
            : "roadmap after";
      await write(repo, result.path, content[label]);
    }
    await write(
      repo,
      v3DecomposeReceiptPath(receipt.receiptId),
      canonicalize(receipt),
    );
    await git(repo, ["add", ".arc"]);
    await git(repo, ["commit", "-m", "land decomposition"]);

    const before = await repositoryState(repo);
    const result = await runArcNoTty(["decompose", "origin", "--handoff"], repo);
    const after = await repositoryState(repo);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "resolved",
      handoff: {
        kind: "landed-decomposition-handoff",
        schemaVersion: 1,
        authority: {
          configuredBaseHead: before.head,
          candidateCommitHead: before.head,
          landedCommitHead: before.head,
        },
        logicalAnchor: { kind: "cohort", cohort: "origin" },
        displayAnchor: {
          kind: "cohort",
          cohort: "origin",
          displayPath: ".arc/backlog/planned/origin",
        },
        initialContinuation: { kind: "selected", slugs: ["member-a"] },
        launchableSelected: [{
          slug: "member-a",
          displayPath: ".arc/backlog/planned/origin/member-a",
        }],
      },
    });
    expect(JSON.parse(result.stdout)).not.toHaveProperty("handoff.integrationAnchor");
    expect(after).toEqual(before);
  });
});
