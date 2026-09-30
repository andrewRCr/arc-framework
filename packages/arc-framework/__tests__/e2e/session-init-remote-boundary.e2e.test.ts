/**
 * Real-repository proofs for the passive session-init remote-access boundary.
 *
 * These fixtures complement the handler-level trace tests with Git's actual
 * linked-worktree, promisor-clone, and shallow-history behavior.
 */

import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, git, removeGitBackedDir, runArc } from "./helpers.js";

const execFileAsync = promisify(execFile);

interface SessionEnvelope {
  worktree?: unknown;
  baseDistance?: unknown;
  baseBranchSync?: unknown;
  deliveryPosition?: unknown;
  userReferenceReconcile?: unknown;
  materializableWorkUnits?: {
    ok: boolean;
    value?: {
      remoteEvidence: string;
      pendingBranchCount: number;
      candidates: Array<{ name: string; branch: string }>;
    };
  };
  currentHusk?: unknown;
}

interface InFlightResult {
  remoteEvidence: string;
  candidateExpansion: { status: string; pendingBranchCount: number };
}

function parseJson<T>(stdout: string): T {
  return JSON.parse(stdout.trim()) as T;
}

async function initializePublishedProject(): Promise<{ publisher: string; remote: string }> {
  const publisher = await createTempRepo();
  const remote = await mkdtemp(join(tmpdir(), "arc-remote-boundary-origin-"));
  const initialized = await runArc(["init", "--yes", "--name", "test-project"], publisher);
  expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(publisher, ["remote", "add", "origin", remote]);
  await git(publisher, ["add", "-A"]);
  await git(publisher, ["commit", "-m", "install ARC"]);
  await git(publisher, ["push", "-u", "origin", "main"]);
  return { publisher, remote };
}

async function configureClone(repository: string): Promise<void> {
  await git(repository, ["config", "user.email", "arc@example.invalid"]);
  await git(repository, ["config", "user.name", "ARC Test"]);
  await git(repository, ["config", "arc.identity", "test-user"]);
}

async function writeWorkUnitMeta(repository: string, slug: string, branch: string): Promise<void> {
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  await writeFile(join(repository, ".arc", "active", `meta-${slug}.md`), makeMetaFixture(slug, {
    owner: "test-user", branch, workClass: "Light", nextAction: "Continue execution",
  }), "utf8");
}

async function objectInventory(repository: string): Promise<string[]> {
  const gitDirText = await git(repository, ["rev-parse", "--git-dir"]);
  const gitDir = isAbsolute(gitDirText) ? gitDirText : resolve(repository, gitDirText);
  return (await readdir(join(gitDir, "objects"), { recursive: true })).sort();
}

