import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { v3DecomposeRemedy } from "../../src/lib/work-unit/decompose-v3-refusal.js";

const mockIntro = vi.fn();
const mockLogError = vi.fn();
vi.mock("@clack/prompts", () => ({
  intro: (...args: unknown[]) => mockIntro(...args),
  log: { error: (...args: unknown[]) => mockLogError(...args) },
}));

const mockResolveArcRoot = vi.fn();
vi.mock("../../src/lib/paths.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/paths.js")>(),
  resolveArcRoot: (...args: unknown[]) => mockResolveArcRoot(...args),
}));

const mockReadConfigSettings = vi.fn();
vi.mock("../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: (...args: unknown[]) => mockReadConfigSettings(...args),
}));

const mockCreateUserIOContext = vi.fn();
const mockReadGitBlobBytes = vi.fn();
vi.mock("../../src/lib/io-context.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/io-context.js")>(),
  createUserIOContext: (...args: unknown[]) => mockCreateUserIOContext(...args),
  readGitBlobBytes: (...args: unknown[]) => mockReadGitBlobBytes(...args),
}));

const mockCreateGitV3DecomposePreflight = vi.fn();
vi.mock("../../src/lib/work-unit/git-decompose-v3-preflight.js", () => ({
  createGitV3DecomposePreflight: (...args: unknown[]) => mockCreateGitV3DecomposePreflight(...args),
}));

const { handleDecompose } = await import("../../src/handlers/lifecycle.js");

let stdout = "";
let stderr = "";
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  process.exitCode = undefined;
  stdout = "";
  stderr = "";
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  mockResolveArcRoot.mockReturnValue("/repo");
  mockReadConfigSettings.mockResolvedValue({
    settings: { "branch.base": "main" },
    defaultsApplied: [],
    warnings: [],
  });
  mockCreateUserIOContext.mockReturnValue({ exec: vi.fn() });
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  process.exitCode = undefined;
});

describe("handleDecompose preflight mode", () => {
  it("writes one byte-exact canonical starter map with config warnings isolated on stderr", async () => {
    const starterMap = {
      schemaVersion: 3,
      machine: {
        preflightId: `sha256:${"a".repeat(64)}`,
        planningProfile: { kind: "draft", sourceDesign: ["draft-origin.md"] },
      },
      authoring: { shape: { status: "author" } },
    };
    mockReadConfigSettings.mockResolvedValue({
      settings: { "branch.base": "main" },
      defaultsApplied: [],
      warnings: ["configured fallback applied"],
    });
    mockCreateGitV3DecomposePreflight.mockResolvedValue({
      status: "ready",
      preflight: { starterMap },
    });

    await handleDecompose("origin", { preflight: true });

    expect(stdout).toBe(`${canonicalize(starterMap)}\n`);
    expect(stderr).toBe("configured fallback applied\n");
    expect(process.exitCode).toBeUndefined();
    expect(mockIntro).not.toHaveBeenCalled();
  });

  it("refuses an invocation without preflight authority before emitting machine output", async () => {
    await handleDecompose("origin", {});

    expect(stdout).toBe("");
    expect(stderr).toBe("");
    expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining("preflight"));
    expect(process.exitCode).toBe(1);
  });

  it("keeps a project-root refusal outside the selected-mode envelope", async () => {
    mockResolveArcRoot.mockReturnValue(null);

    await handleDecompose("origin", { preflight: true });

    expect(stdout).toBe("");
    expect(stderr).toContain("Not inside an ARC project");
    expect(process.exitCode).toBe(1);
    expect(mockIntro).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "config",
      configure: () => mockReadConfigSettings.mockRejectedValue(new Error("invalid config")),
      reason: "unexpected-error",
      locus: "invalid config",
    },
    {
      name: "source profile",
      configure: () => mockCreateGitV3DecomposePreflight.mockResolvedValue({
        status: "rejected",
        reason: "planning-profile",
        locus: ".arc/active/meta-origin.md#Design",
      }),
      reason: "planning-profile",
      locus: ".arc/active/meta-origin.md#Design",
    },
  ])("emits the selected preflight $name refusal through the typed envelope", async ({
    configure,
    reason,
    locus,
  }) => {
    configure();
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "preflight", origin: "origin" },
      reason,
      locus,
    });

    await handleDecompose("origin", { preflight: true });

    expect(stdout).toBe(`${canonicalize({ status: "refused", reason, locus, remedy })}\n`);
    expect(stderr).toBe(`${reason}\n${remedy.text}\n`);
    expect(process.exitCode).toBe(1);
    expect(mockIntro).not.toHaveBeenCalled();
  });
});
