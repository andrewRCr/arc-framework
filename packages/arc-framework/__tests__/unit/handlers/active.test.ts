import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runExpansion: vi.fn(),
  exec: vi.fn(),
  execInput: vi.fn(),
  note: vi.fn(),
}));

vi.mock("../../../src/commands/active.js", () => ({
  runActiveInFlightExpansion: (...args: unknown[]) => mocks.runExpansion(...args),
}));
vi.mock("../../../src/lib/io-context.js", () => ({
  createGitExec: () => mocks.exec,
  gitExecInput: mocks.execInput,
}));
vi.mock("../../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: async () => ({ settings: { "branch.base": "main", "team.mode": "false" } }),
}));
vi.mock("../../../src/lib/work-unit/lifecycle-index.js", () => ({
  buildLifecycleIndex: async () => new Map(),
}));
vi.mock("../../../src/lib/work-unit/lifecycle-resolver.js", () => ({
  listParkedSlugs: () => new Set(),
}));
vi.mock("../../../src/handlers/shared.js", () => ({
  requireArcProjectRoot: () => "/repo",
  resolveIdentityWithPrompt: async () => "andrew",
}));
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: mocks.note,
  log: { warn: vi.fn() },
}));

import { formatActiveInFlightLine, handleActiveInFlight } from "../../../src/handlers/active.js";
import type { InFlightWorkUnit } from "../../../src/lib/git/in-flight-derivation.js";

function workUnit(overrides: Partial<InFlightWorkUnit> = {}): InFlightWorkUnit {
  return {
    kind: "work-unit",
    branch: "feat/local-unoccupied",
    name: "local-unoccupied",
    state: "Active",
    remoteOnly: false,
    dependsOn: [],
    ...overrides,
  };
}

describe("formatActiveInFlightLine", () => {
  it("renders an unoccupied local branch as having no worktree", () => {
    expect(formatActiveInFlightLine(workUnit())).toBe(
      "feat/local-unoccupied  (Active)  no worktree",
    );
  });

  it("retains the remote-only and checked-out location labels", () => {
    expect(formatActiveInFlightLine(workUnit({ remoteOnly: true }))).toContain("remote-only");
    expect(
      formatActiveInFlightLine(workUnit({ worktreePath: "/repo.local", remoteOnly: false })),
    ).toContain("/repo.local");
  });
});