describe("session-init E2E — real remote-access boundaries", () => {
  it.skipIf(process.platform === "win32")(
    "returns the same code-repository facts when linked-worktree common metadata is read-only",
    async () => {
      const { publisher, remote } = await initializePublishedProject();
      const worktreeRoot = await mkdtemp(join(tmpdir(), "arc-readonly-linked-worktree-"));
      const linked = join(worktreeRoot, "linked");
      let commonDir: string | undefined;
      try {
        await git(publisher, ["worktree", "add", "-b", "feat/linked-boundary", linked, "main"]);
        await writeWorkUnitMeta(linked, "linked-boundary", "feat/linked-boundary");
        const unrestricted = await runArc(["status", "--session-init", "--json"], linked);
        expect(unrestricted.exitCode, unrestricted.stdout + unrestricted.stderr).toBe(0);

        const commonDirText = await git(linked, ["rev-parse", "--git-common-dir"]);
        commonDir = await realpath(isAbsolute(commonDirText) ? commonDirText : resolve(linked, commonDirText));
        await execFileAsync("chmod", ["-R", "a-w", commonDir]);

        const restricted = await runArc(["status", "--session-init", "--json"], linked);
        expect(restricted.exitCode, restricted.stdout + restricted.stderr).toBe(0);
        const before = parseJson<SessionEnvelope>(unrestricted.stdout);
        const after = parseJson<SessionEnvelope>(restricted.stdout);
        expect({
          worktree: after.worktree,
          baseDistance: after.baseDistance,
          baseBranchSync: after.baseBranchSync,
          deliveryPosition: after.deliveryPosition,
          userReferenceReconcile: after.userReferenceReconcile,
        }).toEqual({
          worktree: before.worktree,
          baseDistance: before.baseDistance,
          baseBranchSync: before.baseBranchSync,
          deliveryPosition: before.deliveryPosition,
          userReferenceReconcile: before.userReferenceReconcile,
        });
        expect(after.deliveryPosition).toEqual({ ok: true, value: null });
        expect(after.userReferenceReconcile, JSON.stringify(after.userReferenceReconcile)).toMatchObject({
          ok: true,
          value: { authority: { remoteEvidence: expect.stringMatching(/^(exact|not-applicable)$/u) } },
        });
      } finally {
        if (commonDir !== undefined) await execFileAsync("chmod", ["-R", "u+rwX", commonDir]);
        await Promise.all([
          cleanupTempDir(worktreeRoot),
          cleanupTempDir(publisher),
          removeGitBackedDir(remote),
        ]);
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "keeps a missing advertised promisor object pending until an explicit retry materializes it",
    async () => {
      const { publisher, remote } = await initializePublishedProject();
      const clientRoot = await mkdtemp(join(tmpdir(), "arc-promisor-session-init-"));
      const client = join(clientRoot, "client");
      const wrapperRoot = await mkdtemp(join(tmpdir(), "arc-denied-live-expansion-"));
      try {
        await git(remote, ["config", "uploadpack.allowFilter", "true"]);
        await execFileAsync("git", [
          "clone", "--filter=blob:none", pathToFileURL(remote).href, client,
        ]);
        await configureClone(client);

        const slug = "remote-work-unit";
        const branch = `feat/${slug}`;
        await git(publisher, ["switch", "-c", branch]);
        await writeWorkUnitMeta(publisher, slug, branch);
        await git(publisher, ["add", "-A"]);
        await git(publisher, ["commit", "-m", "add remote work unit"]);
        const advertisedOid = await git(publisher, ["rev-parse", "HEAD"]);
        await git(publisher, ["push", "origin", branch]);

        const objectsBefore = await objectInventory(client);
        const passive = await runArc(["status", "--session-init", "--json"], client);
        expect(passive.exitCode, passive.stdout + passive.stderr).toBe(0);
        const passiveEnvelope = parseJson<SessionEnvelope>(passive.stdout);
        expect(passiveEnvelope.materializableWorkUnits, JSON.stringify(passiveEnvelope.materializableWorkUnits)).toMatchObject({
          ok: true,
          value: { remoteEvidence: "pending-fetch", pendingBranchCount: 1, candidates: [] },
        });
        expect(await objectInventory(client)).toEqual(objectsBefore);

        const wrapper = join(wrapperRoot, "git");
        await writeFile(wrapper, [
          "#!/bin/sh",
          `case " $* " in *"fetch --no-filter origin ${branch}"*) exit 75 ;; esac`,
          `exec ${JSON.stringify((await execFileAsync("which", ["git"])).stdout.trim())} "$@"`,
          "",
        ].join("\n"), "utf8");
        await execFileAsync("chmod", ["u+x", wrapper]);
        const denied = await runArc(["active", "in-flight", "--json"], client, {
          env: { PATH: `${wrapperRoot}:${process.env.PATH ?? ""}` },
        });
        expect(denied.exitCode).toBe(1);
        expect(parseJson<InFlightResult>(denied.stdout)).toMatchObject({
          remoteEvidence: "pending-fetch",
          candidateExpansion: { status: "partial", pendingBranchCount: 1 },
        });

        const retried = await runArc(["active", "in-flight", "--json"], client);
        expect(retried.exitCode, retried.stdout + retried.stderr).toBe(0);
        expect(parseJson<InFlightResult>(retried.stdout)).toMatchObject({
          remoteEvidence: "exact",
          candidateExpansion: { status: "complete", pendingBranchCount: 0 },
        });
        await expect(git(client, ["cat-file", "-e", `${advertisedOid}^{commit}`])).resolves.toBe("");

        const exact = await runArc(["status", "--session-init", "--json"], client);
        expect(exact.exitCode, exact.stdout + exact.stderr).toBe(0);
        expect(parseJson<SessionEnvelope>(exact.stdout).materializableWorkUnits).toMatchObject({
          ok: true,
          value: {
            remoteEvidence: "exact",
            pendingBranchCount: 0,
            candidates: [expect.objectContaining({ name: slug, branch })],
          },
        });
      } finally {
        await Promise.all([
          cleanupTempDir(clientRoot),
          cleanupTempDir(wrapperRoot),
          cleanupTempDir(publisher),
          removeGitBackedDir(remote),
        ]);
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "refuses an exact graph relation in a real shallow clone while the full-history control is exact",
    async () => {
      const { publisher, remote } = await initializePublishedProject();
      const cloneRoot = await mkdtemp(join(tmpdir(), "arc-shallow-session-init-"));
      const shallow = join(cloneRoot, "shallow");
      const full = join(cloneRoot, "full");
      try {
        await execFileAsync("git", ["clone", "--depth=1", pathToFileURL(remote).href, shallow]);
        await execFileAsync("git", ["clone", pathToFileURL(remote).href, full]);
        await Promise.all([configureClone(shallow), configureClone(full)]);

        await writeFile(join(publisher, "advance.txt"), "remote advance\n", "utf8");
        await git(publisher, ["add", "advance.txt"]);
        await git(publisher, ["commit", "-m", "advance remote main"]);
        await git(publisher, ["push", "origin", "main"]);
        await git(publisher, ["switch", "-c", "feat/shallow-pending"]);
        await writeWorkUnitMeta(publisher, "shallow-pending", "feat/shallow-pending");
        await git(publisher, ["add", "-A"]);
        await git(publisher, ["commit", "-m", "add shallow pending work unit"]);
        await git(publisher, ["push", "origin", "feat/shallow-pending"]);
        await git(publisher, ["switch", "main"]);
        const mainRefspec = "refs/heads/main:refs/remotes/origin/main";
        await git(shallow, ["fetch", "--depth=1", "--force", "origin", mainRefspec]);
        await git(full, ["fetch", "--force", "origin", mainRefspec]);

        const shallowResult = await runArc(["status", "--session-init", "--json"], shallow);
        const fullResult = await runArc(["status", "--session-init", "--json"], full);
        expect(shallowResult.exitCode, shallowResult.stdout + shallowResult.stderr).toBe(0);
        expect(fullResult.exitCode, fullResult.stdout + fullResult.stderr).toBe(0);
        const shallowEnvelope = parseJson<SessionEnvelope>(shallowResult.stdout);
        const fullEnvelope = parseJson<SessionEnvelope>(fullResult.stdout);
        for (const slot of ["worktree", "baseDistance", "baseBranchSync"] as const) {
          expect(shallowEnvelope[slot]).toMatchObject({ ok: false, error: { kind: "runtime" } });
          expect(fullEnvelope[slot], JSON.stringify(fullEnvelope[slot])).toMatchObject({ ok: true });
        }
        expect(shallowEnvelope.materializableWorkUnits).toMatchObject({
          ok: true,
          value: { candidates: [], pendingBranchCount: 1, remoteEvidence: "pending-fetch" },
        });
      } finally {
        await Promise.all([
          cleanupTempDir(cloneRoot),
          cleanupTempDir(publisher),
          removeGitBackedDir(remote),
        ]);
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "returns a status-slot error without fetching an omitted promisor tree or blob",
    async () => {
      const { publisher, remote } = await initializePublishedProject();
      const clientRoot = await mkdtemp(join(tmpdir(), "arc-treeless-status-reader-"));
      const client = join(clientRoot, "client");
      const linked = join(clientRoot, "linked");
      try {
        await git(remote, ["config", "uploadpack.allowFilter", "true"]);
        await execFileAsync("git", [
          "clone", "--filter=tree:0", pathToFileURL(remote).href, client,
        ]);
        await configureClone(client);
        const huskOid = await git(client, ["rev-parse", "HEAD"]);
        await git(client, ["worktree", "add", "--detach", linked, huskOid]);

        const completedPath = ".arc/completed/2026-q3/shipped-widget/meta-shipped-widget.md";
        await mkdir(join(publisher, ".arc", "completed", "2026-q3", "shipped-widget"), { recursive: true });
        await writeFile(join(publisher, completedPath), "# Metadata: shipped-widget\n", "utf8");
        await git(publisher, ["add", completedPath]);
        await git(publisher, ["commit", "-m", "record shipped widget"]);
        const baseProofOid = await git(publisher, ["rev-parse", "HEAD"]);
        await git(publisher, ["push", "origin", "main"]);
        await git(client, [
          "fetch", "--filter=tree:0", "--force", "origin",
          "refs/heads/main:refs/remotes/origin/main",
        ]);

        const markerDir = join(linked, ".arc", "system", ".internal");
        await mkdir(markerDir, { recursive: true });
        await writeFile(join(markerDir, "worktree-marker.json"), `${JSON.stringify({
          spawnedByArc: true,
          wuName: "shipped-widget",
          createdFor: { kind: "work-unit", name: "shipped-widget" },
          spawningIdentity: "test-user",
          createdAt: "2026-07-14T00:00:00.000Z",
          husk: {
            sha: huskOid,
            at: "2026-07-14T01:00:00.000Z",
            subject: { kind: "work-unit", name: "shipped-widget" },
            branch: "feat/shipped-widget",
            authorization: "merged-preserved",
            remoteRef: null,
            evidence: {
              kind: "shipped",
              expectedLifecycle: "completed",
              resultDigest: `sha256:${"1".repeat(64)}`,
              baseProofOid,
            },
          },
        })}\n`, "utf8");

        const wrapperDir = join(clientRoot, "bin");
        await mkdir(wrapperDir);
        const wrapper = join(wrapperDir, "git");
        const trace = join(wrapperDir, "git.log");
        const realGit = (await execFileAsync("which", ["git"])).stdout.trim();
        await writeFile(wrapper, [
          "#!/bin/sh",
          `printf '%s\\n' "$*" >> ${JSON.stringify(trace)}`,
          "case \" $* \" in",
          "  *refs/notes/arc/user/test-user*|*refs/arc/user/test-user/errands*|*refs/arc/tmp/transient-discovery/*)",
          "    exit 1",
          "    ;;",
          "esac",
          `exec ${JSON.stringify(realGit)} "$@"`,
          "",
        ].join("\n"), "utf8");
        await execFileAsync("chmod", ["u+x", wrapper]);

        const before = await objectInventory(client);
        const result = await runArc(["status", "--session-init", "--json"], linked, {
          env: { PATH: `${wrapperDir}:${process.env.PATH ?? ""}` },
        });
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        const envelope = parseJson<SessionEnvelope>(result.stdout);
        expect(envelope.currentHusk, JSON.stringify(envelope.currentHusk)).toMatchObject({
          ok: false,
          error: { kind: "runtime" },
        });
        expect(await objectInventory(client), await readFile(trace, "utf8")).toEqual(before);

      } finally {
        await Promise.all([
          cleanupTempDir(clientRoot),
          cleanupTempDir(publisher),
          removeGitBackedDir(remote),
        ]);
      }
    },
  );
});
