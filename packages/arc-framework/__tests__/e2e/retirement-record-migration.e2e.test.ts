/** Real-Git coverage for importing reachable legacy retirement evidence. */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../src/lib/canonical/canonical-json.js";
import { receiptId } from "../../src/lib/canonical/receipt-id.js";
import {
  LEGACY_RETIREMENT_RECORD_NAMESPACE,
  RETIREMENT_RECORD_NAMESPACE,
  encodeRetirementRecordKey,
} from "../../src/lib/work-unit/retirement-record-store.js";
import { createTempRepo, git, removeGitBackedDir, runArcNoTty } from "./helpers.js";

describe("retirement record migration", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    for (const path of cleanupPaths.splice(0).reverse()) await removeGitBackedDir(path);
  });

  it("imports an exact canonical copy from reachable legacy history", async () => {
    const repo = await createTempRepo("arc-retirement-migration-e2e-");
    cleanupPaths.push(repo);
    const subject = { kind: "work-unit" as const, name: "historical-origin" };
    const source = { branch: "plan/historical-origin", head: "a".repeat(40) };
    const id = receiptId({
      schemaVersion: 1,
      subject,
      transition: "rename",
      sourceBranch: source.branch,
      sourceHead: source.head,
    });
    const filename = `${encodeRetirementRecordKey(id)}.json`;
    const content = canonicalize({
      schemaVersion: 1,
      receiptId: id,
      subject,
      transition: "rename",
      source: { ...source, artifactDigest: canonicalDigest("source") },
      transitionPatchDigest: canonicalDigest("patch"),
      retiringProjection: { kind: "direct-transition" },
      authorization: "identity-renamed",
      result: {
        kind: "rename",
        targetSlug: "historical-target",
        artifactDigest: canonicalDigest("result"),
      },
    });
    const legacyDirectory = join(repo, LEGACY_RETIREMENT_RECORD_NAMESPACE);
    await git(repo, ["commit", "--allow-empty", "-m", "test: initialize"]);
    await git(repo, ["switch", "-c", "legacy-retirement"]);
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(join(legacyDirectory, filename), content, "utf8");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "test: record legacy evidence"]);
    await git(repo, ["switch", "main"]);
    await git(repo, ["commit", "--allow-empty", "-m", "test: advance canonical line"]);
    await git(repo, ["merge", "--no-commit", "--no-ff", "legacy-retirement"]);
    await rm(join(repo, ".arc", ".internal"), { recursive: true });
    await git(repo, ["add", "-A"]);
    await git(repo, ["commit", "-m", "test: reconcile without legacy tree path"]);

    const canonicalDirectory = join(repo, RETIREMENT_RECORD_NAMESPACE);
    await mkdir(canonicalDirectory, { recursive: true });
    await writeFile(join(canonicalDirectory, filename), content, "utf8");
    await git(repo, ["add", "--", RETIREMENT_RECORD_NAMESPACE]);

    const result = await runArcNoTty(["hook-validate-decompose-record"], repo);

    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  });
});
