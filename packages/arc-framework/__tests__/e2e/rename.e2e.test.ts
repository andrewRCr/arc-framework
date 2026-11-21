/** Operator-level coverage for work-unit rename across its three subject shapes. */

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  createTempRepo,
  git,
  removeGitBackedDir,
  runArcAnchored,
  runArcNoTty,
  unwrapPresentationOutput,
} from "./helpers.js";
import { assertEditorDocumentsProvisioned, resetEditorDocumentsProvisioning } from "./editor-document-helpers.js";
import { useInRepoStoreForEach } from "../helpers/in-repo-store-override.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";
import {
  resolveSubmissionBoundaryPath,
  writeSubmissionBoundary,
} from "../../src/lib/work-unit/submission-boundary-store.js";
import { projectCandidateReviewBoundary } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { seededWorkUnitSubject, seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";

const execFileAsync = promisify(execFile);

interface RenameFixture {
  repo: string;
  remote: string;
}

const COHORT = "rename-group";
const COMPANIONS = [
  { prefix: "draft", title: "Draft" },
  { prefix: "spec", title: "Spec (`detailed` · `RFC`)" },
  { prefix: "tasks", title: "Task List" },
  { prefix: "notes", title: "Notes" },
  { prefix: "research", title: "Research" },
  { prefix: "analysis", title: "Analysis" },
] as const;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function cohortDoc(slug: string): string {
  return [
    `# Cohort: \`${COHORT}\``,
    "",
    "**Purpose:** Exercise rename membership coherence.",
    "",
    "## Members",
    "",
    `### \`${slug}\``,
    "",
    "_Exposes:_ rename verification surfaces.",
    "",
    "---",
    "",
  ].join("\n");
}

async function seedTrackedSweep(repo: string, artifactDir: string, slug: string): Promise<void> {
  const metaPath = join(repo, artifactDir, `meta-${slug}.md`);
  const originalMeta = await readFile(metaPath, "utf8");
  const meta = originalMeta
    .replace("- **Cohort:** [none]", `- **Cohort:** ${COHORT}`)
    .replace("- **Design:** [none]", `- **Design:** spec-${slug}.md`)
    .replace("- **Task List:** [none]", `- **Task List:** tasks-${slug}.md`);
  expect(parseMetaRecord(meta).cohort).toBe(COHORT);
  expect(meta).toContain(`- **Design:** spec-${slug}.md`);
  expect(meta).toContain(`- **Task List:** tasks-${slug}.md`);
  await writeFile(metaPath, meta, "utf8");
  for (const companion of COMPANIONS) {
    const resume = companion.prefix === "draft" ? `\n> Resume with \`--plan ${slug}\`.\n` : "";
    await writeFile(
      join(repo, artifactDir, `${companion.prefix}-${slug}.md`),
      `# ${companion.title}: ${slug}\n${resume}`,
      "utf8",
    );
  }
  const cohortDir = join(repo, ".arc", "backlog", "planned", COHORT);
  await mkdir(cohortDir, { recursive: true });
  await writeFile(join(cohortDir, `cohort-${COHORT}.md`), cohortDoc(slug), "utf8");
  const observerDir = join(repo, ".arc", "backlog", "planned", "rename-observer");
  await mkdir(observerDir, { recursive: true });
  await writeFile(join(observerDir, "meta-rename-observer.md"), [
    "# Metadata: rename-observer",
    "",
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "| --------- | --------- | ---------- | --------- | ------------ |",
    "| `Planning` | `tester`  | [none]     | `Light`   | `P3`         |",
    "",
    "- **Cohort:** [none]",
    `- **Depends On:** \`${slug}\``,
    "",
    "- **Origin:** [internal]",
    `- **Design:** \`spec-${slug}.md\``,
    `- **Task List:** \`tasks-${slug}.md\``,
    "- **Review Rubric:** [none]",
    "",
    "- **Current Workflow:** [none]",
    "- **Last Completed:** [none]",
    "- **Next Task:** [none]",
    "- **Blockers:** [none]",
    "",
    "- **Next Action:** —",
    "",
    "- **PR URL:** [none]",
    "- **Completed:** [none]",
    "",
    "---",
    "",
  ].join("\n"), "utf8");
}

async function expectTrackedSweep(
  repo: string,
  oldArtifactDir: string,
  newArtifactDir: string,
  oldSlug: string,
  newSlug: string,
  options: { baseStubRemains?: boolean } = {},
): Promise<void> {
  for (const prefix of ["meta", ...COMPANIONS.map((companion) => companion.prefix)]) {
    expect(await exists(join(repo, oldArtifactDir, `${prefix}-${oldSlug}.md`))).toBe(false);
    expect(await exists(join(repo, newArtifactDir, `${prefix}-${newSlug}.md`))).toBe(true);
  }
  const meta = await readFile(join(repo, newArtifactDir, `meta-${newSlug}.md`), "utf8");
  expect(meta).toContain(`# Metadata: ${newSlug}`);
  expect(meta).toContain(`spec-${newSlug}.md`);
  expect(meta).toContain(`tasks-${newSlug}.md`);
  for (const companion of COMPANIONS) {
    const content = await readFile(join(repo, newArtifactDir, `${companion.prefix}-${newSlug}.md`), "utf8");
    expect(content).toContain(`# ${companion.title}: ${newSlug}`);
    if (companion.prefix === "draft") expect(content).toContain(`\`--plan ${newSlug}\``);
  }
  const observer = await readFile(
    join(repo, ".arc", "backlog", "planned", "rename-observer", "meta-rename-observer.md"),
    "utf8",
  );
  expect(observer).toContain(`- **Depends On:** \`${newSlug}\``);
  expect(observer).toContain(`\`spec-${newSlug}.md\``);
  expect(observer).not.toContain(oldSlug);
  const cohort = await readFile(
    join(repo, ".arc", "backlog", "planned", COHORT, `cohort-${COHORT}.md`),
    "utf8",
  );
  expect(cohort).toContain(`### \`${newSlug}\``);
  expect(cohort).not.toContain(`### \`${oldSlug}\``);
  const roadmap = await readFile(join(repo, ".arc", "backlog", "ROADMAP.md"), "utf8");
  expect(roadmap).toContain(newSlug);
  expect(roadmap).toContain(`rename-observer | P3       | tester | ${newSlug}`);
  if (options.baseStubRemains !== true) expect(roadmap).not.toContain(oldSlug);
}

async function hasUserWorkspace(repo: string, slug: string): Promise<boolean> {
  const userRoot = join(repo, ".arc", "user");
  for (const entry of await readdir(userRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && await exists(join(userRoot, entry.name, slug, "SESSION-NOTES.md"))) return true;
  }
  return false;
}

async function createFixture(): Promise<RenameFixture> {
  const repo = await createTempRepo("arc-rename-e2e-");
  const remote = await mkdtemp(join(tmpdir(), "arc-rename-origin-"));
  await execFileAsync("git", ["init", "--bare", remote]);
  await git(repo, ["remote", "add", "origin", remote]);
  const initialized = await runArcNoTty([
    "init", "--yes", "--name", "rename-test", "--pm-mode", "arc-in-git", "--tools", "codex",
  ], repo);
  expect(initialized.exitCode).toBe(0);
  // The in-repo rename rewrites a ROADMAP the install no longer writes.
  await mkdir(join(repo, ".arc", "backlog"), { recursive: true });
  await writeFile(join(repo, ".arc", "backlog", "ROADMAP.md"), "# Roadmap\n");
  await git(repo, ["config", "core.hooksPath", "/dev/null"]);
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "chore(test): initialize fixture"]);
  await git(repo, ["push", "-u", "origin", "main"]);
  return { repo, remote };
}

