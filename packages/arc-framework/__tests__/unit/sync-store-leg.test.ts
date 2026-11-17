/**
 * `arc sync` over a store that keeps state off the branch: state is pulled, then published first and alone, beside
 * the branch leg, with no notes, save, or Errand leg.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeInteractionContext } from "../helpers/interaction-context.js";
import type { Store } from "../../src/lib/store/contract.js";
import type { PromptRenderer } from "../../src/lib/command-input/prompter.js";
import type { SyncOutput } from "../../src/lib/sync-output.js";
import { prompt } from "../../src/lib/command-input/prompter.js";

const events: string[] = [];
let rebasing = false;

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  access: (path: string) => rebasing && path === "/repo/.git/rebase-merge" ? Promise.resolve() : Promise.reject(new Error("path absent")),
}));

const mockRunUserSave = vi.fn();
const mockRunPairedPush = vi.fn();
vi.mock("../../src/commands/user.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/commands/user.js")>(),
  runUserSave: (input: unknown) => mockRunUserSave(input),
  runPairedPush: (input: unknown) => mockRunPairedPush(input),
}));

const mockPushNotes = vi.fn();
vi.mock("../../src/handlers/push-recovery.js", () => ({ pushNotesWithReconcile: (input: unknown) => mockPushNotes(input) }));

const mockReconcileErrandPush = vi.fn();
vi.mock("../../src/lib/errand/index.js", () => ({ reconcileErrandPush: (...args: unknown[]) => mockReconcileErrandPush(...args) }));

vi.mock("../../src/lib/store/store-imported.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/store/store-imported.js")>(),
  storeImported: () => Promise.resolve(false),
}));

vi.mock("../../src/lib/store/projection/sync-materialization.js", () => ({
  restoreSyncProjection: () => { events.push("restore"); return Promise.resolve(); },
}));

vi.mock("../../src/handlers/shared.js", () => ({
  resolveUserIdentity: () => Promise.resolve("andrew"),
  ARC_PROJECT_ROOT_ERROR: "Not inside an ARC project.",
}));

vi.mock("../../src/lib/paths.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/paths.js")>(),
  resolveArcRoot: () => "/repo",
}));

vi.mock("../../src/lib/config/resolved-settings.js", () => ({
  resolveAllSettings: () => Promise.resolve({
    settings: { "user.notes_push": "on-sync", "session.remote_sync": "enabled", "sync.auto_pull": "false" },
    resolved: {
      commitInterlock: { value: "manual", source: "default" },
      pushInterlock: { value: "on-sync", source: "yaml" },
      syncInterlock: { value: "on-handoff", source: "default" },
      notesPush: { value: "on-sync", source: "default" },
    },
    defaultsApplied: [],
    warnings: [],
  }),
}));

vi.mock("../../src/lib/git/worktree-sync.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/git/worktree-sync.js")>(),
  runMaterializingWorktreeInspection: () => Promise.resolve({ state: "local-ahead", ahead: 1, behind: 0, branch: "main",
    remoteEvidence: "exact" }),
}));

let branchPushFails = false;
const gitExec = vi.fn(async (_command: string, args: readonly string[]) => {
  if (args[0] === "push") {
    events.push("branch-push");
    if (branchPushFails) throw new Error("remote rejected the branch");
  }
  if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "main", stderr: "" };
  if (args[0] === "rev-parse" && args[1] === "--git-path") return { stdout: `/repo/.git/${args[2] ?? ""}`, stderr: "" };
  return { stdout: "", stderr: "" };
});
vi.mock("../../src/lib/io-context.js", () => ({
  createGitExec: () => gitExec,
  createUserIOContext: () => ({ exec: gitExec, readFile: vi.fn() }),
}));

const mockAppendAuditEntry = vi.fn();
vi.mock("../../src/lib/release/audit-log.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/release/audit-log.js")>(),
  appendAuditEntry: (input: unknown) => mockAppendAuditEntry(input),
}));
vi.mock("../../src/lib/release/wu-resolution.js", () => ({
  resolveActiveWu: () => Promise.resolve({ status: "resolved", path: ".arc/active/meta-test.md", name: "test" }),
}));
vi.mock("../../src/lib/checks/push-gate-record.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/checks/push-gate-record.js")>(),
  readCheckoutPushGateRefusal: () => Promise.resolve(null),
}));

const { handleSync } = await import("../../src/handlers/sync.js");

const DESIGNATION = { status: "designation-needed", remote: "origin", choices: ["push", "read", "off"],
  remedy: { text: "Designate how origin serves store state.", argv: ["arc", "store", "remote", "origin", "push"] } } as const;
const PULLED = { status: "ok", result: { states: [], pulls: [{ status: "pulled", role: "state", remote: "origin",
  families: ["personal"], notices: [] }] } } as const;

function published(retryCount = 0, waitedMs = 5) {
  return { status: "ok", result: { states: [], pulls: [], publishes: [{ status: "pushed", families: ["personal"], retryCount, waitedMs }] } };
}

/** An off-branch store whose pull and push answer as scripted, recording each call in order. */
function store(pull: unknown, push: unknown = published()): Store {
  const refuse = () => { throw new Error("The state leg reads only pull and push."); };
  return { capabilities: { stateOffBranch: true }, read: refuse, list: refuse, write: refuse, batch: refuse, version: refuse,
    history: refuse, changes: refuse, lookup: refuse, maintain: refuse,
    pull: () => { events.push("pull"); return Promise.resolve(pull); },
    push: () => { events.push("push"); return Promise.resolve(push); } } as unknown as Store;
}

