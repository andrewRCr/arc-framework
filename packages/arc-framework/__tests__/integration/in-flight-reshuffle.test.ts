import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { runActiveInFlight } from "../../src/commands/active/in-flight.js";
import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import {
  detectForeignArtifactOverlap,
  projectInFlightToOverlapRoster,
} from "../../src/lib/git/foreign-artifact-detection.js";
import { deriveInFlight } from "../../src/lib/git/in-flight-derivation.js";
import { findMaterializableWorkUnits } from "../../src/lib/session-init/materializable-work-units.js";
import { detectStagedForeignWrites } from "../../src/scripts/check-foreign-writes.js";
import {
  gitArgsStartWith,
  setupInFlightReshuffleFixture,
  type InFlightReshuffleFixture,
} from "../helpers/in-flight-reshuffle.js";

const execFileAsync = promisify(execFile);

async function commitPaths(cwd: string, paths: Record<string, string>, message: string): Promise<void> {
  for (const [path, content] of Object.entries(paths)) {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    await writeFile(join(cwd, path), content, "utf-8");
  }
  await execFileAsync("git", ["add", ...Object.keys(paths)], { cwd });
  await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", message], { cwd });
}

async function createSiblingFromFreshBase(
  fixture: InFlightReshuffleFixture,
  basePaths: Record<string, string>,
): Promise<string> {
  await commitPaths(fixture.sibling, basePaths, "advance base with target paths");
  await execFileAsync("git", ["push", "origin", "HEAD:refs/heads/main"], { cwd: fixture.sibling });
  await execFileAsync(
    "git",
    ["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"],
    { cwd: fixture.primary },
  );

  const branch = "feat/foreign-sibling";
  await execFileAsync("git", ["switch", "-c", branch, "origin/main"], { cwd: fixture.sibling });
  const metaPath = `.arc/active/meta-foreign-sibling.md`;
  await commitPaths(
    fixture.sibling,
    {
      [metaPath]: renderMetaFile("foreign-sibling", {
        State: "Active",
        Owner: "andrew",
        Branch: branch,
        Class: "Light",
        Priority: "P3",
      }),
    },
    "activate foreign sibling",
  );
  await execFileAsync("git", ["push", "origin", `HEAD:refs/heads/${branch}`], { cwd: fixture.sibling });
  await execFileAsync(
    "git",
    ["fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`],
    { cwd: fixture.primary },
  );
  return branch;
}

describe("in-flight reshuffle fixture", () => {
  it("runs scripted git reshuffle steps from a selected git call boundary", async () => {
    const fixture = await setupInFlightReshuffleFixture();
    try {
      await fixture.createRemotePlanWorkUnit({ name: "boundary-probe" });

      let spawnedWorktreePath: string | null = null;
      const exec = fixture.withGitCallBoundaryInjections(fixture.primaryExec, [
        {
          timing: "before",
          occurrence: 2,
          match: gitArgsStartWith(["for-each-ref"]),
          run: async () => {
            spawnedWorktreePath = await fixture.steps.spawnWorktree({
              branch: "plan/boundary-probe",
              fromRef: "origin/plan/boundary-probe",
            });
          },
        },
      ]);

      const result = await deriveInFlight({
        exec,
        identity: null,
        teamMode: false,
        localOnly: true,
      });

      expect(spawnedWorktreePath).not.toBeNull();
      expect(result.marks).toEqual(["indeterminate"]);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "input-snapshot-disagreement" }),
        ]),
      );
      await expect(fixture.primaryExec("git", ["rev-parse", "--verify", "plan/boundary-probe"]))
        .resolves.toMatchObject({ stdout: expect.any(String) });
    } finally {
      await fixture.cleanup();
    }
  });

  it("reports a checked-out renamed work unit instead of a stale remote materialize candidate", async () => {
    const fixture = await setupInFlightReshuffleFixture();
    try {
      const topology = await fixture.createStandingStalePlanTopology({ name: "burn-in-probe-a" });

      const result = await runActiveInFlight({
        exec: fixture.primaryExec,
        identity: "andrew",
        teamMode: false,
        localOnly: false,
      });

      const materializable = findMaterializableWorkUnits({ entries: result.entries, identity: "andrew" });
      const workUnits = result.entries.filter((entry) => entry.kind === "work-unit");

      expect(materializable.candidates).toEqual([]);
      expect(workUnits).toHaveLength(1);
      expect(workUnits[0]).toMatchObject({
        name: topology.name,
        branch: topology.liveBranch,
        remoteOnly: false,
        worktreePath: topology.worktreePath,
        state: "Active",
        owner: "andrew",
      });
      expect(workUnits[0]?.provenance).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            branch: topology.staleBranch,
            source: "remote-live",
            selected: false,
          }),
          expect.objectContaining({
            branch: topology.liveBranch,
            source: "worktree",
            selected: true,
          }),
        ]),
      );
      expect(
        result.entries.find(
          (entry) => entry.kind === "work-unit" && entry.branch === topology.staleBranch && entry.remoteOnly,
        ),
      ).toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns clean local worktree facts after reshuffle activity settles", async () => {
    const fixture = await setupInFlightReshuffleFixture();
    try {
      const worktreePath = await fixture.createLocalWorkUnit({
        name: "calm-local",
        branch: "chore/calm-local",
      });

      const result = await deriveInFlight({
        exec: fixture.primaryExec,
        identity: null,
        teamMode: false,
        localOnly: false,
      });
      const workUnits = result.entries.filter((entry) => entry.kind === "work-unit");

      expect(result.marks).toBeUndefined();
      expect(result.warnings).toEqual([]);
      expect(workUnits).toHaveLength(1);
      expect(workUnits[0]).toMatchObject({
        name: "calm-local",
        branch: "chore/calm-local",
        remoteOnly: false,
        worktreePath,
      });
      expect(workUnits[0]).not.toHaveProperty("marks");
    } finally {
      await fixture.cleanup();
    }
  });

  it("marks ref-set churn indeterminate without surfacing the late branch", async () => {
    const fixture = await setupInFlightReshuffleFixture();
    try {
      await fixture.createRemoteWorkUnit({
        name: "stable-remote",
        branch: "feat/stable-remote",
      });
      const exec = fixture.withGitCallBoundaryInjections(fixture.primaryExec, [
        {
          timing: "before",
          occurrence: 2,
          match: gitArgsStartWith(["for-each-ref"]),
          run: () =>
            fixture.createRemoteWorkUnit({
              name: "late-remote",
              branch: "feat/late-remote",
            }),
        },
      ]);

      const result = await deriveInFlight({
        exec,
        identity: null,
        teamMode: false,
        localOnly: false,
      });
      const names = result.entries
        .filter((entry) => entry.kind === "work-unit")
        .map((entry) => entry.name);

      expect(result.marks).toEqual(["indeterminate"]);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "input-snapshot-disagreement" }),
        ]),
      );
      expect(names).toEqual(["stable-remote"]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("marks worktree-set churn indeterminate without surfacing the late worktree", async () => {
    const fixture = await setupInFlightReshuffleFixture();
    try {
      await fixture.createLocalWorkUnit({
        name: "stable-local",
        branch: "chore/stable-local",
      });
      const exec = fixture.withGitCallBoundaryInjections(fixture.primaryExec, [
        {
          timing: "before",
          occurrence: 2,
          match: gitArgsStartWith(["worktree", "list"]),
          run: async () => {
            await fixture.createLocalWorkUnit({
              name: "late-local",
              branch: "chore/late-local",
            });
          },
        },
      ]);

      const result = await deriveInFlight({
        exec,
        identity: null,
        teamMode: false,
        localOnly: false,
      });
      const names = result.entries
        .filter((entry) => entry.kind === "work-unit")
        .map((entry) => entry.name);

      expect(result.marks).toEqual(["indeterminate"]);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "input-snapshot-disagreement" }),
        ]),
      );
      expect(names).toEqual(["stable-local"]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("collapses offline duplicate refs while marking a changed winner indeterminate", async () => {
    const fixture = await setupInFlightReshuffleFixture();
    try {
      await fixture.createRemoteWorkUnit({
        name: "offline-dedupe",
        branch: "chore/offline-dedupe",
      });
      await fixture.createRemoteWorkUnit({
        name: "offline-dedupe",
        branch: "feat/offline-dedupe",
      });
      const exec = fixture.withGitCallBoundaryInjections(fixture.primaryExec, [
        {
          timing: "before",
          occurrence: 2,
          match: gitArgsStartWith(["for-each-ref"]),
          run: () =>
            fixture.steps.advanceRemoteBranch({
              branch: "chore/offline-dedupe",
            }),
        },
      ]);

      const result = await deriveInFlight({
        exec,
        identity: null,
        teamMode: false,
        localOnly: true,
      });
      const workUnits = result.entries.filter((entry) => entry.kind === "work-unit");

      expect(result.marks).toBeUndefined();
      expect(workUnits).toHaveLength(1);
      expect(workUnits[0]).toMatchObject({
        name: "offline-dedupe",
        marks: expect.arrayContaining(["indeterminate", "location-ambiguous"]),
      });
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "input-snapshot-disagreement",
            branch: "chore/offline-dedupe",
          }),
          expect.objectContaining({
            code: "location-ambiguous",
            workUnit: "offline-dedupe",
          }),
        ]),
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not report a foreign overlap from a stale remote twin when originating metadata is unavailable", async () => {
    const fixture = await setupInFlightReshuffleFixture();
    try {
      const topology = await fixture.createStandingStalePlanTopology({ name: "burn-in-probe-a" });
      const inFlight = await runActiveInFlight({
        exec: fixture.primaryExec,
        identity: "andrew",
        teamMode: false,
        localOnly: false,
      });

      const result = await detectForeignArtifactOverlap({
        exec: fixture.primaryExec,
        roster: projectInFlightToOverlapRoster(inFlight.entries),
        targetPaths: [`.arc/active/meta-${topology.name}.md`],
        baseBranch: "main",
        originatingWorktreePath: topology.worktreePath,
        snapshot: inFlight.snapshot,
      });

      expect(result.overlaps).toEqual([]);
      expect(result.indeterminate).toBeUndefined();
      expect(result.skipped).toBeUndefined();
      expect(result.notes).toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not attribute a fresher base change to a sibling while local main is behind", async () => {
    const fixture = await setupInFlightReshuffleFixture();
    try {
      const targetPath = ".arc/backlog/planned/meta-shared-target.md";
      await createSiblingFromFreshBase(fixture, { [targetPath]: "fresh base content\n" });
      const inFlight = await runActiveInFlight({
        exec: fixture.primaryExec,
        identity: "andrew",
        teamMode: false,
        localOnly: true,
        baseBranch: "main",
      });

      const result = await detectStagedForeignWrites({
        exec: fixture.primaryExec,
        roster: projectInFlightToOverlapRoster(inFlight.entries),
        paths: [targetPath],
        baseBranch: "main",
        snapshot: inFlight.snapshot,
        originatingWorktreePath: fixture.primary,
      });

      expect(result.overlaps).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not report an originating work unit artifact as sibling-authored through a fresher base", async () => {
    const fixture = await setupInFlightReshuffleFixture();
    try {
      const originatingBranch = "fix/originating";
      const targetPath = ".arc/active/meta-originating.md";
      const targetContent = renderMetaFile("originating", {
        State: "Active",
        Owner: "andrew",
        Branch: originatingBranch,
        Class: "Light",
        Priority: "P3",
      });
      await execFileAsync("git", ["switch", "-c", originatingBranch], { cwd: fixture.primary });
      await createSiblingFromFreshBase(fixture, { [targetPath]: targetContent });
      await mkdir(dirname(join(fixture.primary, targetPath)), { recursive: true });
      await writeFile(join(fixture.primary, targetPath), targetContent, "utf-8");
      await execFileAsync("git", ["add", targetPath], { cwd: fixture.primary });

      const inFlight = await runActiveInFlight({
        exec: fixture.primaryExec,
        identity: "andrew",
        teamMode: false,
        localOnly: true,
        baseBranch: "main",
      });
      const result = await detectStagedForeignWrites({
        exec: fixture.primaryExec,
        roster: projectInFlightToOverlapRoster(inFlight.entries),
        paths: [targetPath],
        baseBranch: "main",
        snapshot: inFlight.snapshot,
        originatingWorktreePath: fixture.primary,
        originatingMetaPath: targetPath,
      });

      expect(result.overlaps).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("still reports a target path genuinely authored on the sibling branch", async () => {
    const fixture = await setupInFlightReshuffleFixture();
    try {
      const branch = await createSiblingFromFreshBase(fixture, {
        ".arc/backlog/planned/meta-base-only.md": "fresh base content\n",
      });
      const targetPath = ".arc/backlog/planned/meta-genuine-overlap.md";
      await commitPaths(fixture.sibling, { [targetPath]: "sibling-authored content\n" }, "author target on sibling");
      await execFileAsync("git", ["push", "origin", `HEAD:refs/heads/${branch}`], { cwd: fixture.sibling });
      await execFileAsync(
        "git",
        ["fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`],
        { cwd: fixture.primary },
      );
      const inFlight = await runActiveInFlight({
        exec: fixture.primaryExec,
        identity: "andrew",
        teamMode: false,
        localOnly: true,
        baseBranch: "main",
      });

      const result = await detectStagedForeignWrites({
        exec: fixture.primaryExec,
        roster: projectInFlightToOverlapRoster(inFlight.entries),
        paths: [targetPath],
        baseBranch: "main",
        snapshot: inFlight.snapshot,
        originatingWorktreePath: fixture.primary,
      });

      expect(result.overlaps).toEqual([
        {
          branch,
          worktreePath: fixture.sibling,
          matchedPaths: [targetPath],
        },
      ]);
    } finally {
      await fixture.cleanup();
    }
  });
});