async function startInPlace(fixture: RenameFixture): Promise<void> {
  await git(fixture.repo, ["switch", "-c", "feat/old-name"]);
  await resetEditorDocumentsProvisioning(fixture.repo);
  const started = await runArcAnchored([
    "start", "old-name", "--here", "--new", "--yes",
  ], fixture.repo);
  expect(started.exitCode).toBe(0);
  await assertEditorDocumentsProvisioned(fixture.repo);
  const lociRoot = join(fixture.repo, ".arc", "user", "test-user", ".internal", "loci");
  expect(await exists(lociRoot)).toBe(false);
  await seedTrackedSweep(fixture.repo, join(".arc", "active"), "old-name");
  await git(fixture.repo, ["add", "."]);
  await git(fixture.repo, ["commit", "-m", "chore(test): start work unit"]);
  await git(fixture.repo, ["push", "-u", "origin", "feat/old-name"]);
}

async function installRenameGateHook(
  repo: string,
  options: { rejectOnce?: boolean } = {},
): Promise<{ ranMarker: string; refusalMarker: string }> {
  const marker = join(repo, ".git", "rename-gate-ran");
  const refusalMarker = join(repo, ".git", "rename-gate-refused-once");
  const hook = join(repo, ".git", "hooks", "pre-commit");
  await writeFile(hook, [
    "#!/usr/bin/env node",
    "const { existsSync, writeFileSync } = require('node:fs');",
    `writeFileSync(${JSON.stringify(marker)}, '');`,
    ...(options.rejectOnce === true ? [
      `if (!existsSync(${JSON.stringify(refusalMarker)})) {`,
      `  writeFileSync(${JSON.stringify(refusalMarker)}, '');`,
      "  process.exit(1);",
      "}",
    ] : []),
    "process.exit(0);",
    "",
  ].join("\n"), "utf8");
  await chmod(hook, 0o755);
  await execFileAsync("git", ["config", "core.hooksPath", ".git/hooks"], { cwd: repo });
  return { ranMarker: marker, refusalMarker };
}