/** An output recording every line in order beside the store and Git events. */
function recordingOutput(): SyncOutput {
  const line = (level: string) => (message: string) => { events.push(`${level}: ${message}`); };
  return { jsonMode: true, intro: () => undefined, outro: () => undefined, note: () => undefined, confirm: prompt,
    log: { info: line("info"), warn: line("warn"), error: line("error") },
    spinner: () => ({ start: () => undefined, stop: () => undefined }) };
}

/** Run a JSON sync and return its outcome. */
async function syncJson(target: Store, opts: { dryRun?: boolean } = {}): Promise<Record<string, unknown>> {
  const written: string[] = [];
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { written.push(String(chunk)); return true; });
  try {
    await handleSync({ json: true, ...opts }, recordingOutput(), makeInteractionContext({ machineReadable: true }), target);
  } finally { stdout.mockRestore(); }
  return JSON.parse(written.join("")) as Record<string, unknown>;
}

function auditOutcome(): Record<string, unknown> {
  const [call] = mockAppendAuditEntry.mock.calls as [[{ entry: { outcome: Record<string, unknown> } }]];
  return call[0].entry.outcome;
}

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  branchPushFails = false;
  rebasing = false;
  mockAppendAuditEntry.mockResolvedValue({ ok: true });
  process.exitCode = undefined;
});

