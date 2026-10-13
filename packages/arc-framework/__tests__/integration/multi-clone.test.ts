/**
 * Integration tests exercising the multi-clone test harness.
 *
 * The harness produces a bare origin plus two working clones for cross-machine
 * regression coverage. The first describe pins the harness shape; the second
 * exercises the post-2.R user-notes sync contract end-to-end across clones.
 */

import { makeInteractionContext } from "../helpers/interaction-context.js";
import { describe, it, expect, vi, type Mock } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { setupMultiClone } from "../helpers/multi-clone.js";

const {
  mockLog, mockNote, mockSelect, mockConfirm, mockIsCancel, mockSpinner,
} = vi.hoisted(() => ({
  mockLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockNote: vi.fn(),
  mockSelect: vi.fn(),
  mockConfirm: vi.fn(),
  mockIsCancel: vi.fn(() => false) as Mock<(value: unknown) => boolean>,
  mockSpinner: { start: vi.fn(), stop: vi.fn() },
}));

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: mockLog,
  note: (...args: unknown[]) => mockNote(...args),
  select: (...args: unknown[]) => mockSelect(...args),
  confirm: (...args: unknown[]) => mockConfirm(...args),
  isCancel: (value: unknown) => mockIsCancel(value),
  spinner: () => mockSpinner,
}));
import {
  DEFAULT_PROMPTS,
  loadRecipe,
  makeIOContext,
  makeUserIO,
  makeGitExec,
  makeGitExecInput,
  getArcTemplatePath,
  getInternalTemplatePath,
} from "../helpers/integration.js";
import { runInit } from "../../src/commands/init.js";
import { handleSync } from "../../src/handlers/sync.js";
import { runUserPull, runUserSessionInitStatus } from "../../src/commands/user.js";
import { reconcileErrandPush, type ErrandRecordIO } from "../../src/lib/errand/index.js";
import { errandsRef, readTreeEntries, writeTreeCommit } from "../../src/lib/errand/ref-tree.js";
import { makeCapturingSyncOutput } from "../helpers/sync-output.js";
import {
  TransientIdentityRecordV3Schema,
  type TransientIdentityRecord,
} from "../../src/lib/errand/identity-record.js";
import { transactTransientIdentities } from "../../src/lib/errand/identity-transaction.js";

const execFileAsync = promisify(execFile);

interface SyncEnvelope {
  cell: string;
  worktree: { action: string; result: string; detail?: string };
  notes: { action: string; result: string; detail?: string };
  errand?: { action: string; result: string; detail?: string };
  exitCode: number;
}

describe("setupMultiClone", () => {
  it("produces two clones sharing an origin where clone A's pushes are visible to clone B", async () => {
    const harness = await setupMultiClone();
    try {
      await execFileAsync(
        "git",
        ["-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", "from clone A"],
        { cwd: harness.cloneA },
      );
      const { stdout: aHead } = await execFileAsync(
        "git", ["rev-parse", "HEAD"], { cwd: harness.cloneA },
      );
      await execFileAsync("git", ["push", "origin", "HEAD:main"], { cwd: harness.cloneA });

      await execFileAsync("git", ["fetch", "origin"], { cwd: harness.cloneB });
      const { stdout: bRemoteHead } = await execFileAsync(
        "git", ["rev-parse", "origin/main"], { cwd: harness.cloneB },
      );

      expect(bRemoteHead.trim()).toBe(aHead.trim());
    } finally {
      await harness.cleanup();
    }
  });
});