// Every case here works over state the in-repo store keeps in tracked files: it renames tracked artifacts, transition
// records, a notes workspace, or a `chore/rename` branch, reads a tracked Candidate record, or meets a refusal only that
// store makes (the same-name check before reading any state, slug-matched checkout roles, remote candidate expansion).
// The store renames records in one write; its cases follow.
describe("arc rename", () => {
  useInRepoStoreForEach();
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    for (const path of cleanupPaths.splice(0).reverse()) await removeGitBackedDir(path);
  });

  it.each([false, true])("retains the same-name input refusal before the storage flip, json=%s", async json => {
    const fixture = await createFixture();
    cleanupPaths.push(fixture.remote, fixture.repo);
    const head = await git(fixture.repo, ["rev-parse", "HEAD"]);
    const result = await runArcNoTty(["rename", "old-name", "old-name", ...(json ? ["--json"] : [])], fixture.repo);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("The new slug must differ from the current one.");
    if (json) expect(JSON.parse(result.stdout)).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "rename", "--help"] } });
    expect(await git(fixture.repo, ["rev-parse", "HEAD"])).toBe(head);
  });

  it.each([false, true])("renames a backlog stub through a rejecting commit hook and rests on main, json=%s", async json => {
    const fixture = await createFixture();
    cleanupPaths.push(fixture.remote, fixture.repo);
    const stubbed = await runArcNoTty([
      "stub", "old-name", "--commitment", "planned", "--priority", "P2", "--class", "Light",
      "--cohort", COHORT,
    ], fixture.repo);
    expect(stubbed.exitCode).toBe(0);
    const oldArtifactDir = join(".arc", "backlog", "planned", COHORT, "old-name");
    const newArtifactDir = join(".arc", "backlog", "planned", COHORT, "new-name");
    await seedTrackedSweep(fixture.repo, oldArtifactDir, "old-name");
    await git(fixture.repo, ["add", "."]);
    await git(fixture.repo, ["commit", "-m", "chore(test): add work unit"]);
    await git(fixture.repo, ["push"]);
    const gate = await installRenameGateHook(fixture.repo, { rejectOnce: true });

    const flags = json ? ["--json"] : [];
    const refused = await runArcNoTty(["rename", "old-name", "new-name", ...flags], fixture.repo);
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout + refused.stderr).toContain("rename commit refused");
    if (json) expect(JSON.parse(refused.stdout)).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "status", "--json"] } });
    expect(await exists(gate.ranMarker)).toBe(true);
    expect(await exists(gate.refusalMarker), refused.stdout + refused.stderr).toBe(true);
    expect(await git(fixture.repo, ["status", "--porcelain"])).toBe("");
    expect(await exists(join(fixture.repo, oldArtifactDir, "meta-old-name.md"))).toBe(true);
    expect(await exists(join(fixture.repo, newArtifactDir, "meta-new-name.md"))).toBe(false);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name", ...flags], fixture.repo);

    expect(renamed.exitCode).toBe(0);
    if (json) {
      expect(JSON.parse(renamed.stdout)).toMatchObject({ status: "renamed", reference: null, pendingIntegration: true,
        report: { references: [], memberHeadings: [], formerSlugTies: [], keptBranches: [] } });
      expect(renamed.stdout.trim().split("\n")).toHaveLength(1);
    } else expect(renamed.stdout).toContain("pending integration");
    expect(await git(fixture.repo, ["branch", "--show-current"])).toBe("main");
    const transition = JSON.parse(await git(fixture.repo, [
      "show", "chore/rename-old-name-to-new-name:.arc/system/.internal/transitions/old-name.json",
    ])) as { schemaVersion: 2; kind: string; successors: { name: string }[] };
    expect(transition).toMatchObject({
      kind: "rename",
      successors: [{ name: "new-name" }],
    });
    await git(fixture.repo, ["switch", "chore/rename-old-name-to-new-name"]);
    await expectTrackedSweep(fixture.repo, oldArtifactDir, newArtifactDir, "old-name", "new-name");
    await git(fixture.repo, ["switch", "main"]);
  }, 30_000);

  it("renames an in-place work unit, its notes workspace, and its published branch", async () => {
    const fixture = await createFixture();
    cleanupPaths.push(fixture.remote, fixture.repo);
    await startInPlace(fixture);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], fixture.repo);

    expect(renamed.exitCode, renamed.stdout + renamed.stderr).toBe(0);
    expect(renamed.stdout).toContain("in-place");
    expect(renamed.stdout).toContain("Checkout:  unmanaged");
    expect(renamed.stdout).toContain("Worktree:  unchanged");
    expect(await git(fixture.repo, ["branch", "--show-current"])).toBe("feat/new-name");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/old-name"])).toBe("");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/new-name"])).not.toBe("");
    await expectTrackedSweep(
      fixture.repo,
      join(".arc", "active"),
      join(".arc", "active"),
      "old-name",
      "new-name",
      { baseStubRemains: true },
    );
    expect(await hasUserWorkspace(fixture.repo, "old-name")).toBe(false);
    expect(await hasUserWorkspace(fixture.repo, "new-name")).toBe(true);
  }, 30_000);

  it("refuses Candidate publication state before mutating any rename surface", async () => {
    const fixture = await createFixture();
    cleanupPaths.push(fixture.remote, fixture.repo);
    await startInPlace(fixture);
    const boundaryPath = await writeSubmissionBoundary(fixture.repo, projectCandidateReviewBoundary({
      workUnit: "old-name",
      candidateId: `sha256:${"c".repeat(64)}`,
    }), null);
    await git(fixture.repo, ["add", boundaryPath]);
    await git(fixture.repo, ["commit", "-m", "chore(test): add Candidate boundary"]);
    await git(fixture.repo, ["push"]);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], fixture.repo);

    expect(renamed.exitCode).toBe(1);
    expect(renamed.stdout + renamed.stderr).toContain("Candidate publication state cannot be renamed");
    expect(await git(fixture.repo, ["status", "--porcelain"])).toBe("");
    expect(await git(fixture.repo, ["branch", "--show-current"])).toBe("feat/old-name");
    expect(await exists(join(fixture.repo, ".arc", "active", "meta-old-name.md"))).toBe(true);
    expect(await exists(join(fixture.repo, ".arc", "active", "meta-new-name.md"))).toBe(false);
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/old-name"])).not.toBe("");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/new-name"])).toBe("");
  }, 30_000);

  it("refuses a public-attestation Candidate record even when no boundary remains", async () => {
    const fixture = await createFixture();
    cleanupPaths.push(fixture.remote, fixture.repo);
    await startInPlace(fixture);
    const metaPath = join(fixture.repo, ".arc", "active", "meta-old-name.md");
    const planningMeta = await readFile(metaPath, "utf8");
    await writeFile(metaPath, planningMeta.replace(/(\|\s*)`Planning`(\s*\|)/u, "$1`Active`$2"), "utf8");
    await writeFile(
      join(fixture.repo, ".arc", "active", "tasks-old-name.md"),
      "# Task List: old-name\n\n- [x] Verification complete\n",
      "utf8",
    );
    await git(fixture.repo, ["add", ".arc/active/meta-old-name.md", ".arc/active/tasks-old-name.md"]);
    const attested = await runArcNoTty(["attest", "old-name", "--json"], fixture.repo);
    expect(attested.exitCode, attested.stdout + attested.stderr).toBe(0);
    await rm(join(fixture.repo, resolveSubmissionBoundaryPath("old-name")));
    await git(fixture.repo, ["add", "-A"]);
    await git(fixture.repo, ["commit", "-m", "chore(test): retain Candidate record only"]);
    await git(fixture.repo, ["push"]);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], fixture.repo);

    expect(renamed.exitCode).toBe(1);
    expect(renamed.stdout + renamed.stderr).toContain("Candidate publication state cannot be renamed");
    expect(await git(fixture.repo, ["status", "--porcelain"])).toBe("");
    expect(await git(fixture.repo, ["branch", "--show-current"])).toBe("feat/old-name");
    expect(await exists(join(fixture.repo, ".arc", "active", "meta-old-name.md"))).toBe(true);
    expect(await exists(join(fixture.repo, ".arc", "active", "meta-new-name.md"))).toBe(false);
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/old-name"])).not.toBe("");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/new-name"])).toBe("");
  }, 30_000);

  it("refuses rename when explicit candidate expansion cannot reach origin", async () => {
    const fixture = await createFixture();
    cleanupPaths.push(fixture.remote, fixture.repo);
    const stubbed = await runArcNoTty([
      "stub", "old-name", "--commitment", "planned", "--priority", "P2", "--class", "Light",
      "--cohort", COHORT,
    ], fixture.repo);
    expect(stubbed.exitCode).toBe(0);
    const oldArtifactDir = join(".arc", "backlog", "planned", COHORT, "old-name");
    const newArtifactDir = join(".arc", "backlog", "planned", COHORT, "new-name");
    await seedTrackedSweep(fixture.repo, oldArtifactDir, "old-name");
    await git(fixture.repo, ["add", "."]);
    await git(fixture.repo, ["commit", "-m", "chore(test): add offline rename source"]);
    await git(fixture.repo, ["remote", "set-url", "origin", join(fixture.repo, "missing-origin.git")]);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], fixture.repo);

    expect(renamed.exitCode).toBe(1);
    expect(renamed.stdout + renamed.stderr).toContain("Could not completely expand remote work-unit candidates");
    expect(await exists(join(fixture.repo, oldArtifactDir))).toBe(true);
    expect(await exists(join(fixture.repo, newArtifactDir))).toBe(false);
  }, 30_000);

  it("self-renames every identity leg while deferring the live worktree directory move", async () => {
    const fixture = await createFixture();
    const oldWorktree = `${fixture.repo}.old-name`;
    const newWorktree = `${fixture.repo}.new-name`;
    cleanupPaths.push(fixture.remote, fixture.repo, oldWorktree, newWorktree);
    await resetEditorDocumentsProvisioning(fixture.repo);
    const started = await runArcNoTty([
      "start", "old-name", "--new",
    ], fixture.repo, { timeout: 20_000 });
    expect(started.exitCode).toBe(0);
    await assertEditorDocumentsProvisioned(oldWorktree);
    await seedTrackedSweep(oldWorktree, join(".arc", "active"), "old-name");
    await git(oldWorktree, ["add", "."]);
    await git(oldWorktree, ["commit", "-m", "chore(test): seed rename surfaces"]);
    await git(oldWorktree, ["push", "-u", "origin", "plan/old-name"]);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], oldWorktree, { timeout: 20_000 });

    expect(renamed.exitCode).toBe(0);
    expect(renamed.stdout).toContain("spawned");
    expect(renamed.stdout).toContain("move deferred");
    expect(renamed.stdout).toContain("Follow-up:");
    expect(renamed.stdout).toContain("`git worktree move -f -f");
    const unwrappedOutput = unwrapPresentationOutput(renamed.stdout);
    expect(unwrappedOutput).toContain(oldWorktree);
    expect(unwrappedOutput).toContain(newWorktree);
    expect(renamed.stdout).not.toContain("process relocated");
    expect(await exists(oldWorktree)).toBe(true);
    expect(await exists(newWorktree)).toBe(false);
    const pendingMarker = JSON.parse(await readFile(
      join(oldWorktree, ".arc", "system", ".internal", "worktree-marker.json"),
      "utf8",
    )) as {
      wuName: string;
      createdFor: { name: string };
      renameMovePending: { oldSlug: string; newSlug: string; branch: string; head: string; from: string; to: string };
    };
    expect(pendingMarker.wuName).toBe("new-name");
    expect(pendingMarker.createdFor.name).toBe("new-name");
    expect(pendingMarker.renameMovePending).toEqual({
      oldSlug: "old-name",
      newSlug: "new-name",
      branch: "plan/new-name",
      head: await git(oldWorktree, ["rev-parse", "HEAD"]),
      from: oldWorktree,
      to: newWorktree,
    });
    expect(await git(oldWorktree, ["branch", "--show-current"])).toBe("plan/new-name");
    expect(await git(oldWorktree, ["ls-remote", "--heads", "origin", "plan/old-name"])).toBe("");
    expect(await git(oldWorktree, ["ls-remote", "--heads", "origin", "plan/new-name"])).not.toBe("");
    await expectTrackedSweep(
      oldWorktree,
      join(".arc", "active"),
      join(".arc", "active"),
      "old-name",
      "new-name",
      { baseStubRemains: true },
    );
    expect(await hasUserWorkspace(oldWorktree, "old-name")).toBe(false);
    expect(await hasUserWorkspace(oldWorktree, "new-name")).toBe(true);

    await execFileAsync("git", ["worktree", "move", "-f", "-f", oldWorktree, newWorktree], { cwd: fixture.repo });
    const replay = await runArcNoTty(["rename", "old-name", "new-name"], newWorktree, { timeout: 20_000 });
    expect(replay.exitCode, replay.stdout + replay.stderr).toBe(0);
    const movedMarker = JSON.parse(await readFile(
      join(newWorktree, ".arc", "system", ".internal", "worktree-marker.json"),
      "utf8",
    )) as { renameMovePending?: unknown };
    expect(movedMarker.renameMovePending).toBeUndefined();
  }, 30_000);

  it("refuses rename from a foreign worktree marker without projecting a move action", async () => {
    const fixture = await createFixture();
    const oldWorktree = `${fixture.repo}.old-name`;
    const newWorktree = `${fixture.repo}.new-name`;
    cleanupPaths.push(fixture.remote, fixture.repo, oldWorktree, newWorktree);
    const started = await runArcNoTty([
      "start", "old-name", "--new",
    ], fixture.repo, { timeout: 20_000 });
    expect(started.exitCode).toBe(0);
    const markerPath = join(oldWorktree, ".arc", "system", ".internal", "worktree-marker.json");
    const marker = JSON.parse(await readFile(markerPath, "utf8")) as {
      wuName: string;
      createdFor: { kind: string; name: string };
    };
    marker.wuName = "foreign-owner";
    marker.createdFor = { kind: "work-unit", name: "foreign-owner" };
    await writeFile(markerPath, JSON.stringify(marker), "utf8");

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], oldWorktree, { timeout: 20_000 });

    expect(renamed.exitCode).toBe(1);
    expect(renamed.stdout + renamed.stderr).toContain("role-conflict");
    expect(renamed.stdout).not.toContain("`git worktree move -f -f");
    expect(await exists(oldWorktree)).toBe(true);
    expect(await exists(newWorktree)).toBe(false);
    const foreignMarker = JSON.parse(await readFile(markerPath, "utf8")) as { renameMovePending?: unknown };
    expect(foreignMarker.renameMovePending).toBeUndefined();
  }, 30_000);

  it("resumes after a stale remote lease without repeating completed identity legs", async () => {
    const fixture = await createFixture();
    const oldWorktree = `${fixture.repo}.old-name`;
    const newWorktree = `${fixture.repo}.new-name`;
    cleanupPaths.push(fixture.remote, fixture.repo, oldWorktree, newWorktree);
    const started = await runArcNoTty([
      "start", "old-name", "--new",
    ], fixture.repo, { timeout: 20_000 });
    expect(started.exitCode).toBe(0);
    const hook = join(fixture.remote, "hooks", "post-receive");
    await writeFile(hook, [
      "#!/bin/sh",
      "while read old new ref; do",
      "  if [ \"$ref\" = \"refs/heads/plan/new-name\" ] && [ ! -f arc-rename-fired ]; then",
      "    touch arc-rename-fired",
      "    git update-ref refs/heads/plan/old-name refs/heads/main",
      "  fi",
      "done",
      "",
    ].join("\n"), "utf8");
    await chmod(hook, 0o755);

    const interrupted = await runArcNoTty(["rename", "old-name", "new-name"], oldWorktree, { timeout: 20_000 });

    expect(interrupted.exitCode).toBe(1);
    expect(interrupted.stdout + interrupted.stderr).toContain("old remote head moved");
    expect(await exists(oldWorktree)).toBe(true);
    expect(await git(oldWorktree, ["branch", "--show-current"])).toBe("plan/new-name");

    const resumed = await runArcNoTty(["rename", "old-name", "new-name"], oldWorktree, { timeout: 20_000 });
    expect(resumed.exitCode, resumed.stdout + resumed.stderr).toBe(0);
    expect(await exists(oldWorktree)).toBe(true);
    expect(await exists(newWorktree)).toBe(false);
    expect(await git(oldWorktree, ["ls-remote", "--heads", "origin", "plan/old-name"])).toBe("");
  }, 45_000);
});

