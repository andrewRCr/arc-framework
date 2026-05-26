/**
 * Unit tests for `pushNotesWithReconcile` — the spinner + staleness-warning
 * wrapper around the lossless reconcile pusher. The reconcile mechanics
 * (non-ff → `git notes merge` → re-push) live in notes-reconcile-push.test.ts;
 * here we cover outcome pass-through, spinner messaging, and the no-op
 * local-note-staleness warning.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type { NotesPushOutcome } from "../../src/commands/user.js";

// --- Mocks ---

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const mockSpinnerInstance = { start: vi.fn(), stop: vi.fn() };

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: mockLog,
  note: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
  isCancel: vi.fn(() => false),
  spinner: () => mockSpinnerInstance,
}));

const mockReconcileNotesPush = vi.fn();
const mockFindNearestUserNote = vi.fn();

vi.mock("../../src/commands/user.js", () => ({
  reconcileNotesPush: (...args: unknown[]) => mockReconcileNotesPush(...args),
  findNearestUserNote: (...args: unknown[]) => mockFindNearestUserNote(...args),
}));

const { pushNotesWithReconcile } = await import("../../src/handlers/push-recovery.js");
const { createSyncOutput } = await import("../../src/lib/sync-output.js");

// --- Tests ---

const io = {} as never;
const identity = "andrew";
const cwd = "/repo";
/**
 * Human-mode SyncOutput stub — its log/spinner methods delegate through the
 * file-scoped `@clack/prompts` mock above, so assertions on `mockLog` and
 * `mockSpinnerInstance` keep firing.
 */
const output = createSyncOutput(false);

describe("pushNotesWithReconcile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFindNearestUserNote.mockResolvedValue({ note: null });
  });

  it.each<[NotesPushOutcome, string]>([
    [{ kind: "pushed" }, "Push complete."],
    [{ kind: "reconciled" }, "Reconciled concurrent notes and pushed."],
    [{ kind: "no-remote" }, "No remote configured."],
    [{ kind: "failed", error: new Error("network timeout") }, "Failed."],
  ])("passes outcome %j through and stops the spinner with its message", async (outcome, message) => {
    mockReconcileNotesPush.mockResolvedValue(outcome);

    const result = await pushNotesWithReconcile({ io, identity, cwd, output });

    expect(result).toEqual(outcome);
    expect(mockSpinnerInstance.stop).toHaveBeenCalledWith(message);
  });

  it("threads worktreeBranch into the reconcile pusher", async () => {
    mockReconcileNotesPush.mockResolvedValue({ kind: "pushed" });

    await pushNotesWithReconcile({ io, identity, cwd, worktreeBranch: "feature/x", output });

    expect(mockReconcileNotesPush).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeBranch: "feature/x" }),
    );
  });

  it("blocked outcome passes through with its conditions", async () => {
    const conditions = [{ kind: "rebase-in-progress", disposition: "block", guidance: "g" }];
    mockReconcileNotesPush.mockResolvedValue({ kind: "blocked", conditions });

    const result = await pushNotesWithReconcile({ io, identity, cwd, output });

    expect(result).toEqual({ kind: "blocked", conditions });
    expect(mockSpinnerInstance.stop).toHaveBeenCalledWith("Push blocked.");
  });

  it("no-op with a local note behind HEAD → warns the note is stale", async () => {
    mockReconcileNotesPush.mockResolvedValue({ kind: "noop" });
    mockFindNearestUserNote.mockResolvedValue({
      note: { reachableFromHead: true, ancestorDistance: 2 },
    });

    const result = await pushNotesWithReconcile({ io, identity, cwd, output });

    expect(result).toEqual({ kind: "noop" });
    expect(mockSpinnerInstance.stop).toHaveBeenCalledWith(
      "Remote user notes already match local user notes.",
    );
    expect(mockLog.warn).toHaveBeenCalledWith(
      "Latest local user note is attached to a commit 2 commit(s) behind HEAD.",
    );
    expect(mockLog.info).toHaveBeenCalledWith(
      "Run `arc user save` or `arc sync` before relying on handoff.",
    );
  });

  it("no-op with a current local note → no staleness warning", async () => {
    mockReconcileNotesPush.mockResolvedValue({ kind: "noop" });
    mockFindNearestUserNote.mockResolvedValue({
      note: { reachableFromHead: true, ancestorDistance: 0 },
    });

    await pushNotesWithReconcile({ io, identity, cwd, output });

    expect(mockLog.warn).not.toHaveBeenCalled();
  });
});