describe("user-notes cross-clone sync regression", () => {
  it("clone A sync --json verifies HEAD note, advances origin notes ref, and clone B pull reflects current freshness", async () => {
    const harness = await setupMultiClone();
    const originalCwd = process.cwd();
    const identity = "test-user";
    const noteRef = `refs/notes/arc/user/${identity}`;

    try {
      const recipe = await loadRecipe();
      const templateDir = getArcTemplatePath();
      const internalTemplateDir = getInternalTemplatePath();

      for (const dir of [harness.cloneA, harness.cloneB]) {
        await runInit({
          cwd: dir,
          io: makeIOContext(dir),
          templateDir,
          internalTemplateDir,
          recipe,
          prompts: DEFAULT_PROMPTS,
          identityResult: identity,
        });
      }

      const cloneANotesPath = join(
        harness.cloneA, ".arc", "user", identity, "WORKING-MEMORY.md",
      );
      const sessionNotesContent = "# Cross-clone regression test\n";
      await writeFile(cloneANotesPath, sessionNotesContent, "utf-8");

      let envelope: SyncEnvelope;
      const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      process.chdir(harness.cloneA);
      try {
        await handleSync({ json: true, yes: true }, undefined,
          makeInteractionContext({ noInput: true, yes: "authority", machineReadable: true }));
      } finally {
        const written = stdoutWrite.mock.calls.map((call) => String(call[0])).join("");
        stdoutWrite.mockRestore();
        process.chdir(originalCwd);
        envelope = JSON.parse(written) as SyncEnvelope;
      }

      expect(envelope.cell).toBe("notes-only");
      expect(envelope.notes.result).toBe("success");
      expect(envelope.exitCode).toBe(0);

      const { stdout: cloneAHead } = await execFileAsync(
        "git", ["rev-parse", "HEAD"], { cwd: harness.cloneA },
      );
      const { stdout: noteContent } = await execFileAsync(
        "git", ["notes", "--ref", noteRef, "show", cloneAHead.trim()],
        { cwd: harness.cloneA },
      );
      expect(noteContent.length).toBeGreaterThan(0);

      const syncStatePath = join(
        harness.cloneA, ".arc", "user", identity, ".internal", ".sync-state.json",
      );
      const syncState = JSON.parse(await readFile(syncStatePath, "utf-8")) as {
        verifiedAt?: unknown;
        sourceCommit?: unknown;
      };
      expect(syncState.verifiedAt).toBeDefined();
      expect(syncState.sourceCommit).toBe(cloneAHead.trim());

      const { stdout: cloneALocalNoteTip } = await execFileAsync(
        "git", ["rev-parse", noteRef], { cwd: harness.cloneA },
      );
      const { stdout: originNoteTip } = await execFileAsync(
        "git", ["rev-parse", noteRef], { cwd: harness.origin },
      );
      expect(originNoteTip.trim()).toBe(cloneALocalNoteTip.trim());

      const ioB = makeUserIO(harness.cloneB);
      const pullResult = await runUserPull({
        cwd: harness.cloneB, io: ioB, identity,
      });
      expect(pullResult).not.toBeNull();
      expect(pullResult?.kind).toBe("loaded");

      const cloneBNotes = await readFile(
        join(harness.cloneB, ".arc", "user", identity, "WORKING-MEMORY.md"),
        "utf-8",
      );
      expect(cloneBNotes).toBe(sessionNotesContent);

      const cloneBStatus = await runUserSessionInitStatus({
        cwd: harness.cloneB,
        io: ioB,
        identity,
        remoteSyncEnabled: true,
      });
      expect(cloneBStatus.localNoteFreshness?.state).toBe("current-head");
      const { stdout: cloneBHead } = await execFileAsync(
        "git", ["rev-parse", "HEAD"], { cwd: harness.cloneB },
      );
      expect(cloneBStatus.localNoteFreshness?.commit).toBe(cloneBHead.trim());
    } finally {
      await harness.cleanup();
    }
  });
});

