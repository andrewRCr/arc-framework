import { afterEach, describe, expect, it } from "vitest";

import {
  addBareRemote,
  cleanupTempDir,
  createTempRepo,
  ensureDir,
  execFileAsync,
  join,
  makeCommit,
  makeGitExec,
  makeGitExecInput,
  makeUserIO,
  readFile,
  writeFile,
} from "../helpers/integration.js";
import { setupMultiClone, type MultiClone } from "../helpers/multi-clone.js";
import { reconcileNotesPush, runUserCompact, type UserIOContext } from "../../src/commands/user.js";
import { planBranchBoundedNotesExport } from "../../src/lib/user-sync/branch-bounded-notes-export.js";
import { CROSS_WU_NOTE_WINDOW, listNoteEntries, readNotesCompactionSyncMarker } from "../../src/lib/user-sync/index.js";
import {
  adoptCompactedNotesRef,
  compactNotesRefSnapshot,
  readNotesCompactionManifest,
} from "../../src/lib/user-sync/compaction.js";

const IDENTITY = "test-user";
const NOTES_REF = `refs/notes/arc/user/${IDENTITY}`;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function addRemoteNote(remote: string, commit: string, message: string): Promise<void> {
  await git(remote, [
    "-c", "user.email=test@test.com",
    "-c", "user.name=Test User",
    "notes", `--ref=${NOTES_REF}`, "add", "-m", message, commit,
  ]);
}

async function makeDatedCommit(cwd: string, message: string, date: string): Promise<string> {
  await execFileAsync(
    "git",
    ["-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", message],
    {
      cwd,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      },
    },
  );
  return git(cwd, ["rev-parse", "HEAD"]);
}

async function writeCompletedMeta(cwd: string, sequence: string, slug: string, completedAt: string): Promise<void> {
  const dir = join(cwd, ".arc", "completed", "2026-q2", `${sequence}_${slug}`);
  await ensureDir(dir);
  await writeFile(
    join(dir, `meta-${slug}.md`),
    "# Metadata: test\n\n"
    + "- **State:** Shipped\n"
    + `- **Completed:** ${completedAt}\n`,
    "utf-8",
  );
}

async function noteContent(cwd: string, commit: string): Promise<string> {
  return git(cwd, ["notes", `--ref=${NOTES_REF}`, "show", commit]);
}

/**
 * Render a retention-count mismatch as the retained/pruned note partition — each note's annotated
 * commit, committer date, and manifest paths — so a future regression in this fixture-cost-sensitive
 * test is debuggable from the failure alone rather than requiring a local re-run.
 */
async function formatRetentionMismatch(input: {
  repo: string;
  preCompactionCommits: readonly string[];
  actualRetained: number;
  actualPruned: number;
  expectedRetained: number;
  expectedPruned: number;
}): Promise<string> {
  const { repo, preCompactionCommits, actualRetained, actualPruned, expectedRetained, expectedPruned } = input;
  const survivingCommits = (await listNoteEntries(makeGitExec(repo), NOTES_REF)).map((entry) => entry.commit);
  const survivingSet = new Set(survivingCommits);
  const prunedCommits = preCompactionCommits.filter((commit) => !survivingSet.has(commit));
  return [
    `retention partition mismatch: retained ${actualRetained} (expected ${expectedRetained}), `
    + `pruned ${actualPruned} (expected ${expectedPruned})`,
    `retained notes (${survivingCommits.length}):`,
    ...await describeNotePartition(repo, survivingCommits),
    `pruned notes (${prunedCommits.length}):`,
    ...await describeNotePartition(repo, prunedCommits),
  ].join("\n");
}

async function describeNotePartition(repo: string, commits: readonly string[]): Promise<string[]> {
  const lines: string[] = [];
  for (const commit of commits) {
    const committedAt = await git(repo, ["show", "-s", "--format=%cI", commit]);
    let paths = "(note pruned)";
    try {
      const manifest = JSON.parse(await noteContent(repo, commit)) as { files?: Record<string, unknown> };
      const keys = Object.keys(manifest.files ?? {});
      paths = keys.length > 0 ? keys.join(", ") : "(empty manifest)";
    } catch {
      // Note absent (pruned) or unparseable — keep the default marker.
    }
    lines.push(`  ${commit.slice(0, 8)}  ${committedAt}  ${paths}`);
  }
  return lines;
}

