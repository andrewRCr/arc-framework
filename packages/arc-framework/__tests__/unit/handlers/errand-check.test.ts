/**
 * Handler-level regression coverage for `arc errand check` base-ref selection.
 *
 * The handler's system boundaries are mocked, while the foreign-artifact
 * detector runs unchanged so divergent local and remote base refs exercise the
 * user-visible JSON result.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRunActiveInFlight = vi.fn();
const mockGitExec = vi.fn();
const mockStdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  note: vi.fn(),
}));

vi.mock("../../../src/commands/active.js", () => ({
  runActiveInFlight: (...args: unknown[]) => mockRunActiveInFlight(...args),
}));

vi.mock("../../../src/commands/user.js", () => ({ runUserInboxRemove: vi.fn() }));

vi.mock("../../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: async () => ({ settings: { "branch.base": "main", "team.mode": "false" } }),
}));

vi.mock("../../../src/lib/errand/index.js", () => ({
  DEFAULT_ERRAND_BRANCH_TYPE: "chore",
  ERRAND_BRANCH_TYPES: ["chore"],
  closeErrand: vi.fn(),
  isErrandBranchType: vi.fn(),
  linkErrandToInbox: vi.fn(),
  openErrand: vi.fn(),
  promoteErrand: vi.fn(),
  retireErrand: vi.fn(),
}));

vi.mock("../../../src/lib/io-context.js", () => ({
  gitExec: (...args: unknown[]) => mockGitExec(...args),
  createUserIOContext: () => ({ exec: mockGitExec }),
}));

vi.mock("../../../src/lib/release/wu-resolution.js", () => ({
  resolveOriginatingMetaPath: async () => undefined,
}));

vi.mock("../../../src/lib/user-sync/index.js", () => ({
  clearErrandPartialPushMarker: vi.fn(),
  recordErrandPartialPushMarker: vi.fn(),
}));

vi.mock("../../../src/lib/work-unit/lifecycle-index.js", () => ({
  buildLifecycleIndex: async () => ({ entries: [] }),
}));

vi.mock("../../../src/lib/work-unit/lifecycle-resolver.js", () => ({
  listParkedSlugs: () => new Set(),
}));

vi.mock("../../../src/handlers/shared.js", () => ({
  requireArcProjectRoot: () => "/repo",
  resolveIdentityWithPrompt: async () => "andrew",
}));

const { handleErrandCheck } = await import("../../../src/handlers/errand.js");

describe("handleErrandCheck", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockStdoutWrite.mockImplementation(() => true);
    mockRunActiveInFlight.mockResolvedValue({
      entries: [
        {
          kind: "work-unit",
          name: "other",
          branch: "feat/other",
          state: "Active",
          remoteOnly: false,
        },
      ],
      warnings: [],
      snapshot: { refs: {}, worktrees: {} },
      reachable: true,
    });
    mockGitExec.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.join(" ") === "rev-parse --show-toplevel") return { stdout: "/repo\n", stderr: "" };
      if (args.join(" ") === "rev-parse --verify origin/main") {
        return { stdout: `${"a".repeat(40)}\n`, stderr: "" };
      }
      if (args.join(" ") === "rev-parse --verify main") {
        return { stdout: `${"c".repeat(40)}\n`, stderr: "" };
      }
      if (args.join(" ") === "rev-parse --verify feat/other") {
        return { stdout: `${"b".repeat(40)}\n`, stderr: "" };
      }
      if (args[0] === "diff" && args[1] === `${"a".repeat(40)}...${"b".repeat(40)}`) {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "diff" && args[1] === `${"c".repeat(40)}...${"b".repeat(40)}`) {
        return { stdout: ".arc/active/meta-other.md\n", stderr: "" };
      }
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("uses the remote base when local and remote base refs diverge", async () => {
    await handleErrandCheck({ target: [".arc/active/meta-other.md"], json: true });

    const output = mockStdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(JSON.parse(output)).toMatchObject({ overlaps: [], reachable: true });
  });
});