describe("arc sync over an off-branch store", () => {
  it("pulls state, then pushes it, and reports it before the branch leg", async () => {
    const outcome = await syncJson(store(PULLED));
    const order = events.filter((event) => ["restore", "pull", "push", "branch-push"].includes(event) || event === "info: State pushed.");
    expect(order).toEqual(["restore", "pull", "push", "info: State pushed.", "branch-push"]);
    expect(outcome).toMatchObject({ cell: "state+worktree", exitCode: 0, worktree: { action: "push", result: "success" },
      state: { pull: { action: "pull", result: "success" }, push: { action: "push", result: "success" } } });
    expect(process.exitCode).toBeUndefined();
  });

  it("leaves the state push reported as succeeded when the branch push fails", async () => {
    branchPushFails = true;
    const outcome = await syncJson(store(PULLED));
    expect(outcome).toMatchObject({ exitCode: 1, worktree: { action: "push", result: "failed" },
      state: { push: { action: "push", result: "success" } } });
    expect(auditOutcome()).toMatchObject({ state: "pull:success | push:success", worktree: expect.stringMatching(/^push:failed/u) });
    expect(process.exitCode).toBe(1);
  });

  it("runs and reports neither a notes leg nor an Errand leg", async () => {
    const outcome = await syncJson(store(PULLED));
    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockRunPairedPush).not.toHaveBeenCalled();
    expect(mockPushNotes).not.toHaveBeenCalled();
    expect(mockReconcileErrandPush).not.toHaveBeenCalled();
    expect(outcome).not.toHaveProperty("notes");
    expect(outcome).not.toHaveProperty("save");
    expect(outcome).not.toHaveProperty("errand");
    expect(auditOutcome()).not.toHaveProperty("notes");
  });

  it("reports a push's figures over their bounds through the tripwire report", async () => {
    const outcome = await syncJson(store(PULLED, published(3, 12_000)));
    expect(outcome).toMatchObject({ tripwires: { growth: [], contention: { retryCount: 3, waitedMs: 12_000 } } });
    expect(events).toContainEqual(expect.stringMatching(/^warn: Push contention exceeds its bound/u));
  });

  it("pushes no state after a stopping pull, still pushes the branch, and exits nonzero", async () => {
    const stopped = { status: "refused", refusal: { code: "unreachable", class: "recoverable", condition: "origin is unreachable.",
      remedy: { text: "Check the network, then run arc sync again." } } };
    const outcome = await syncJson(store(stopped));
    expect(events).not.toContain("push");
    expect(events).toContain("branch-push");
    expect(outcome).toMatchObject({ exitCode: 1, state: { pull: { result: "failed" }, push: { result: "blocked", detail: "pull-stopped" } },
      worktree: { result: "success" } });
    expect(process.exitCode).toBe(1);
  });

  it("reports the designation's remedy on an undesignated clone that may not prompt, pushing no state", async () => {
    const outcome = await syncJson(store({ status: "ok", result: { states: [DESIGNATION], pulls: [] } }));
    expect(events).not.toContain("push");
    expect(events).toContain("branch-push");
    const remedies = events.filter((event) => event.includes("arc store remote origin push"));
    expect(remedies).toEqual([expect.stringMatching(/^error: Remote origin needs a store designation; no state was published\./u)]);
    expect(outcome).toMatchObject({ exitCode: 1, state: { push: { result: "blocked", detail: "designation-needed" } } });
    expect(process.exitCode).toBe(1);
  });

  it("publishes state during a rebase but holds the branch push, and exits nonzero", async () => {
    rebasing = true;
    const outcome = await syncJson(store(PULLED));
    expect(events).toContain("push");
    expect(events).not.toContain("branch-push");
    expect(outcome).toMatchObject({ exitCode: 1, state: { push: { result: "success" } },
      worktree: { action: "push", result: "blocked", detail: "rebase-in-progress" } });
    expect(process.exitCode).toBe(1);
  });

  it("reports both legs as planned on a dry run, pulling and pushing nothing", async () => {
    const outcome = await syncJson(store(PULLED), { dryRun: true });
    expect(events.filter((event) => ["pull", "push", "branch-push"].includes(event))).toEqual([]);
    expect(outcome).toMatchObject({ mode: "dry-run", cell: "state+worktree", exitCode: 0,
      worktree: { action: "push", result: "skipped", detail: "dry-run" },
      state: { pull: { result: "skipped", detail: "dry-run" }, push: { result: "skipped", detail: "dry-run" } } });
    expect(mockAppendAuditEntry).not.toHaveBeenCalled();
  });

  it("designates an undesignated clone that answers the prompt, then pushes its state", async () => {
    const execute = vi.fn(() => Promise.resolve({ status: "ok" } as const));
    const renderer = { select: () => Promise.resolve({ kind: "answered", value: "push" }) } as unknown as PromptRenderer;
    await handleSync({}, recordingOutput(), makeInteractionContext({ promptInputIsTTY: true, promptOutputIsTTY: true }),
      store({ status: "ok", result: { states: [DESIGNATION], pulls: [] } }), { execute, renderer });
    expect(execute).toHaveBeenCalledWith(["arc", "store", "remote", "origin", "push"], "/repo", expect.anything());
    expect(events.filter((event) => ["pull", "push", "branch-push"].includes(event))).toEqual(["pull", "push", "branch-push"]);
    expect(auditOutcome()).toMatchObject({ state: "pull:blocked:designation-needed | push:success", exitCode: 0 });
    expect(process.exitCode).toBeUndefined();
  });
});
