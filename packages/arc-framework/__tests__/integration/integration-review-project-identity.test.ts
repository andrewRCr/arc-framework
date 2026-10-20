/** Default integration adapters preserve native project repair before opening review-family readers. */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { handleIntegrationCheckpoint, handleIntegrationMerge } from "../../src/handlers/integration.js";
import { IntegrationCheckpointResultSchema } from "../../src/scripts/integration/checkpoint.js";
import { IntegrationMergeResultSchema } from "../../src/scripts/integration/merge.js";
import { ProjectIdentityError } from "../../src/lib/store/project-identity.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
async function fixture() {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  await exec("git", ["config", "arc.identity", "test-user"], { cwd });
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\narchive.cadence: manual\n");
  await exec("git", ["add", "."], { cwd });
  await exec("git", ["commit", "-m", "Configure integration fixture"], { cwd });
  await exec("git", ["push", "origin", "main"], { cwd });
  const base = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  await exec("git", ["switch", "-c", "topic/opaque"], { cwd });
  await writeFile(join(cwd, "example.ts"), "export const example = true;\n");
  await exec("git", ["add", "example.ts"], { cwd });
  await exec("git", ["commit", "-m", "Implement example"], { cwd });
  await exec("git", ["push", "origin", "topic/opaque"], { cwd });
  const primary = await h.reference.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "topic/opaque", linkedAs: "adopted", excluded: [] }],
  });
  const head = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  const tree = (await exec("git", ["rev-parse", "HEAD^{tree}"], { cwd })).stdout.trim();
  const mergeCommit = (await exec("git", ["commit-tree", tree, "-p", base, "-p", head, "-m", "Test merge"], { cwd })).stdout.trim();
  const hostUrl = "git@github.com:owner/repo.git";
  await exec("git", ["remote", "set-url", "origin", hostUrl], { cwd });
  await exec("git", ["config", `url.${h.origin}.insteadOf`, hostUrl], { cwd });
  const bin = join(cwd, "..", "integration-host-bin");
  await mkdir(bin, { recursive: true });
  const candidate = { number: 42, url: "https://github.com/owner/repo/pull/42", state: "OPEN",
    baseRefName: "main", headRefName: "topic/opaque", headRefOid: head };
  const pull = { number: 42, state: "open", merged: false, draft: false, mergeable: true, mergeable_state: "clean", merge_commit_sha: mergeCommit,
    head: { ref: "topic/opaque", sha: head, repo: { full_name: "owner/repo" } },
    base: { ref: "main", sha: base, repo: { full_name: "owner/repo" } } };
  await writeFile(join(bin, "gh"), ["#!/bin/sh", 'case "$1:$2" in',
    `repo:view) printf '%s\\n' '{"nameWithOwner":"owner/repo"}' ;;`,
    `pr:list) printf '%s\\n' '${JSON.stringify([candidate])}' ;;`,
    "pr:checks) echo 'no required checks reported' >&2; exit 1 ;;",
    `api:repos/owner/repo/pulls/42) printf '%s\\n' '${JSON.stringify(pull)}' ;;`,
    `api:repos/owner/repo/commits/${mergeCommit}) printf '%s\\n' '${JSON.stringify({ sha: mergeCommit, parents: [{ sha: base }, { sha: head }] })}' ;;`,
    `api:repos/owner/repo/branches/main) printf '%s\\n' '{}' ;;`,
    `api:repos/owner/repo) printf '%s\\n' '{"allow_merge_commit":true,"allow_squash_merge":false,"allow_rebase_merge":false}' ;;`,
    '*) echo "unexpected host invocation: $*" >&2; exit 1 ;;', "esac", ""].join("\n"));
  await chmod(join(bin, "gh"), 0o755);
  return { ...h, cwd, primary, bin };
}

it.each(["checkpoint", "merge"] as const)("preserves %s project repair and returns its ordinary verdict after restoration", async command => {
  const h = await fixture(), originalCwd = process.cwd(), originalPath = process.env.PATH;
  const run = async (projectIdReader?: () => Promise<string>) => {
    const output: string[] = [];
    let exitCode = 0;
    const boundary = { resolveRoot: () => h.cwd, write: (value: string) => { output.push(value); },
      setExitCode: (value: number) => { exitCode = value; } };
    const invocation = { store: h.reference.store, projectId: projectIdReader };
    if (command === "checkpoint") await handleIntegrationCheckpoint("example", {}, undefined, boundary, invocation);
    else await handleIntegrationMerge("example", { checkpoint: `checkpoint-v1:${"a".repeat(40)}:sha256:${"b".repeat(64)}` },
      undefined, boundary, invocation);
    const value: unknown = JSON.parse(output.join(""));
    const result = command === "checkpoint" ? IntegrationCheckpointResultSchema.parse(value) : IntegrationMergeResultSchema.parse(value);
    return { result, exitCode };
  };
  try {
    process.chdir(h.cwd);
    process.env.PATH = `${h.bin}${delimiter}${originalPath ?? ""}`;
    const refused = await run();
    expect(refused).toMatchObject({ exitCode: 1, result: { reason: command === "checkpoint" ? "composition-unavailable" : "operation-failed",
      detail: expect.stringContaining("Project identity record is missing.") } });
    expect(refused.result).toMatchObject({ detail: expect.stringContaining("Restore the project's unique, valid identity record") });
    const fetchRequired = await run(async () => { throw new ProjectIdentityError({ status: "unavailable",
      reason: "Authoritative project state has not arrived.",
      remedy: { text: "Fetch project state, then retry.", argv: ["git", "fetch", "origin"] } }); });
    expect(fetchRequired).toMatchObject({ exitCode: 1,
      result: { detail: expect.stringContaining("git fetch origin") } });
    await h.reference.seedProject(projectId);
    const repaired = await run();
    expect(repaired, JSON.stringify(repaired)).toMatchObject({ exitCode: 0,
      result: { reason: command === "checkpoint" ? "lifecycle-incomplete" : "checkpoint-missing" } });
  } finally {
    process.chdir(originalCwd);
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
  }
}, 30_000);