describe("user-notes paired-push cross-clone regression", () => {
  it(
    "clone A sync --json executes paired push, advances main and notes ref on origin, "
    + "and clone B fetch + pull observes the new HEAD with current freshness",
    async () => {
      const harness = await setupMultiClone();
      const originalCwd = process.cwd();
      const identity = "test-user";
      const noteRef = `refs/notes/arc/user/${identity}`;

      try {
        const recipe = await loadRecipe();
        const templateDir = getArcTemplatePath();
        const internalTemplateDir = getInternalTemplatePath();

        for (const dir of [harness.cloneA, harness.cloneB]) {
          await runInit({
            cwd: dir,
            io: makeIOContext(dir),
            templateDir,
            internalTemplateDir,
            recipe,
            prompts: DEFAULT_PROMPTS,
            identityResult: identity,
          });
        }

        // Set clone A's push interlock so handleSync dispatches the paired
        // cell. `user.notes_push` is left at its default (on-sync) — relied
        // on here.
        await execFileAsync(
          "git", ["config", "--local", "arc.pushInterlock", "on-sync"],
          { cwd: harness.cloneA },
        );

        const cloneANotesPath = join(
          harness.cloneA, ".arc", "user", identity, "WORKING-MEMORY.md",
        );
        const sessionNotesContent =
          "# Paired-push regression test\n\nClone A handoff payload.\n";
        await writeFile(cloneANotesPath, sessionNotesContent, "utf-8");

        await execFileAsync(
          "git",
          [
            "-c", "core.hooksPath=/dev/null",
            "commit", "--allow-empty", "-m", "advance clone A main",
          ],
          { cwd: harness.cloneA },
        );

        let envelope: SyncEnvelope;
        const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
        process.chdir(harness.cloneA);
        try {
          await handleSync({ json: true }, undefined,
            makeInteractionContext({ noInput: true, machineReadable: true }));
        } finally {
          const written = stdoutWrite.mock.calls
            .map((call) => String(call[0]))
            .join("");
          stdoutWrite.mockRestore();
          process.chdir(originalCwd);
          envelope = JSON.parse(written) as SyncEnvelope;
        }

        expect(envelope.cell).toBe("paired-push");
        expect(envelope.worktree.action).toBe("push");
        expect(envelope.worktree.result).toBe("success");
        expect(envelope.notes.action).toBe("save+push");
        expect(envelope.notes.result).toBe("success");
        expect(envelope.exitCode).toBe(0);

        const { stdout: cloneAHead } = await execFileAsync(
          "git", ["rev-parse", "HEAD"], { cwd: harness.cloneA },
        );
        const { stdout: originMainTip } = await execFileAsync(
          "git", ["rev-parse", "main"], { cwd: harness.origin },
        );
        expect(originMainTip.trim()).toBe(cloneAHead.trim());

        const { stdout: cloneANoteTip } = await execFileAsync(
          "git", ["rev-parse", noteRef], { cwd: harness.cloneA },
        );
        const { stdout: originNoteTip } = await execFileAsync(
          "git", ["rev-parse", noteRef], { cwd: harness.origin },
        );
        expect(originNoteTip.trim()).toBe(cloneANoteTip.trim());

        await execFileAsync("git", ["fetch", "origin"], { cwd: harness.cloneB });
        await execFileAsync(
          "git", ["merge", "--ff-only", "origin/main"], { cwd: harness.cloneB },
        );
        const { stdout: cloneBHead } = await execFileAsync(
          "git", ["rev-parse", "HEAD"], { cwd: harness.cloneB },
        );
        expect(cloneBHead.trim()).toBe(cloneAHead.trim());

        const ioB = makeUserIO(harness.cloneB);
        const pullResult = await runUserPull({
          cwd: harness.cloneB, io: ioB, identity,
        });
        expect(pullResult).not.toBeNull();
        expect(pullResult?.kind).toBe("loaded");

        const cloneBNotes = await readFile(
          join(harness.cloneB, ".arc", "user", identity, "WORKING-MEMORY.md"),
          "utf-8",
        );
        expect(cloneBNotes).toBe(sessionNotesContent);

        const cloneBStatus = await runUserSessionInitStatus({
          cwd: harness.cloneB,
          io: ioB,
          identity,
          remoteSyncEnabled: true,
        });
        expect(cloneBStatus.localNoteFreshness?.state).toBe("current-head");
        expect(cloneBStatus.localNoteFreshness?.commit).toBe(cloneBHead.trim());
      } finally {
        await harness.cleanup();
      }
    },
    15_000,
  );
});

