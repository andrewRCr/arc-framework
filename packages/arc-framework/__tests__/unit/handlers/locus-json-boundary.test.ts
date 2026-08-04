/** Result-boundary coverage for mutation-handler setup and raw output. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  abandonOrdinaryErrandAtRuntime: vi.fn(),
  attachLocusAtRuntime: vi.fn(),
  readConfigSettings: vi.fn(),
  releaseLocusAtRuntime: vi.fn(),
  resolveLocusAtRuntime: vi.fn(),
  resolvePrimaryWorktreePath: vi.fn(),
  resolveUserSurfaceResolver: vi.fn(),
}));

vi.mock("../../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: (...args: unknown[]) => mocks.readConfigSettings(...args),
}));
vi.mock("../../../src/handlers/shared.js", () => ({
  requireArcProjectRoot: () => "/repo",
  resolveIdentityWithPrompt: async () => "andrew",
}));
vi.mock("../../../src/lib/git/worktree-roster.js", () => ({
  resolvePrimaryWorktreePath: (...args: unknown[]) => mocks.resolvePrimaryWorktreePath(...args),
}));
vi.mock("../../../src/lib/user-surfaces.js", () => ({
  resolveUserSurfaceResolver: (...args: unknown[]) => mocks.resolveUserSurfaceResolver(...args),
}));
vi.mock("../../../src/lib/locus/command-runtime.js", () => ({
  attachLocusAtRuntime: (...args: unknown[]) => mocks.attachLocusAtRuntime(...args),
  releaseLocusAtRuntime: (...args: unknown[]) => mocks.releaseLocusAtRuntime(...args),
  resolveLocusAtRuntime: (...args: unknown[]) => mocks.resolveLocusAtRuntime(...args),
}));
vi.mock("../../../src/lib/errand/abandon-runtime.js", () => ({
  abandonOrdinaryErrandAtRuntime: (...args: unknown[]) => mocks.abandonOrdinaryErrandAtRuntime(...args),
}));

import { handleErrandLeave, handleErrandOpen } from "../../../src/handlers/errand.js";
import { handleLocusAttach, handleLocusRelease, handleLocusResolve } from "../../../src/handlers/locus.js";
import { createLocusMutationResult } from "../../../src/lib/locus/mutation.js";
import type { LocusMutationResultV1 } from "../../../src/lib/locus/schema/index.js";

let stdout = "";
let stderr = "";
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

function jsonLines(): string[] {
  return stdout.trimEnd().split("\n");
}

type TestAbandonSubject = "errand" | "partial-errand" | "housekeep" | "groom";

async function runAbandonDispatch(subject: TestAbandonSubject): Promise<void> {
  mocks.resolveUserSurfaceResolver.mockResolvedValueOnce({ identityGlobalRoot: "/users/andrew" });
  mocks.resolveLocusAtRuntime.mockImplementationOnce(async (value: unknown) => {
    const options = value as {
      abandon(dispatch: {
        subject: TestAbandonSubject;
        action: "abandon";
        key: string;
        selected: { recordId: string; leaseId: string };
        confirmedNoLiveSession: boolean;
      }): Promise<LocusMutationResultV1>;
    };
    return options.abandon({
      subject,
      action: "abandon",
      key: "retained",
      selected: { recordId: `sha256:${"a".repeat(64)}`, leaseId: "b".repeat(32) },
      confirmedNoLiveSession: false,
    });
  });
  await handleLocusResolve(`sha256:${"a".repeat(64)}`, { action: "abandon", json: true });
}

beforeEach(() => {
  vi.resetAllMocks();
  stdout = "";
  stderr = "";
  process.exitCode = undefined;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  mocks.readConfigSettings.mockResolvedValue({
    settings: {
      "branch.base": "main",
      "branch.protection": "full",
      "worktree.location_template": "../{repo}-{branch}",
      "worktree.post_create": "",
      "worktree.harness_dirs": "",
    },
    warnings: [],
  });
  mocks.resolvePrimaryWorktreePath.mockResolvedValue("/repo");
  mocks.resolveUserSurfaceResolver.mockRejectedValue(new Error("user surfaces unavailable"));
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  process.exitCode = undefined;
});

describe("mutation handler JSON boundaries", () => {
  it("returns one locus result when configuration setup fails", async () => {
    mocks.readConfigSettings.mockRejectedValueOnce(new Error("configuration unavailable"));

    await handleLocusAttach({ json: true });

    const lines = jsonLines();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      outcome: "error",
      operation: "locus-attach",
      error: { message: "configuration unavailable" },
    });
    expect(process.exitCode).toBe(1);
  });

  it("returns one Errand result when user-surface setup fails", async () => {
    await handleErrandOpen("typed-setup", { json: true });

    const lines = jsonLines();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      outcome: "error",
      operation: "errand-open",
      error: { message: "user surfaces unavailable" },
    });
    expect(process.exitCode).toBe(1);
  });

  it("refuses Errand leave before mutation when the configured base is blank", async () => {
    mocks.readConfigSettings.mockResolvedValueOnce({
      settings: {
        "branch.base": "   ",
        "branch.protection": "full",
        "worktree.location_template": "../{repo}-{branch}",
        "worktree.post_create": "",
        "worktree.harness_dirs": "",
      },
      warnings: [],
    });

    await handleErrandLeave("typed-setup", { state: "paused", json: true });

    const lines = jsonLines();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      outcome: "error",
      operation: "errand-leave",
      error: { code: "locus.errand-leave.config" },
    });
    expect(process.exitCode).toBe(1);
  });
});

describe("locus mutation human output", () => {
  it("terminates a raw success on stdout", async () => {
    mocks.attachLocusAtRuntime.mockResolvedValue(createLocusMutationResult({
      outcome: "applied",
      operation: "locus-attach",
      allocation: null,
      recordId: null,
      leaseId: null,
      activeLocusPath: null,
      sessionHomePath: null,
      identity: null,
      originEntry: null,
      restoredParent: null,
      nextOffer: null,
      recommendedPromptText: "Attached the session locus.",
    }));

    await handleLocusAttach({ json: false });

    expect(stdout).toBe("Attached the session locus.\n");
    expect(stderr).toBe("");
    expect(process.exitCode).toBe(0);
  });

  it("terminates a raw refusal on stderr", async () => {
    mocks.releaseLocusAtRuntime.mockResolvedValue(createLocusMutationResult({
      outcome: "refused",
      operation: "locus-release",
      reason: "lease-generation-mismatch",
      recommendedPromptText: "The selected lease generation changed.",
    }));

    await handleLocusRelease(`sha256:${"a".repeat(64)}`, {
      lease: "0123456789abcdef0123456789abcdef",
      json: false,
    });

    expect(stdout).toBe("");
    expect(stderr).toBe(
      "Refused [lease-generation-mismatch]: The selected lease generation changed.\n",
    );
    expect(process.exitCode).toBe(1);
  });
});

describe("locus abandon dispatch", () => {
  it.each(["partial-errand", "housekeep", "groom"] as const)(
    "refuses the unavailable %s subject driver",
    async (subject) => {
      mocks.abandonOrdinaryErrandAtRuntime.mockResolvedValue(createLocusMutationResult({
        outcome: "applied", operation: "errand-abandon", allocation: null,
        recordId: null, leaseId: null, activeLocusPath: null, sessionHomePath: null,
        identity: null, originEntry: null, restoredParent: null, nextOffer: null,
        recommendedPromptText: "Abandoned.",
      }));

      await runAbandonDispatch(subject);

      expect(JSON.parse(jsonLines()[0] ?? "")).toMatchObject({
        outcome: "refused",
        operation: "locus-resolve",
        reason: "role-conflict",
      });
      expect(mocks.abandonOrdinaryErrandAtRuntime).not.toHaveBeenCalled();
    },
  );

  it("delegates an ordinary Errand to its available abandon driver", async () => {
    mocks.abandonOrdinaryErrandAtRuntime.mockResolvedValue(createLocusMutationResult({
      outcome: "applied", operation: "errand-abandon", allocation: null,
      recordId: null, leaseId: null, activeLocusPath: null, sessionHomePath: null,
      identity: null, originEntry: null, restoredParent: null, nextOffer: null,
      recommendedPromptText: "Abandoned.",
    }));

    await runAbandonDispatch("errand");

    expect(JSON.parse(jsonLines()[0] ?? "")).toMatchObject({
      outcome: "applied",
      operation: "errand-abandon",
    });
  });
});
