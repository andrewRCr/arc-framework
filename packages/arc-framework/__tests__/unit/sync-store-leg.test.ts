/**
 * `arc sync` over a store that keeps state off the branch: state is pulled, then published first and alone, beside
 * the branch leg, with no notes, save, or Errand leg.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeInteractionContext } from "../helpers/interaction-context.js";
import { WorktreeFetchFailedError, WorktreeFetchTimeoutError } from "../../src/lib/git/worktree-sync.js";
import type { Store } from "../../src/lib/store/contract.js";
import type { PushResult } from "../../src/lib/store/sync.js";
import type { PromptRenderer } from "../../src/lib/command-input/prompter.js";
import type { SyncOutput } from "../../src/lib/sync-output.js";
import { prompt } from "../../src/lib/command-input/prompter.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";

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

const mockInspection = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/git/worktree-sync.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/git/worktree-sync.js")>(),
  runMaterializingWorktreeInspection: mockInspection,
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
  mockInspection.mockReset().mockResolvedValue({ state: "local-ahead", ahead: 1, behind: 0, branch: "main",
    remoteEvidence: "exact" });
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

  it("reports the diverged branch and its counts in the dry-run JSON", async () => {
    mockInspection.mockResolvedValueOnce({
      state: "diverged", ahead: 1, behind: 2, branch: "main", remoteEvidence: "exact",
    });
    const outcome = await syncJson(store(PULLED), { dryRun: true });
    expect(outcome).toMatchObject({
      mode: "dry-run", cell: "state+blocked-diverged",
      worktree: { action: "skip", result: "skipped", detail: "dry-run" },
      state: { pull: { result: "skipped", detail: "dry-run" }, push: { result: "skipped", detail: "dry-run" } },
    });
    expect(outcome.reconcile).toEqual({ ahead: 1, behind: 2, branch: "main" });
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

  it("reports the next upstream's designation when reading the first still leaves publication blocked", async () => {
    const question = (remote: string) => ({ ...DESIGNATION, remote,
      choices: [...DESIGNATION.choices],
      remedy: { text: `Choose a role for ${remote}.`, argv: ["arc", "store", "remote", remote, "read"] } });
    const roles = new Map<string, string>();
    const execute = async (argv: readonly string[]) => {
      const [remote, role] = argv.slice(3);
      if (remote === undefined || role === undefined) throw new Error("Missing remote or role");
      roles.set(remote, role);
      return { status: "ok" } as const;
    };
    const target = store(PULLED), publishState = target.push;
    target.pull = async () => ({ status: "ok", result: { pulls: [], states: [
      question(roles.get("upstream-a") === "read" ? "upstream-b" : "upstream-a"),
    ] } });
    target.push = async () => roles.get("upstream-b") === "push" ? publishState()
      : { status: "ok", result: { states: [question("upstream-b")], publishes: [],
        pulls: [{ status: "pulled", role: "read", remote: "upstream-a", families: ["project-registry"], notices: [] }] } };
    const select = vi.fn().mockResolvedValueOnce({ kind: "answered", value: "read" })
      .mockResolvedValueOnce({ kind: "answered", value: "push" });
    const renderer: PromptRenderer = { select, confirm: vi.fn(), text: vi.fn(), multiselect: vi.fn() };
    await handleSync({}, recordingOutput(), makeInteractionContext(), target, { execute, renderer });

    expect(roles.get("upstream-a")).toBe("read");
    expect.soft(auditOutcome()).toMatchObject({ state: expect.stringMatching(/push:(blocked|failed)/u), worktree: "push:success", exitCode: 1 });
    expect.soft(process.exitCode).toBe(1);
    expect.soft(events).toContainEqual(expect.stringContaining("arc store remote upstream-b read"));
    expect.soft(events).not.toContain("info: State already current on its remote.");

    process.exitCode = undefined;
    mockAppendAuditEntry.mockClear();
    await handleSync({}, recordingOutput(), makeInteractionContext(), target, { execute, renderer });
    expect(auditOutcome()).toMatchObject({ state: expect.stringContaining("push:success"), exitCode: 0 });
    expect(process.exitCode).toBeUndefined();
  });

  it("reports a local-only store as skipped without failing the branch push", async () => {
    const localOnly = { states: [{ status: "no-remote" }], pulls: [] };
    const outcome = await syncJson(store({ status: "ok", result: localOnly },
      { status: "ok", result: { ...localOnly, publishes: [] } }));

    expect(outcome).toMatchObject({ exitCode: 0, state: { push: { result: "skipped", detail: "no-remote" } },
      worktree: { result: "success" } });
    expect(events).not.toContain("info: State already current on its remote.");
  });

  const candidateFailure = { status: "failed", role: "candidate", remote: "upstream-b", families: ["project-registry"],
    notices: [], failure: { code: "unreachable", class: "recoverable", cause: "auth",
      condition: "Cannot authenticate to upstream-b.", remedy: { text: "Restore credentials and run arc sync." } } } satisfies PushResult["pulls"][number];
  it.each([
    { label: "a failed candidate lookup", states: [], pulls: [candidateFailure], detail: candidateFailure.failure.condition,
      remedy: "Restore credentials and run arc sync." },
    { label: "a moved state remote", states: [{ status: "moved", remote: "origin",
      remedy: { text: "Bring in the tracked pointer change and follow the move.", argv: ["arc", "store", "migrate"] } }], pulls: [],
      detail: "origin", remedy: "arc store migrate" },
  ] satisfies Array<Pick<PushResult, "states" | "pulls"> & { label: string; detail: string; remedy: string }>
  )("reports $label and still pushes the branch", async ({ states, pulls, detail, remedy }) => {
    const target = store(PULLED), push = target.push;
    target.push = async () => ({ status: "ok", result: { states, pulls, publishes: [] } });
    const outcome = await syncJson(target);
    expect(outcome).toMatchObject({ exitCode: 1, worktree: { result: "success" },
      state: { push: { detail: expect.stringContaining(detail) } } });
    expect(events).toContainEqual(expect.stringContaining(remedy));
    target.push = push;
    expect(await syncJson(target)).toMatchObject({ exitCode: 0, state: { push: { result: "success" } } });
  });

  it("preserves the pull and pushes the branch when a state push throws", async () => {
    const target = store(PULLED);
    const push = target.push;
    target.push = () => Promise.reject(new Error("Store directory became read-only."));
    const outcome = await syncJson(target).catch(String);

    expect(outcome).toMatchObject({ exitCode: 1, worktree: { action: "push", result: "success" },
      state: { pull: { result: "success" }, push: { result: "failed", detail: expect.stringContaining("read-only") } } });
    expect(auditOutcome()).toMatchObject({ worktree: "push:success", state: expect.stringContaining("pull:success | push:failed:") });
    target.push = push;
    expect(await syncJson(target)).toMatchObject({ exitCode: 0, state: { push: { result: "success" } } });
  });
});

it.each([
  { reason: "worktree-fetch-timeout", detail: "timeout", error: new WorktreeFetchTimeoutError("main", "main", 3000) },
  { reason: "worktree-fetch-failed", detail: "error",
    error: new WorktreeFetchFailedError("main", "main", makeGitProcessError({
      command: "git", args: ["fetch", "origin", "main"], exitCode: 128, stderr: "Cannot reach origin.",
    })) },
])("audits the skipped notes leg for an in-repo $reason", async ({ reason, detail, error }) => {
  mockInspection.mockRejectedValueOnce(error);
  const target = { ...store(PULLED), capabilities: { stateOffBranch: false } };
  expect(await syncJson(target)).toMatchObject({ reason, exitCode: 1 });
  expect(auditOutcome()).toEqual({ kind: "sync", cell: reason, exitCode: 1, worktree: `fetch:failed:${detail}`,
    notes: `skip:skipped:${reason}` });
});