describe("errand-ref cross-clone sync regression", () => {
  function errandRecord(slug: string): TransientIdentityRecord {
    return TransientIdentityRecordV3Schema.parse({
      version: 3,
      kind: "errand",
      slug,
      claimId: "a".repeat(32),
      purpose: "errand",
      origin: "description",
      originEntry: null,
      intent: `do ${slug}`,
      branch: `chore/${slug}`,
      state: "open",
      savedHead: null,
      changeRequest: null,
      createdAt: "2026-06-19T12:00:00.000Z",
      updatedAt: "2026-06-19T12:00:00.000Z",
    });
  }

  function errandIo(dir: string, identity: string): ErrandRecordIO {
    return { exec: makeGitExec(dir), execInput: makeGitExecInput(dir), identity };
  }

  async function writeIdentity(io: ErrandRecordIO, record: TransientIdentityRecord): Promise<void> {
    const outcome = await transactTransientIdentities(io, {
      remote: null,
      message: `write ${record.slug}`,
      transform: (basis) => ({
        kind: "applied",
        records: new Map([...basis, [record.slug, record]]),
        value: null,
      }),
    });
    if (outcome.kind !== "applied" && outcome.kind !== "idempotent") {
      throw new Error(`identity write failed: ${outcome.kind}`);
    }
  }

  it("arc sync reconciles the errand ref: fetches the remote, tree-merges, and pushes", async () => {
    const harness = await setupMultiClone();
    const originalCwd = process.cwd();
    const identity = "test-user";
    const ref = errandsRef(identity);

    try {
      const recipe = await loadRecipe();
      const templateDir = getArcTemplatePath();
      const internalTemplateDir = getInternalTemplatePath();
      for (const dir of [harness.cloneA, harness.cloneB]) {
        await runInit({
          cwd: dir,
          io: makeIOContext(dir),
          templateDir,
          internalTemplateDir,
          recipe,
          prompts: DEFAULT_PROMPTS,
          identityResult: identity,
        });
      }

      // Clone B creates an errand and pushes it — origin's errand ref now holds `from-b`.
      const ioB = errandIo(harness.cloneB, identity);
      await writeIdentity(ioB, errandRecord("from-b"));
      expect((await reconcileErrandPush(ioB)).kind).toBe("pushed");

      // Clone A creates a divergent errand. `arc sync` must fetch B's ref, union
      // the trees, and push — clone A never had `from-b`, so its push is a real
      // non-fast-forward the cross-cutting errand leg reconciles.
      const ioA = errandIo(harness.cloneA, identity);
      await writeIdentity(ioA, errandRecord("from-a"));

      let envelope: SyncEnvelope;
      const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      process.chdir(harness.cloneA);
      try {
        await handleSync({ json: true, yes: true }, undefined,
          makeInteractionContext({ noInput: true, yes: "authority", machineReadable: true }));
      } finally {
        const written = stdoutWrite.mock.calls.map((call) => String(call[0])).join("");
        stdoutWrite.mockRestore();
        process.chdir(originalCwd);
        envelope = JSON.parse(written) as SyncEnvelope;
      }

      expect(envelope.errand).toEqual({ action: "reconcile", result: "success" });

      // Origin's errand ref holds both slugs — the union landed remotely.
      const { stdout: originTree } = await execFileAsync(
        "git", ["ls-tree", "--name-only", ref], { cwd: harness.origin },
      );
      expect(originTree.split("\n").map((s) => s.trim()).filter(Boolean).sort()).toEqual([
        "from-a",
        "from-b",
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("arc sync keeps a remote-only record update and an independent local record", async () => {
    const harness = await setupMultiClone();
    const originalCwd = process.cwd();
    const identity = "test-user";
    const ref = errandsRef(identity);

    try {
      const recipe = await loadRecipe();
      for (const dir of [harness.cloneA, harness.cloneB]) {
        await runInit({
          cwd: dir,
          io: makeIOContext(dir),
          templateDir: getArcTemplatePath(),
          internalTemplateDir: getInternalTemplatePath(),
          recipe,
          prompts: DEFAULT_PROMPTS,
          identityResult: identity,
        });
      }
      const ioA = errandIo(harness.cloneA, identity);
      const ioB = errandIo(harness.cloneB, identity);
      await writeIdentity(ioA, errandRecord("shared"));
      expect(await reconcileErrandPush(ioA)).toEqual({ kind: "pushed" });
      await execFileAsync("git", ["fetch", "origin", `${ref}:${ref}`], { cwd: harness.cloneB });

      const localRecord = TransientIdentityRecordV3Schema.parse({
        ...errandRecord("local-only"),
        claimId: "b".repeat(32),
      });
      await writeIdentity(ioA, localRecord);
      const remoteRecord = TransientIdentityRecordV3Schema.parse({
        ...errandRecord("shared"),
        intent: "updated on the other machine",
        updatedAt: "2026-06-19T13:00:00.000Z",
      });
      await writeIdentity(ioB, remoteRecord);
      expect(await reconcileErrandPush(ioB)).toEqual({ kind: "pushed" });

      let envelope: SyncEnvelope;
      const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      process.chdir(harness.cloneA);
      try {
        await handleSync({ json: true, yes: true }, undefined,
          makeInteractionContext({ noInput: true, yes: "authority", machineReadable: true }));
      } finally {
        const written = stdoutWrite.mock.calls.map((call) => String(call[0])).join("");
        stdoutWrite.mockRestore();
        process.chdir(originalCwd);
        envelope = JSON.parse(written) as SyncEnvelope;
      }

      expect(envelope.errand).toEqual({ action: "reconcile", result: "success" });
      for (const dir of [harness.cloneA, harness.origin]) {
        const { stdout: tree } = await execFileAsync("git", ["ls-tree", "--name-only", ref], { cwd: dir });
        expect(tree.trim().split("\n").sort()).toEqual(["local-only", "shared"]);
        for (const record of [remoteRecord, localRecord]) {
          const { stdout } = await execFileAsync("git", ["show", `${ref}:${record.slug}`], { cwd: dir });
          expect(JSON.parse(stdout)).toEqual(record);
        }
      }
    } finally {
      await harness.cleanup();
    }
  }, 30_000);

  it.each([
    { json: true, mode: "JSON" },
    { json: false, mode: "human" },
  ])("surfaces ambiguous-history guidance in $mode sync and recovers after repair", async ({ json }) => {
    const harness = await setupMultiClone();
    const originalCwd = process.cwd();
    const originalExitCode = process.exitCode;
    const identity = "test-user";
    const ref = errandsRef(identity);
    try {
      await runInit({
        cwd: harness.cloneA,
        io: makeIOContext(harness.cloneA),
        templateDir: getArcTemplatePath(),
        internalTemplateDir: getInternalTemplatePath(),
        recipe: await loadRecipe(),
        prompts: DEFAULT_PROMPTS,
        identityResult: identity,
      });
      const ioA = errandIo(harness.cloneA, identity);
      const ioB = errandIo(harness.cloneB, identity);
      const alpha = errandRecord("alpha");
      await writeIdentity(ioA, alpha);
      expect(await reconcileErrandPush(ioA)).toEqual({ kind: "pushed" });
      await writeIdentity(ioB, TransientIdentityRecordV3Schema.parse({
        ...errandRecord("beta"), claimId: "b".repeat(32),
      }));
      const aRoot = (await ioA.exec("git", ["rev-parse", ref])).stdout.trim();
      const bRoot = (await ioB.exec("git", ["rev-parse", ref])).stdout.trim();
      await ioA.exec("git", ["fetch", harness.cloneB, `${ref}:refs/test/b-root`]);
      await ioB.exec("git", ["fetch", "origin", `${ref}:refs/test/a-root`]);
      const union = new Map([
        ...await readTreeEntries(ioA.exec, aRoot), ...await readTreeEntries(ioA.exec, bRoot),
      ]);
      await writeTreeCommit(ioA, union, "merge alpha and beta", [aRoot, bRoot], aRoot);
      await writeTreeCommit(ioB, union, "independently merge beta and alpha", [bRoot, aRoot], bRoot);
      expect((await transactTransientIdentities(ioA, {
        remote: null,
        message: "delete beta",
        transform: (basis) => ({
          kind: "applied", records: new Map([...basis].filter(([slug]) => slug !== "beta")), value: null,
        }),
      })).kind).toBe("applied");
      const updatedAlpha = TransientIdentityRecordV3Schema.parse({ ...alpha, intent: "updated remotely" });
      await writeIdentity(ioB, updatedAlpha);
      expect(await reconcileErrandPush(ioB)).toEqual({ kind: "pushed" });
      const localTip = (await ioA.exec("git", ["rev-parse", ref])).stdout.trim();
      const remoteTip = (await ioB.exec("git", ["rev-parse", ref])).stdout.trim();
      process.chdir(harness.cloneA);
      process.exitCode = undefined;
      async function runSync(): Promise<{ text: string; warnings: string[] }> {
        const capture = makeCapturingSyncOutput();
        const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
        try {
          await handleSync({ json, yes: true }, { ...capture.output, jsonMode: json },
            makeInteractionContext({ noInput: true, yes: "authority", machineReadable: json }));
          return { text: stdoutWrite.mock.calls.map((call) => String(call[0])).join(""), warnings: capture.stderr };
        } finally {
          stdoutWrite.mockRestore();
        }
      }
      const failed = await runSync();
      const diagnostic = json ? (JSON.parse(failed.text) as SyncEnvelope).errand?.detail : failed.warnings.join("\n");
      expect(diagnostic).toContain("multiple best common ancestors");
      expect(diagnostic).toContain("before retrying arc sync");
      if (json) expect((JSON.parse(failed.text) as SyncEnvelope).errand?.result).toBe("failed");
      else expect(failed.text).toBe("");
      expect(process.exitCode).toBeUndefined();
      expect((await ioA.exec("git", ["rev-parse", ref])).stdout.trim()).toBe(localTip);
      expect((await execFileAsync("git", ["rev-parse", ref], { cwd: harness.origin })).stdout.trim()).toBe(remoteTip);
      const markerPath = join(harness.cloneA, ".arc", "user", identity, ".internal", ".sync-state.json");
      expect((JSON.parse(await readFile(markerPath, "utf8")) as { partialPushErrand?: unknown }).partialPushErrand)
        .toBeDefined();

      await ioB.exec("git", ["fetch", harness.cloneA, `${ref}:refs/test/local-tip`]);
      const repaired = await readTreeEntries(ioB.exec, remoteTip);
      repaired.delete("beta");
      await writeTreeCommit(ioB, repaired, "reconcile intended changes", [remoteTip, localTip], remoteTip);
      expect(await reconcileErrandPush(ioB)).toEqual({ kind: "pushed" });
      const recovered = await runSync();
      if (json) expect((JSON.parse(recovered.text) as SyncEnvelope).errand?.result).toBe("success");
      expect(recovered.warnings.join("\n")).not.toContain("Errand sync failed");
      expect(process.exitCode).toBeUndefined();
      expect((JSON.parse(await readFile(markerPath, "utf8")) as { partialPushErrand?: unknown }).partialPushErrand)
        .toBeUndefined();
      expect(JSON.parse((await ioA.exec("git", ["show", `${ref}:alpha`])).stdout)).toEqual(updatedAlpha);
      expect((await ioA.exec("git", ["ls-tree", "--name-only", ref])).stdout.trim()).toBe("alpha");
      expect((await execFileAsync("git", ["rev-parse", ref], { cwd: harness.origin })).stdout.trim())
        .toBe((await ioA.exec("git", ["rev-parse", ref])).stdout.trim());
    } finally {
      process.chdir(originalCwd);
      process.exitCode = originalExitCode;
      await harness.cleanup();
    }
  }, 30_000);

  it("degrades gracefully and records the errand marker when the remote is unavailable", async () => {
    const harness = await setupMultiClone();
    const originalCwd = process.cwd();
    const identity = "test-user";

    try {
      await runInit({
        cwd: harness.cloneA,
        io: makeIOContext(harness.cloneA),
        templateDir: getArcTemplatePath(),
        internalTemplateDir: getInternalTemplatePath(),
        recipe: await loadRecipe(),
        prompts: DEFAULT_PROMPTS,
        identityResult: identity,
      });

      // Drop the remote so the errand push has nowhere to land, and seed a local errand ref.
      await execFileAsync("git", ["remote", "remove", "origin"], { cwd: harness.cloneA });
      await writeIdentity(errandIo(harness.cloneA, identity), errandRecord("orphaned"));

      let envelope: SyncEnvelope;
      const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      process.chdir(harness.cloneA);
      try {
        await handleSync({ json: true, yes: true }, undefined,
          makeInteractionContext({ noInput: true, yes: "authority", machineReadable: true }));
      } finally {
        const written = stdoutWrite.mock.calls.map((call) => String(call[0])).join("");
        stdoutWrite.mockRestore();
        process.chdir(originalCwd);
        envelope = JSON.parse(written) as SyncEnvelope;
      }

      // The reconcile surfaces failure without throwing, and leaves a recovery marker.
      expect(envelope.errand?.result).toBe("failed");
      const syncState = JSON.parse(
        await readFile(
          join(harness.cloneA, ".arc", "user", identity, ".internal", ".sync-state.json"),
          "utf-8",
        ),
      ) as { partialPushErrand?: unknown };
      expect(syncState.partialPushErrand).toBeDefined();
    } finally {
      await harness.cleanup();
    }
  });
});
