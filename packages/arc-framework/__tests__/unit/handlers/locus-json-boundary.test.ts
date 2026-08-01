/** JSON result coverage for mutation-handler setup failures. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readConfigSettings: vi.fn(),
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

import { handleErrandOpen } from "../../../src/handlers/errand.js";
import { handleLocusAttach } from "../../../src/handlers/locus.js";

let stdout = "";
let stdoutSpy: ReturnType<typeof vi.spyOn>;

function jsonLines(): string[] {
  return stdout.trimEnd().split("\n");
}

beforeEach(() => {
  vi.resetAllMocks();
  stdout = "";
  process.exitCode = undefined;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
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
});