describe("handleActiveInFlight", () => {
  it("selects explicit expansion for a live command request", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mocks.runExpansion.mockResolvedValue({
      entries: [],
      warnings: [],
      snapshot: { refs: {}, worktrees: {} },
      reachable: true,
      remoteEvidence: "exact",
      candidateExpansion: { status: "complete", pendingBranchCount: 0 },
    });

    await handleActiveInFlight({ json: true });

    expect(mocks.runExpansion).toHaveBeenCalledWith(expect.objectContaining({
      exec: mocks.exec,
      execInput: mocks.execInput,
      localOnly: false,
      identity: "andrew",
      teamMode: false,
    }));
    expect(stdout).toHaveBeenCalled();
    stdout.mockRestore();
  });

  it("writes a partial JSON result before returning a failing exit status", async () => {
    process.exitCode = undefined;
    const exitCodesAtWrite: Array<number | string | null | undefined> = [];
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => {
      exitCodesAtWrite.push(process.exitCode);
      return true;
    });
    mocks.runExpansion.mockResolvedValue({
      entries: [],
      warnings: [],
      snapshot: { refs: {}, worktrees: {} },
      reachable: true,
      remoteEvidence: "pending-fetch",
      candidateExpansion: { status: "partial", pendingBranchCount: 1 },
    });

    try {
      await handleActiveInFlight({ json: true });

      expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"status":"partial"'));
      expect(exitCodesAtWrite).toEqual([undefined]);
      expect(process.exitCode).toBe(1);
    } finally {
      stdout.mockRestore();
      process.exitCode = undefined;
    }
  });

  it("writes a failed JSON result before returning a failing exit status", async () => {
    process.exitCode = undefined;
    const exitCodesAtWrite: Array<number | string | null | undefined> = [];
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => {
      exitCodesAtWrite.push(process.exitCode);
      return true;
    });
    mocks.runExpansion.mockResolvedValue({
      entries: [],
      warnings: [],
      snapshot: { refs: {}, worktrees: {} },
      reachable: false,
      remoteEvidence: "unreachable",
      failureReason: "network",
      candidateExpansion: { status: "failed", pendingBranchCount: 0 },
    });

    try {
      await handleActiveInFlight({ json: true });

      expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"status":"failed"'));
      expect(exitCodesAtWrite).toEqual([undefined]);
      expect(process.exitCode).toBe(1);
    } finally {
      stdout.mockRestore();
      process.exitCode = undefined;
    }
  });

  it("renders a partial expansion with its pending branch count", async () => {
    process.exitCode = undefined;
    mocks.note.mockReset();
    mocks.runExpansion.mockResolvedValue({
      entries: [],
      warnings: [],
      snapshot: { refs: {}, worktrees: {} },
      reachable: true,
      remoteEvidence: "pending-fetch",
      candidateExpansion: { status: "partial", pendingBranchCount: 2 },
    });

    try {
      await handleActiveInFlight({});

      expect(mocks.note).toHaveBeenCalledWith(
        expect.stringContaining("2 advertised branches remain unavailable"),
        "In-flight",
      );
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = undefined;
    }
  });

  it("renders a failed expansion with its typed remote failure reason", async () => {
    process.exitCode = undefined;
    mocks.note.mockReset();
    mocks.runExpansion.mockResolvedValue({
      entries: [],
      warnings: [],
      snapshot: { refs: {}, worktrees: {} },
      reachable: false,
      remoteEvidence: "unreachable",
      failureReason: "auth",
      candidateExpansion: { status: "failed", pendingBranchCount: 0 },
    });

    try {
      await handleActiveInFlight({});

      expect(mocks.note).toHaveBeenCalledWith(
        expect.stringContaining("expansion failed — remote auth"),
        "In-flight",
      );
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = undefined;
    }
  });

  it.each([
    {
      label: "complete live expansion",
      result: {
        entries: [], warnings: [], snapshot: { refs: {}, worktrees: {} }, reachable: true,
        remoteEvidence: "exact", candidateExpansion: { status: "complete", pendingBranchCount: 0 },
      },
    },
    {
      label: "local inspection",
      result: {
        entries: [], warnings: [], snapshot: { refs: {}, worktrees: {} }, reachable: false,
        remoteEvidence: "not-applicable",
        candidateExpansion: { status: "not-requested", pendingBranchCount: 0 },
      },
    },
  ])("keeps a $label successful", async ({ result }) => {
    process.exitCode = undefined;
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mocks.runExpansion.mockResolvedValue(result);

    try {
      await handleActiveInFlight({ json: true });

      expect(process.exitCode).toBeUndefined();
    } finally {
      stdout.mockRestore();
      process.exitCode = undefined;
    }
  });

  it.each([
    { label: "--local", opts: { json: true, local: true } },
    { label: "--no-fetch", opts: { json: true, fetch: false } },
  ])("forwards $label to the coordinator as a local-only request", async ({ opts }) => {
    process.exitCode = undefined;
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mocks.runExpansion.mockResolvedValue({
      entries: [], warnings: [], snapshot: { refs: {}, worktrees: {} }, reachable: false,
      remoteEvidence: "not-applicable",
      candidateExpansion: { status: "not-requested", pendingBranchCount: 0 },
    });

    try {
      await handleActiveInFlight(opts);

      expect(mocks.runExpansion).toHaveBeenCalledWith(expect.objectContaining({ localOnly: true }));
      expect(process.exitCode).toBeUndefined();
    } finally {
      stdout.mockRestore();
      process.exitCode = undefined;
    }
  });
});