describe("arc rename on the store", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    for (const path of cleanupPaths.splice(0).reverse()) await removeGitBackedDir(path);
  });

  async function storeFixture(): Promise<RenameFixture> {
    const repo = await createTempRepo("arc-rename-store-");
    const remote = await mkdtemp(join(tmpdir(), "arc-rename-store-origin-"));
    cleanupPaths.push(remote, repo);
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
    await git(repo, ["remote", "add", "origin", remote]);
    const initialized = await runArcNoTty(["init", "--yes", "--name", "rename-test"], repo);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    await git(repo, ["config", "core.hooksPath", "/dev/null"]);
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "chore(test): initialize fixture"]);
    await git(repo, ["push", "-u", "origin", "main"]);
    const designated = await runArcNoTty(["store", "remote", "origin", "push"], repo);
    expect(designated.exitCode, designated.stdout + designated.stderr).toBe(0);
    return { repo, remote };
  }

  /** An Active work unit held in the store on its created branch, with unlanded work published to origin, in the
   * primary checkout or in a linked checkout ARC spawned for it and projected there, as starting it leaves one. */
  async function startedWorkUnit(fixture: RenameFixture, options: { spawned: boolean; taskList?: string }) {
    const checkout = options.spawned ? `${fixture.repo}.old-name` : fixture.repo;
    if (options.spawned) cleanupPaths.push(`${fixture.repo}.new-name`, checkout);
    const { meta } = await seedWorkUnit(fixture.repo, "old-name", { identity: "test-user", branch: "feat/old-name",
      meta: { state: "Active", owner: "test-user", branch: "feat/old-name",
        ...(options.taskList === undefined ? {} : { taskList: "tasks-old-name.md" }) },
      ...(options.taskList === undefined ? {} : { taskList: options.taskList }) });
    await writeFile(join(fixture.repo, ".git", "info", "exclude"), ".arc/system/.internal/worktree-marker.json\n", { flag: "a" });
    if (options.spawned) await git(fixture.repo, ["worktree", "add", "-b", "feat/old-name", checkout, "main"]);
    else await git(fixture.repo, ["switch", "-c", "feat/old-name"]);
    await writeWorktreeMarker(checkout, { spawnedByArc: options.spawned, wuName: "old-name", createdFor: seededWorkUnitSubject(meta),
      spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00.000Z" });
    const saved = await runArcNoTty(["save"], checkout);
    expect(saved.exitCode, saved.stdout + saved.stderr).toBe(0);
    await writeFile(join(checkout, "work.txt"), "unlanded\n");
    await git(checkout, ["add", "work.txt"]);
    await git(checkout, ["commit", "-m", "feat: unlanded work"]);
    await git(checkout, ["push", "-u", "origin", "feat/old-name"]);
    const renamed = RecordReferenceSchema.parse({ ...meta.reference, owner: { ...meta.reference.owner, name: "new-name" } });
    return { checkout, meta, record: (name: "old-name" | "new-name") =>
      readStoreRecord(fixture.repo, SlugSchema.parse("test-user"), name === "old-name" ? meta.reference : renamed) };
  }

  it("renames a backlog stub in one store write, committing nothing and leaving main checked out", async () => {
    const fixture = await storeFixture();
    const stubbed = await runArcNoTty(["stub", "old-name", "--commitment", "planned", "--priority", "P2", "--class", "Light"],
      fixture.repo);
    expect(stubbed.exitCode, stubbed.stdout + stubbed.stderr).toBe(0);
    const head = await git(fixture.repo, ["rev-parse", "HEAD"]);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name", "--json"], fixture.repo);

    expect(renamed.exitCode, renamed.stdout + renamed.stderr).toBe(0);
    expect(renamed.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(renamed.stdout)).toMatchObject({ status: "renamed", shape: "stub", recordBatch: "applied",
      pendingIntegration: false, reference: { owner: { name: "new-name" }, kind: "work-item/meta" } });
    const status = await runArcNoTty(["status", "new-name", "--json"], fixture.repo);
    expect(JSON.parse(status.stdout)).toMatchObject({ slug: "new-name", state: "planned" });
    expect(await git(fixture.repo, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(fixture.repo, ["branch", "--show-current"])).toBe("main");
    expect(await git(fixture.repo, ["status", "--porcelain"])).toBe("");
  }, 30_000);

  it("renames an in-place work unit, its checkout's ownership, and its published branch", async () => {
    const fixture = await storeFixture();
    const h = await startedWorkUnit(fixture, { spawned: false });

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], fixture.repo);

    expect(renamed.exitCode, renamed.stdout + renamed.stderr).toBe(0);
    expect(renamed.stdout).toContain("in-place");
    // The checkout's path precedes the note, so where the report wraps it depends on the temporary directory's length.
    expect(unwrapPresentationOutput(renamed.stdout).replace(/\s/gu, "")).toContain("(ownershiprenamed;pathunchanged)");
    expect(await git(fixture.repo, ["branch", "--show-current"])).toBe("feat/new-name");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/old-name"])).toBe("");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/new-name"])).not.toBe("");
    await expect(h.record("new-name")).resolves.toBeDefined();
    const marker = JSON.parse(await readFile(join(fixture.repo, ".arc", "system", ".internal", "worktree-marker.json"), "utf8")) as {
      wuName: string; createdFor: { name: string } };
    expect(marker).toMatchObject({ wuName: "new-name", createdFor: { name: "new-name" } });
  }, 30_000);

  it.each([false, true])("refuses a rename to the work unit's own name, changing nothing, json=%s", async json => {
    const fixture = await storeFixture();
    const h = await startedWorkUnit(fixture, { spawned: false });
    const before = await h.record("old-name");
    const remote = await git(fixture.repo, ["ls-remote", "--heads", "origin"]);

    const renamed = await runArcNoTty(["rename", "old-name", "old-name", ...(json ? ["--json"] : [])], fixture.repo);

    expect(renamed.exitCode).toBe(1);
    if (json) expect(JSON.parse(renamed.stdout)).toMatchObject({ status: "rejected", reason: "Rename needs distinct source and target names." });
    else expect(renamed.stdout + renamed.stderr).toContain("Rename needs distinct source and target names.");
    expect(await h.record("old-name")).toEqual(before);
    expect(await git(fixture.repo, ["branch", "--show-current"])).toBe("feat/old-name");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin"])).toBe(remote);
  }, 30_000);

  it("refuses a work unit whose Candidate the store holds before renaming its branch", async () => {
    const fixture = await storeFixture();
    const h = await startedWorkUnit(fixture, { spawned: false,
      taskList: "# Task List: old-name\n\n## **Phase 1:** Verification\n\n### `[x]` **1.1 Verification complete**\n" });
    const attested = await runArcNoTty(["attest", "old-name", "--json"], h.checkout);
    expect(attested.exitCode, attested.stdout + attested.stderr).toBe(0);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], fixture.repo);

    expect(renamed.exitCode).toBe(1);
    expect(renamed.stdout + renamed.stderr).toContain("Candidate publication state cannot be renamed");
    expect(await git(fixture.repo, ["branch", "--show-current"])).toBe("feat/old-name");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/old-name"])).not.toBe("");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/new-name"])).toBe("");
    await expect(h.record("old-name")).resolves.toBeDefined();
  }, 30_000);

  it("self-renames from its spawned checkout, deferring the checkout's move until it runs from outside", async () => {
    const fixture = await storeFixture();
    const h = await startedWorkUnit(fixture, { spawned: true });
    const newWorktree = `${fixture.repo}.new-name`;
    const markerPath = (checkout: string) => join(checkout, ".arc", "system", ".internal", "worktree-marker.json");

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], h.checkout, { timeout: 20_000 });

    expect(renamed.exitCode, renamed.stdout + renamed.stderr).toBe(0);
    expect(renamed.stdout).toContain("spawned");
    expect(renamed.stdout).toContain("Follow-up:");
    const unwrapped = unwrapPresentationOutput(renamed.stdout);
    expect(unwrapped).toContain(h.checkout);
    expect(unwrapped).toContain(newWorktree);
    // The boxed follow-up wraps at arbitrary columns; compare its words without their spacing.
    expect(unwrapped.replace(/\s/gu, "")).toContain("thenrunarcrenameold-namenew-nametosettlethemove");
    expect(await exists(h.checkout)).toBe(true);
    expect(await exists(newWorktree)).toBe(false);
    const pending = JSON.parse(await readFile(markerPath(h.checkout), "utf8")) as {
      wuName: string; createdFor: { name: string }; renameMovePending: Record<string, string> };
    expect(pending).toMatchObject({ wuName: "new-name", createdFor: { name: "new-name" } });
    expect(pending.renameMovePending).toEqual({ oldSlug: "old-name", newSlug: "new-name", branch: "feat/new-name",
      head: await git(h.checkout, ["rev-parse", "HEAD"]), from: h.checkout, to: newWorktree });
    expect(await git(h.checkout, ["branch", "--show-current"])).toBe("feat/new-name");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/old-name"])).toBe("");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/new-name"])).not.toBe("");

    await execFileAsync("git", ["worktree", "move", "-f", "-f", h.checkout, newWorktree], { cwd: fixture.repo });
    const replay = await runArcNoTty(["rename", "old-name", "new-name"], newWorktree, { timeout: 20_000 });

    expect(replay.exitCode, replay.stdout + replay.stderr).toBe(0);
    const moved = JSON.parse(await readFile(markerPath(newWorktree), "utf8")) as { renameMovePending?: unknown };
    expect(moved.renameMovePending).toBeUndefined();
  }, 45_000);

  it("resumes after a stale remote lease and keeps the old remote branch a peer moved", async () => {
    const fixture = await storeFixture();
    const h = await startedWorkUnit(fixture, { spawned: true });
    const hook = join(fixture.remote, "hooks", "post-receive");
    await writeFile(hook, ["#!/bin/sh", "while read old new ref; do",
      "  if [ \"$ref\" = \"refs/heads/feat/new-name\" ] && [ ! -f arc-rename-fired ]; then",
      "    touch arc-rename-fired", "    git update-ref refs/heads/feat/old-name refs/heads/main", "  fi", "done", ""].join("\n"), "utf8");
    await chmod(hook, 0o755);

    const interrupted = await runArcNoTty(["rename", "old-name", "new-name"], h.checkout, { timeout: 20_000 });

    expect(interrupted.exitCode).toBe(1);
    expect(interrupted.stdout + interrupted.stderr).toContain("Old remote head moved");
    expect(await git(h.checkout, ["branch", "--show-current"])).toBe("feat/new-name");

    const resumed = await runArcNoTty(["rename", "old-name", "new-name"], h.checkout, { timeout: 20_000 });

    expect(resumed.exitCode, resumed.stdout + resumed.stderr).toBe(0);
    expect(unwrapPresentationOutput(resumed.stdout)).toContain("kept feat/old-name");
    const main = await git(fixture.repo, ["rev-parse", "main"]);
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/old-name"])).toBe(`${main}\trefs/heads/feat/old-name`);
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/new-name"])).not.toBe("");
  }, 45_000);
});