describe("user notes compaction", () => {
  let repo: string | undefined;
  let remote: string | undefined;
  let updater: string | undefined;
  let harness: MultiClone | undefined;

  afterEach(async () => {
    if (repo) await cleanupTempDir(repo);
    if (remote) await cleanupTempDir(remote);
    if (updater) await cleanupTempDir(updater);
    if (harness) await harness.cleanup();
    repo = undefined;
    remote = undefined;
    updater = undefined;
    harness = undefined;
  });

  it("returns a failed result when the notes lock cannot be acquired", async () => {
    const io: UserIOContext = {
      exec: async (cmd, args) => {
        if (cmd === "git" && args[0] === "fetch" && args[1] === "origin") {
          return { stdout: "", stderr: "" };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          throw new Error("common dir unavailable");
        }
        throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
      },
      execInput: async () => "",
      readFile: async () => {
        throw new Error("unexpected readFile");
      },
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      readDir: async () => [],
      writeNote: async () => undefined,
      readNote: async () => null,
    };

    const result = await runUserCompact({
      cwd: "/repo",
      io,
      identity: IDENTITY,
      now: "2026-07-07T00:00:00.000Z",
    });

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.error.message).toContain("common dir unavailable");
  });

  it("publishes a single snapshot commit with retained notes and a cumulative prune manifest", async () => {
    repo = await createTempRepo("arc-notes-compact-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    const keepCommit = await makeCommit(repo, "keep note");
    const pruneCommit = await makeCommit(repo, "prune note");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "keep", keepCommit]);
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "prune", pruneCommit]);
    await git(repo, ["push", "origin", NOTES_REF]);

    const entries = await listNoteEntries(makeGitExec(repo), NOTES_REF);
    const retained = entries.filter((entry) => entry.commit === keepCommit);
    const pruned = entries.filter((entry) => entry.commit === pruneCommit);

    const outcome = await compactNotesRefSnapshot({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      fullRef: NOTES_REF,
      retained,
      pruned,
    });

    expect(outcome.kind).toBe("compacted");
    if (outcome.kind !== "compacted") return;
    expect(await git(repo, ["rev-list", "--count", NOTES_REF])).toBe("1");
    expect(await git(remote, ["rev-list", "--count", NOTES_REF])).toBe("1");
    expect(await noteContent(repo, keepCommit)).toBe("keep");
    await expect(git(repo, ["notes", `--ref=${NOTES_REF}`, "show", pruneCommit])).rejects.toThrow();
    expect(await git(remote, ["rev-parse", outcome.backupRef])).toBe(outcome.preCompactionTip);

    const manifest = await readNotesCompactionManifest(makeGitExec(repo), NOTES_REF);
    expect(manifest).not.toBeNull();
    expect(manifest?.generation).toBe(1);
    expect(manifest?.preCompactionTip).toBe(outcome.preCompactionTip);
    expect(manifest?.pruned).toEqual(pruned);
  });

  it("preserves the manifest across ordinary saves and same-generation note merges", async () => {
    repo = await createTempRepo("arc-notes-compact-preserve-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    const keepCommit = await makeCommit(repo, "keep note");
    const pruneCommit = await makeCommit(repo, "prune note");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "keep", keepCommit]);
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "prune", pruneCommit]);
    await git(repo, ["push", "origin", NOTES_REF]);

    const entries = await listNoteEntries(makeGitExec(repo), NOTES_REF);
    const outcome = await compactNotesRefSnapshot({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      fullRef: NOTES_REF,
      retained: entries.filter((entry) => entry.commit === keepCommit),
      pruned: entries.filter((entry) => entry.commit === pruneCommit),
    });
    expect(outcome.kind).toBe("compacted");
    if (outcome.kind !== "compacted") return;

    const postSnapshotCommit = await makeCommit(repo, "post snapshot note");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "post snapshot", postSnapshotCommit]);
    expect((await readNotesCompactionManifest(makeGitExec(repo), NOTES_REF))?.generation).toBe(1);

    const snapshotTip = outcome.snapshotTip;
    const localMergeRef = `${NOTES_REF}__merge_local`;
    const siblingMergeRef = `${NOTES_REF}__merge_sibling`;
    const localCommit = await makeCommit(repo, "local same-generation note");
    const siblingCommit = await makeCommit(repo, "sibling same-generation note");
    await git(repo, ["update-ref", localMergeRef, snapshotTip]);
    await git(repo, ["update-ref", siblingMergeRef, snapshotTip]);
    await git(repo, ["notes", `--ref=${localMergeRef}`, "add", "-m", "local", localCommit]);
    await git(repo, ["notes", `--ref=${siblingMergeRef}`, "add", "-m", "sibling", siblingCommit]);
    await git(repo, ["notes", `--ref=${localMergeRef}`, "merge", "-s", "cat_sort_uniq", siblingMergeRef]);

    const manifest = await readNotesCompactionManifest(makeGitExec(repo), localMergeRef);
    expect(manifest?.generation).toBe(1);
    expect(manifest?.pruned).toEqual(entries.filter((entry) => entry.commit === pruneCommit));
  });

  it("rolls the local ref back when the lease-push is declined", async () => {
    repo = await createTempRepo("arc-notes-compact-lease-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    const keepCommit = await makeCommit(repo, "keep note");
    const pruneCommit = await makeCommit(repo, "prune note");
    const concurrentCommit = await makeCommit(repo, "concurrent note");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "keep", keepCommit]);
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "prune", pruneCommit]);
    await git(repo, ["push", "origin", NOTES_REF]);
    const localBefore = await git(repo, ["rev-parse", NOTES_REF]);

    const entries = await listNoteEntries(makeGitExec(repo), NOTES_REF);
    const retained = entries.filter((entry) => entry.commit === keepCommit);
    const pruned = entries.filter((entry) => entry.commit === pruneCommit);

    const outcome = await compactNotesRefSnapshot({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      fullRef: NOTES_REF,
      retained,
      pruned,
      onBeforePublish: async () => {
        if (remote === undefined) throw new Error("missing remote");
        await addRemoteNote(remote, concurrentCommit, "concurrent");
      },
    });

    expect(outcome.kind).toBe("lease-declined");
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localBefore);
    expect(await noteContent(repo, keepCommit)).toBe("keep");
    expect(await noteContent(repo, pruneCommit)).toBe("prune");
    expect(await noteContent(remote, concurrentCommit)).toBe("concurrent");
  });

  it("adopts a compacted snapshot without dropping local-only notes or resurrecting pruned notes", async () => {
    harness = await setupMultiClone({
      cloneA: { config: { "arc.identity": IDENTITY } },
      cloneB: { config: { "arc.identity": IDENTITY } },
    });
    const { cloneA, cloneB } = harness;
    const keepCommit = await makeCommit(cloneA, "keep");
    const pruneCommit = await makeCommit(cloneA, "prune");
    const localOnlyCommit = await makeCommit(cloneA, "local only");
    await git(cloneA, ["push", "origin", "main"]);
    await git(cloneB, ["fetch", "origin", "main"]);
    await git(cloneB, ["reset", "--hard", "origin/main"]);

    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "keep", keepCommit]);
    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "prune", pruneCommit]);
    await git(cloneA, ["push", "origin", NOTES_REF]);
    await fetchNotesInto(cloneB, NOTES_REF);
    await git(cloneB, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "local-only", localOnlyCommit]);

    const entries = await listNoteEntries(makeGitExec(cloneA), NOTES_REF);
    const compact = await compactNotesRefSnapshot({
      exec: makeGitExec(cloneA),
      execInput: makeGitExecInput(cloneA),
      fullRef: NOTES_REF,
      retained: entries.filter((entry) => entry.commit === keepCommit),
      pruned: entries.filter((entry) => entry.commit === pruneCommit),
    });
    expect(compact.kind).toBe("compacted");

    const incoming = `${NOTES_REF}__incoming_test`;
    await fetchNotesInto(cloneB, incoming);
    const adopt = await adoptCompactedNotesRef({
      exec: makeGitExec(cloneB),
      execInput: makeGitExecInput(cloneB),
      fullRef: NOTES_REF,
      snapshotRef: incoming,
    });

    expect(adopt.kind).toBe("adopted");
    expect(await noteContent(cloneB, keepCommit)).toBe("keep");
    expect(await noteContent(cloneB, localOnlyCommit)).toBe("local-only");
    await expect(git(cloneB, ["notes", `--ref=${NOTES_REF}`, "show", pruneCommit])).rejects.toThrow();
  }, 15_000);

  it("unions a valid same-commit collision on top of the adopted snapshot", async () => {
    harness = await setupMultiClone({
      cloneA: { config: { "arc.identity": IDENTITY } },
      cloneB: { config: { "arc.identity": IDENTITY } },
    });
    const { cloneA, cloneB } = harness;
    const collisionCommit = await makeCommit(cloneA, "collision");
    const pruneCommit = await makeCommit(cloneA, "prune");
    await git(cloneA, ["push", "origin", "main"]);
    await git(cloneB, ["fetch", "origin", "main"]);
    await git(cloneB, ["reset", "--hard", "origin/main"]);

    await git(cloneA, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": "remote\n" } }),
      collisionCommit,
    ]);
    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "prune", pruneCommit]);
    await git(cloneA, ["push", "origin", NOTES_REF]);
    await fetchNotesInto(cloneB, NOTES_REF);
    await git(cloneB, [
      "notes", `--ref=${NOTES_REF}`, "add", "-f", "-m",
      JSON.stringify({ version: 2, files: { "USER-INBOX.md": "local\n" } }),
      collisionCommit,
    ]);

    const entries = await listNoteEntries(makeGitExec(cloneA), NOTES_REF);
    await compactNotesRefSnapshot({
      exec: makeGitExec(cloneA),
      execInput: makeGitExecInput(cloneA),
      fullRef: NOTES_REF,
      retained: entries.filter((entry) => entry.commit === collisionCommit),
      pruned: entries.filter((entry) => entry.commit === pruneCommit),
    });
    const incoming = `${NOTES_REF}__incoming_collision`;
    await fetchNotesInto(cloneB, incoming);
    const adopt = await adoptCompactedNotesRef({
      exec: makeGitExec(cloneB),
      execInput: makeGitExecInput(cloneB),
      fullRef: NOTES_REF,
      snapshotRef: incoming,
    });

    expect(adopt.kind).toBe("adopted");
    const merged = JSON.parse(await noteContent(cloneB, collisionCommit)) as { files: Record<string, string> };
    expect(merged.files).toEqual({
      "USER-INBOX.md": "local\n",
      "WORKING-MEMORY.md": "remote\n",
    });
  }, 15_000);

  it("conflicts when a same-commit collision changes the same file content", async () => {
    harness = await setupMultiClone({
      cloneA: { config: { "arc.identity": IDENTITY } },
      cloneB: { config: { "arc.identity": IDENTITY } },
    });
    const { cloneA, cloneB } = harness;
    const collisionCommit = await makeCommit(cloneA, "collision");
    const pruneCommit = await makeCommit(cloneA, "prune");
    await git(cloneA, ["push", "origin", "main"]);
    await git(cloneB, ["fetch", "origin", "main"]);
    await git(cloneB, ["reset", "--hard", "origin/main"]);

    await git(cloneA, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": "remote\n" } }),
      collisionCommit,
    ]);
    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "prune", pruneCommit]);
    await git(cloneA, ["push", "origin", NOTES_REF]);
    await fetchNotesInto(cloneB, NOTES_REF);
    await git(cloneB, [
      "notes", `--ref=${NOTES_REF}`, "add", "-f", "-m",
      JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": "local\n" } }),
      collisionCommit,
    ]);
    const localTip = await git(cloneB, ["rev-parse", NOTES_REF]);

    const entries = await listNoteEntries(makeGitExec(cloneA), NOTES_REF);
    await compactNotesRefSnapshot({
      exec: makeGitExec(cloneA),
      execInput: makeGitExecInput(cloneA),
      fullRef: NOTES_REF,
      retained: entries.filter((entry) => entry.commit === collisionCommit),
      pruned: entries.filter((entry) => entry.commit === pruneCommit),
    });
    const incoming = `${NOTES_REF}__incoming_same_path`;
    await fetchNotesInto(cloneB, incoming);
    const adopt = await adoptCompactedNotesRef({
      exec: makeGitExec(cloneB),
      execInput: makeGitExecInput(cloneB),
      fullRef: NOTES_REF,
      snapshotRef: incoming,
    });

    expect(adopt.kind).toBe("conflict");
    expect(await git(cloneB, ["rev-parse", NOTES_REF])).toBe(localTip);
    const local = JSON.parse(await noteContent(cloneB, collisionCommit)) as { files: Record<string, string> };
    expect(local.files["WORKING-MEMORY.md"]).toBe("local\n");
  }, 15_000);

  it("leaves the local ref untouched when a same-commit collision cannot be parsed", async () => {
    harness = await setupMultiClone({
      cloneA: { config: { "arc.identity": IDENTITY } },
      cloneB: { config: { "arc.identity": IDENTITY } },
    });
    const { cloneA, cloneB } = harness;
    const collisionCommit = await makeCommit(cloneA, "collision");
    const pruneCommit = await makeCommit(cloneA, "prune");
    await git(cloneA, ["push", "origin", "main"]);
    await git(cloneB, ["fetch", "origin", "main"]);
    await git(cloneB, ["reset", "--hard", "origin/main"]);

    await git(cloneA, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": "remote\n" } }),
      collisionCommit,
    ]);
    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "prune", pruneCommit]);
    await git(cloneA, ["push", "origin", NOTES_REF]);
    await fetchNotesInto(cloneB, NOTES_REF);
    await git(cloneB, ["notes", `--ref=${NOTES_REF}`, "add", "-f", "-m", "not json", collisionCommit]);
    const localBefore = await git(cloneB, ["rev-parse", NOTES_REF]);

    const entries = await listNoteEntries(makeGitExec(cloneA), NOTES_REF);
    await compactNotesRefSnapshot({
      exec: makeGitExec(cloneA),
      execInput: makeGitExecInput(cloneA),
      fullRef: NOTES_REF,
      retained: entries.filter((entry) => entry.commit === collisionCommit),
      pruned: entries.filter((entry) => entry.commit === pruneCommit),
    });
    const incoming = `${NOTES_REF}__incoming_unparseable`;
    await fetchNotesInto(cloneB, incoming);
    const adopt = await adoptCompactedNotesRef({
      exec: makeGitExec(cloneB),
      execInput: makeGitExecInput(cloneB),
      fullRef: NOTES_REF,
      snapshotRef: incoming,
    });

    expect(adopt.kind).toBe("conflict");
    expect(await git(cloneB, ["rev-parse", NOTES_REF])).toBe(localBefore);
    expect(await noteContent(cloneB, collisionCommit)).toBe("not json");
  }, 15_000);

  it("uses the cumulative manifest when adopting across multiple compaction generations", async () => {
    harness = await setupMultiClone({
      cloneA: { config: { "arc.identity": IDENTITY } },
      cloneB: { config: { "arc.identity": IDENTITY } },
    });
    const { cloneA, cloneB } = harness;
    const keepCommit = await makeCommit(cloneA, "keep");
    const pruneOneCommit = await makeCommit(cloneA, "prune one");
    const pruneTwoCommit = await makeCommit(cloneA, "prune two");
    await git(cloneA, ["push", "origin", "main"]);
    await git(cloneB, ["fetch", "origin", "main"]);
    await git(cloneB, ["reset", "--hard", "origin/main"]);

    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "keep", keepCommit]);
    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "one", pruneOneCommit]);
    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "two", pruneTwoCommit]);
    await git(cloneA, ["push", "origin", NOTES_REF]);
    await fetchNotesInto(cloneB, NOTES_REF);

    let entries = await listNoteEntries(makeGitExec(cloneA), NOTES_REF);
    await compactNotesRefSnapshot({
      exec: makeGitExec(cloneA),
      execInput: makeGitExecInput(cloneA),
      fullRef: NOTES_REF,
      retained: entries.filter((entry) => entry.commit !== pruneOneCommit),
      pruned: entries.filter((entry) => entry.commit === pruneOneCommit),
    });
    entries = await listNoteEntries(makeGitExec(cloneA), NOTES_REF);
    await compactNotesRefSnapshot({
      exec: makeGitExec(cloneA),
      execInput: makeGitExecInput(cloneA),
      fullRef: NOTES_REF,
      retained: entries.filter((entry) => entry.commit !== pruneTwoCommit),
      pruned: entries.filter((entry) => entry.commit === pruneTwoCommit),
    });

    const incoming = `${NOTES_REF}__incoming_generation`;
    await fetchNotesInto(cloneB, incoming);
    const adopt = await adoptCompactedNotesRef({
      exec: makeGitExec(cloneB),
      execInput: makeGitExecInput(cloneB),
      fullRef: NOTES_REF,
      snapshotRef: incoming,
    });

    expect(adopt.kind).toBe("adopted");
    expect(await noteContent(cloneB, keepCommit)).toBe("keep");
    await expect(git(cloneB, ["notes", `--ref=${NOTES_REF}`, "show", pruneOneCommit])).rejects.toThrow();
    await expect(git(cloneB, ["notes", `--ref=${NOTES_REF}`, "show", pruneTwoCommit])).rejects.toThrow();
    expect((await readNotesCompactionManifest(makeGitExec(cloneB), NOTES_REF))?.generation).toBe(2);
  }, 15_000);

  it("warns when adoption restores a note that the pre-compaction tree proves was omitted", async () => {
    harness = await setupMultiClone({
      cloneA: { config: { "arc.identity": IDENTITY } },
      cloneB: { config: { "arc.identity": IDENTITY } },
    });
    const { cloneA, cloneB } = harness;
    const keepCommit = await makeCommit(cloneA, "keep");
    const omittedCommit = await makeCommit(cloneA, "omitted");
    const pruneCommit = await makeCommit(cloneA, "prune");
    await git(cloneA, ["push", "origin", "main"]);
    await git(cloneB, ["fetch", "origin", "main"]);
    await git(cloneB, ["reset", "--hard", "origin/main"]);

    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "keep", keepCommit]);
    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "omitted", omittedCommit]);
    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "prune", pruneCommit]);
    await git(cloneA, ["push", "origin", NOTES_REF]);
    await fetchNotesInto(cloneB, NOTES_REF);

    const entries = await listNoteEntries(makeGitExec(cloneA), NOTES_REF);
    await compactNotesRefSnapshot({
      exec: makeGitExec(cloneA),
      execInput: makeGitExecInput(cloneA),
      fullRef: NOTES_REF,
      retained: entries.filter((entry) => entry.commit === keepCommit),
      pruned: entries.filter((entry) => entry.commit === pruneCommit),
    });

    const incoming = `${NOTES_REF}__incoming_warning`;
    await fetchNotesInto(cloneB, incoming);
    const adopt = await adoptCompactedNotesRef({
      exec: makeGitExec(cloneB),
      execInput: makeGitExecInput(cloneB),
      fullRef: NOTES_REF,
      snapshotRef: incoming,
    });

    expect(adopt.kind).toBe("adopted");
    if (adopt.kind !== "adopted") return;
    expect(adopt.warnings).toEqual([
      expect.stringContaining(`Generation 1 snapshot omitted pre-compaction note ${omittedCommit.slice(0, 8)}`),
    ]);
    expect(await noteContent(cloneB, omittedCommit)).toBe("omitted");
  }, 15_000);

  it("canonical export refuses a newer compaction generation without adopting it", async () => {
    harness = await setupMultiClone({
      cloneA: { config: { "arc.identity": IDENTITY } },
      cloneB: { config: { "arc.identity": IDENTITY } },
    });
    const { cloneA, cloneB } = harness;
    const keepCommit = await makeCommit(cloneA, "keep");
    const pruneCommit = await makeCommit(cloneA, "prune");
    const localOnlyCommit = await makeCommit(cloneA, "local only");
    await git(cloneA, ["push", "origin", "main"]);
    await git(cloneB, ["fetch", "origin", "main"]);
    await git(cloneB, ["reset", "--hard", "origin/main"]);

    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "keep", keepCommit]);
    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "prune", pruneCommit]);
    await git(cloneA, ["push", "origin", NOTES_REF]);
    await fetchNotesInto(cloneB, NOTES_REF);
    await git(cloneB, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "local-only", localOnlyCommit]);
    const localTip = await git(cloneB, ["rev-parse", NOTES_REF]);

    const entries = await listNoteEntries(makeGitExec(cloneA), NOTES_REF);
    await compactNotesRefSnapshot({
      exec: makeGitExec(cloneA),
      execInput: makeGitExecInput(cloneA),
      fullRef: NOTES_REF,
      retained: entries.filter((entry) => entry.commit === keepCommit),
      pruned: entries.filter((entry) => entry.commit === pruneCommit),
    });

    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(cloneB),
      execInput: makeGitExecInput(cloneB),
      identity: IDENTITY,
    });
    expect(plan).toMatchObject({ kind: "refused", reason: "compaction-lineage" });
    expect(await git(cloneB, ["rev-parse", NOTES_REF])).toBe(localTip);
    expect(await noteContent(harness.origin, keepCommit)).toBe("keep");
    await expect(noteContent(harness.origin, pruneCommit)).rejects.toThrow();
    await expect(noteContent(harness.origin, localOnlyCommit)).rejects.toThrow();
  }, 15_000);

  it("non-fast-forward reconcile refuses a newer generation without merging or adoption", async () => {
    harness = await setupMultiClone({
      cloneA: { config: { "arc.identity": IDENTITY } },
      cloneB: { config: { "arc.identity": IDENTITY } },
    });
    const { cloneA, cloneB } = harness;
    const keepCommit = await makeCommit(cloneA, "keep");
    const pruneCommit = await makeCommit(cloneA, "prune");
    const localOnlyCommit = await makeCommit(cloneA, "local only");
    await git(cloneA, ["push", "origin", "main"]);
    await git(cloneB, ["fetch", "origin", "main"]);
    await git(cloneB, ["reset", "--hard", "origin/main"]);

    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "keep", keepCommit]);
    await git(cloneA, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "prune", pruneCommit]);
    await git(cloneA, ["push", "origin", NOTES_REF]);
    await fetchNotesInto(cloneB, NOTES_REF);
    await git(cloneB, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "local-only", localOnlyCommit]);

    const entries = await listNoteEntries(makeGitExec(cloneA), NOTES_REF);
    await compactNotesRefSnapshot({
      exec: makeGitExec(cloneA),
      execInput: makeGitExecInput(cloneA),
      fullRef: NOTES_REF,
      retained: entries.filter((entry) => entry.commit === keepCommit),
      pruned: entries.filter((entry) => entry.commit === pruneCommit),
    });
    const localBefore = await git(cloneB, ["rev-parse", NOTES_REF]);
    const remoteBefore = await git(harness.origin, ["rev-parse", NOTES_REF]);
    const stateDir = join(cloneB, ".arc", "user", IDENTITY, ".internal");
    const statePath = join(stateDir, ".sync-state.json");
    const markerState = '{"partialPush":{"localRefHash":"sentinel","sourceCommit":"sentinel"}}\n';
    await ensureDir(stateDir);
    await writeFile(statePath, markerState, "utf-8");

    const outcome = await reconcileNotesPush({
      cwd: cloneB,
      io: makeUserIO(cloneB),
      identity: IDENTITY,
    });

    expect(outcome).toMatchObject({ kind: "refused", reason: "compaction-lineage" });
    expect(await git(cloneB, ["rev-parse", NOTES_REF])).toBe(localBefore);
    expect(await git(harness.origin, ["rev-parse", NOTES_REF])).toBe(remoteBefore);
    expect(await readFile(statePath, "utf-8")).toBe(markerState);
    await expect(git(harness.origin, ["notes", `--ref=${NOTES_REF}`, "show", pruneCommit])).rejects.toThrow();
    await expect(noteContent(harness.origin, localOnlyCommit)).rejects.toThrow();
    expect(await noteContent(cloneB, localOnlyCommit)).toBe("local-only");
  }, 15_000);

  it("arc user compact collapses history, publishes the generation marker, and then no-ops", async () => {
    repo = await createTempRepo("arc-notes-compact-command-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    const keepCommit = await makeCommit(repo, "keep");
    const legacyCommit = await makeCommit(repo, "legacy root session notes");
    await git(repo, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": "keep\n" } }),
      keepCommit,
    ]);
    await git(repo, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "legacy\n" } }),
      legacyCommit,
    ]);
    await git(repo, ["push", "origin", NOTES_REF]);
    expect(await git(repo, ["rev-list", "--count", NOTES_REF])).toBe("2");

    const result = await runUserCompact({
      cwd: repo,
      io: makeUserIO(repo),
      identity: IDENTITY,
      now: "2026-07-07T00:00:00.000Z",
    });

    expect(result.kind).toBe("compacted");
    if (result.kind !== "compacted") return;
    expect(result.prunedCount).toBe(1);
    expect(result.retainedCount).toBe(1);
    expect(await git(repo, ["rev-list", "--count", NOTES_REF])).toBe("1");
    expect(await git(remote, ["rev-list", "--count", NOTES_REF])).toBe("1");
    expect(await noteContent(repo, keepCommit)).toContain("WORKING-MEMORY.md");
    await expect(git(repo, ["notes", `--ref=${NOTES_REF}`, "show", legacyCommit])).rejects.toThrow();

    const localMarker = await readNotesCompactionSyncMarker({ exec: makeGitExec(repo), identity: IDENTITY });
    const remoteMarker = await readNotesCompactionSyncMarker({ exec: makeGitExec(remote), identity: IDENTITY });
    expect(localMarker?.generation).toBe(1);
    expect(localMarker?.snapshotTip).toBe(result.snapshotTip);
    expect(remoteMarker).toEqual(localMarker);

    const second = await runUserCompact({
      cwd: repo,
      io: makeUserIO(repo),
      identity: IDENTITY,
      now: "2026-07-08T00:00:00.000Z",
    });
    expect(second).toMatchObject({ kind: "nothing-to-prune", retainedCount: 1, prunedCount: 0 });
  }, 15_000);

  it("fails closed when local user subdirs cannot be read", async () => {
    repo = await createTempRepo("arc-notes-compact-subdir-read-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    const keepCommit = await makeCommit(repo, "keep");
    const legacyCommit = await makeCommit(repo, "legacy root session notes");
    await git(repo, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": "keep\n" } }),
      keepCommit,
    ]);
    await git(repo, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "legacy\n" } }),
      legacyCommit,
    ]);
    await git(repo, ["push", "origin", NOTES_REF]);

    const io = makeUserIO(repo);
    const result = await runUserCompact({
      cwd: repo,
      io: {
        ...io,
        readDir: async () => {
          const err = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
          err.code = "EACCES";
          throw err;
        },
      },
      identity: IDENTITY,
      now: "2026-07-07T00:00:00.000Z",
    });

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.error.message).toContain("permission denied");
    expect(await git(repo, ["rev-list", "--count", NOTES_REF])).toBe("2");
    expect(await git(remote, ["rev-list", "--count", NOTES_REF])).toBe("2");
  }, 15_000);

  it("prunes backup refs by encoded creation time, not target commit time", async () => {
    repo = await createTempRepo("arc-notes-compact-backup-age-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    const keepCommit = await makeCommit(repo, "keep");
    const legacyCommit = await makeCommit(repo, "legacy root session notes");
    await git(repo, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": "keep\n" } }),
      keepCommit,
    ]);
    await git(repo, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "legacy\n" } }),
      legacyCommit,
    ]);
    await git(repo, ["push", "origin", NOTES_REF]);

    const first = await runUserCompact({
      cwd: repo,
      io: makeUserIO(repo),
      identity: IDENTITY,
      now: "2026-07-01T00:00:00.000Z",
    });
    expect(first.kind).toBe("compacted");
    if (first.kind !== "compacted") return;
    expect(first.backupRef).toContain(`-created-${Date.parse("2026-07-01T00:00:00.000Z")}-`);

    const oldTarget = await makeDatedCommit(repo, "old backup target", "2026-01-01T00:00:00.000Z");
    await git(repo, ["update-ref", first.backupRef, oldTarget]);

    const secondLegacyCommit = await makeCommit(repo, "second legacy root session notes");
    await git(repo, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "legacy 2\n" } }),
      secondLegacyCommit,
    ]);
    await git(repo, ["push", "origin", NOTES_REF]);

    const second = await runUserCompact({
      cwd: repo,
      io: makeUserIO(repo),
      identity: IDENTITY,
      now: "2026-07-07T00:00:00.000Z",
    });

    expect(second.kind).toBe("compacted");
    if (second.kind !== "compacted") return;
    expect(second.generation).toBe(2);
    expect(second.backupPrune.deletedRefs).not.toContain(first.backupRef);
    expect(await git(repo, ["rev-parse", first.backupRef])).toBe(oldTarget);
  }, 30_000);

  it("prunes a local backup ref when the remote side is already missing", async () => {
    repo = await createTempRepo("arc-notes-compact-backup-retry-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    const keepCommit = await makeCommit(repo, "keep");
    const legacyCommit = await makeCommit(repo, "legacy root session notes");
    await git(repo, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": "keep\n" } }),
      keepCommit,
    ]);
    await git(repo, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "legacy\n" } }),
      legacyCommit,
    ]);
    await git(repo, ["push", "origin", NOTES_REF]);

    const first = await runUserCompact({
      cwd: repo,
      io: makeUserIO(repo),
      identity: IDENTITY,
      now: "2026-06-01T00:00:00.000Z",
    });
    expect(first.kind).toBe("compacted");
    if (first.kind !== "compacted") return;

    const staleBackupRef = `refs/backup/arc-user-${IDENTITY}-compaction-g0-created-`
      + `${Date.parse("2026-06-01T00:00:00.000Z")}-retry`;
    await git(repo, ["update-ref", staleBackupRef, first.preCompactionTip]);
    expect(await git(repo, ["rev-parse", staleBackupRef])).toBe(first.preCompactionTip);

    const secondLegacyCommit = await makeCommit(repo, "second legacy root session notes");
    await git(repo, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "legacy 2\n" } }),
      secondLegacyCommit,
    ]);
    await git(repo, ["push", "origin", NOTES_REF]);

    const second = await runUserCompact({
      cwd: repo,
      io: makeUserIO(repo),
      identity: IDENTITY,
      now: "2026-07-07T00:00:00.000Z",
    });

    expect(second.kind).toBe("compacted");
    if (second.kind !== "compacted") return;
    expect(second.backupPrune.deletedRefs).toContain(staleBackupRef);
    expect(second.backupPrune.failedRefs).toEqual([]);
    await expect(git(repo, ["rev-parse", staleBackupRef])).rejects.toThrow();
  }, 30_000);

  it("retains old shipped-WU notes until the archive age and local-subdir gates clear", async () => {
    repo = await createTempRepo("arc-notes-compact-retention-inputs-");
    await writeCompletedMeta(repo, "01", "recent-archive", "2026-06-20");
    await writeCompletedMeta(repo, "02", "local-subdir", "2026-05-01");
    await git(repo, ["add", ".arc/completed"]);
    await git(repo, ["commit", "-m", "archive shipped work"]);
    remote = await addBareRemote(repo);

    const recentCommit = await makeDatedCommit(repo, "recent archive note", "2026-01-01T00:00:00.000Z");
    const localSubdirCommit = await makeDatedCommit(repo, "local subdir note", "2026-01-02T00:00:00.000Z");
    await git(repo, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "recent-archive/SESSION-NOTES.md": "recent\n" } }),
      recentCommit,
    ]);
    await git(repo, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "local-subdir/SESSION-NOTES.md": "local\n" } }),
      localSubdirCommit,
    ]);

    // Filler count kept above both boundaries the retention path exercises: the newest-by-date window
    // (CROSS_WU_NOTE_WINDOW = 10) and the read-concurrency batch size (16, so more than one batch runs).
    // The full 302 filler that once seeded this fixture cost ~900 git subprocess spawns for no added
    // coverage — retention behavior is exercised identically at this count.
    const fillerCount = 35;
    for (let index = 0; index < fillerCount; index += 1) {
      const commit = await makeDatedCommit(
        repo,
        `filler ${index}`,
        `2026-07-01T00:${String(index).padStart(2, "0")}:00.000Z`,
      );
      await git(repo, [
        "notes", `--ref=${NOTES_REF}`, "add", "-m",
        JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": `filler ${index}\n` } }),
        commit,
      ]);
    }

    const notesTree = await git(repo, ["rev-parse", `${NOTES_REF}^{tree}`]);
    const notesSnapshot = await git(repo, ["commit-tree", notesTree, "-m", "retention fixture snapshot"]);
    await git(repo, ["update-ref", NOTES_REF, notesSnapshot]);

    await ensureDir(join(repo, ".arc", "user", IDENTITY, "local-subdir"));
    await writeFile(join(repo, ".arc", "user", IDENTITY, "local-subdir", "SESSION-NOTES.md"), "local\n", "utf-8");
    await git(repo, ["push", "origin", NOTES_REF]);

    const preCompactionCommits = (await listNoteEntries(makeGitExec(repo), NOTES_REF)).map((entry) => entry.commit);

    const result = await runUserCompact({
      cwd: repo,
      io: makeUserIO(repo),
      identity: IDENTITY,
      now: "2026-07-07T00:00:00.000Z",
    });

    expect(result.kind).toBe("compacted");
    if (result.kind !== "compacted") return;

    // The newest `CROSS_WU_NOTE_WINDOW` filler notes fill the by-date window; the two older special
    // notes survive only via the archive-age and local-subdir gates. Every other filler note is pruned.
    const gatedSpecialCount = 2;
    const expectedRetained = CROSS_WU_NOTE_WINDOW + gatedSpecialCount;
    const expectedPruned = fillerCount - CROSS_WU_NOTE_WINDOW;
    if (result.retainedCount !== expectedRetained || result.prunedCount !== expectedPruned) {
      throw new Error(await formatRetentionMismatch({
        repo,
        preCompactionCommits,
        actualRetained: result.retainedCount,
        actualPruned: result.prunedCount,
        expectedRetained,
        expectedPruned,
      }));
    }
    expect(await noteContent(repo, recentCommit)).toContain("recent-archive/SESSION-NOTES.md");
    expect(await noteContent(repo, localSubdirCommit)).toContain("local-subdir/SESSION-NOTES.md");
  }, 30_000);

  it("refreshes origin base before applying retired-WU retention", async () => {
    repo = await createTempRepo("arc-notes-compact-refresh-base-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);
    updater = await createTempRepo("arc-notes-compact-updater-");
    await cleanupTempDir(updater);
    await execFileAsync("git", ["clone", remote, updater]);
    await git(updater, ["config", "user.name", "Updater"]);
    await git(updater, ["config", "user.email", "updater@example.com"]);
    await writeCompletedMeta(updater, "01", "stale-base-shipped", "2026-05-01");
    await git(updater, ["add", ".arc/completed"]);
    await git(updater, ["commit", "-m", "archive shipped work"]);
    await git(updater, ["push", "origin", "main"]);

    await expect(
      execFileAsync("git", ["cat-file", "-e", "origin/main:.arc/completed/2026-q2/01_stale-base-shipped"], {
        cwd: repo,
      }),
    ).rejects.toThrow();

    const shippedCommit = await makeDatedCommit(repo, "shipped note", "2026-01-01T00:00:00.000Z");
    await git(repo, [
      "notes", `--ref=${NOTES_REF}`, "add", "-m",
      JSON.stringify({ version: 2, files: { "stale-base-shipped/SESSION-NOTES.md": "old\n" } }),
      shippedCommit,
    ]);
    for (let index = 0; index < 11; index += 1) {
      const commit = await makeDatedCommit(
        repo,
        `filler ${index}`,
        `2026-07-01T00:${String(index).padStart(2, "0")}:00.000Z`,
      );
      await git(repo, [
        "notes", `--ref=${NOTES_REF}`, "add", "-m",
        JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": `filler ${index}\n` } }),
        commit,
      ]);
    }
    await git(repo, ["push", "origin", NOTES_REF]);

    const result = await runUserCompact({
      cwd: repo,
      io: makeUserIO(repo),
      identity: IDENTITY,
      now: "2026-07-07T00:00:00.000Z",
    });

    expect(result.kind).toBe("compacted");
    if (result.kind !== "compacted") return;
    expect(result.prunedCount).toBe(2);
    await expect(git(repo, ["notes", `--ref=${NOTES_REF}`, "show", shippedCommit])).rejects.toThrow();
    await git(repo, ["cat-file", "-e", "origin/main:.arc/completed/2026-q2/01_stale-base-shipped"]);
  }, 30_000);
});

async function fetchNotesInto(cwd: string, ref: string): Promise<void> {
  await git(cwd, ["fetch", "--refmap=", "origin", `+${NOTES_REF}:${ref}`]);
}
