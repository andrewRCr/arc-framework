/**
 * Handler-level regression coverage for `arc errand check` base-ref selection.
 *
 * The handler's system boundaries are mocked, while the foreign-artifact
 * detector runs unchanged so divergent local and remote base refs exercise the
 * user-visible JSON result.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

const mockRunActiveInFlight = vi.fn();
const mockGitExec = vi.fn();
const mockWithLockedUserInbox = vi.fn();
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

vi.mock("../../../src/commands/user.js", () => ({
  runUserInboxRemove: vi.fn(),
  withLockedUserInbox: (...args: unknown[]) => mockWithLockedUserInbox(...args),
}));

vi.mock("../../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: async () => ({ settings: { "branch.base": "main", "team.mode": "false" } }),
}));

vi.mock("../../../src/lib/io-context.js", () => ({
  gitExec: (...args: unknown[]) => mockGitExec(...args),
  createGitExec: () => mockGitExec,
  createUserIOContext: () => ({ exec: mockGitExec }),
}));

vi.mock("../../../src/lib/release/wu-resolution.js", () => ({
  resolveOriginatingMetaPath: async () => undefined,
}));

vi.mock("../../../src/lib/user-sync/index.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/lib/user-sync/index.js")>(),
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
}));

const { handleErrandCheck, handleErrandNext } = await import("../../../src/handlers/errand.js");

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
    mockWithLockedUserInbox.mockResolvedValue({
      postImage: {
        state: "present",
        content: "# User Inbox\n\n## Errand\n\n### `[ ]` **First queued Errand**\n\n"
          + "- _Disposition:_ `execute-bound`\n",
      },
    });
    const { exec } = scriptGitExec([
      { match: ["config", "--null", "--get", "arc.identity"], responses: [{ stdout: "andrew\0" }] },
      { match: ["rev-parse", "--show-toplevel"], responses: [{ stdout: "/repo\n", stderr: "" }] },
      { match: ["rev-parse", "--verify", "origin/main"],
        responses: [{ stdout: `${"a".repeat(40)}\n`, stderr: "" }] },
      { match: ["rev-parse", "--verify", "main"],
        responses: [{ stdout: `${"c".repeat(40)}\n`, stderr: "" }] },
      { match: ["rev-parse", "--verify", "feat/other"],
        responses: [{ stdout: `${"b".repeat(40)}\n`, stderr: "" }] },
      { match: { prefix: ["diff", `${"a".repeat(40)}...${"b".repeat(40)}`] },
        responses: [{ stdout: "", stderr: "" }] },
      { match: { prefix: ["diff", `${"c".repeat(40)}...${"b".repeat(40)}`] },
        responses: [{ stdout: ".arc/active/meta-other.md\n", stderr: "" }] },
    ]);
    mockGitExec.mockImplementation(exec);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("uses the remote base when local and remote base refs diverge", async () => {
    await handleErrandCheck({ target: [".arc/active/meta-other.md"], json: true });

    const output = mockStdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(JSON.parse(output)).toMatchObject({ overlaps: [], reachable: true });
    expect(mockRunActiveInFlight).toHaveBeenCalledWith(expect.objectContaining({
      localOnly: false,
    }));
  });

  it("resolves the first execute-bound capture without opening it", async () => {
    await handleErrandNext({ json: true });

    const output = mockStdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(JSON.parse(output)).toMatchObject({
      state: "available",
      nextAction: "open-errand",
      nextOffer: { kind: "errand", key: "First queued Errand", parentCheckoutPath: null },
    });
  });

  it("refuses startup until every malformed queue entry is corrected", async () => {
    mockWithLockedUserInbox.mockResolvedValueOnce({
      postImage: {
        state: "present",
        content: "# User Inbox\n\n## Errand\n\n### `[ ]` Malformed sibling\n\n"
          + "- _Observation:_ unreadable.\n\n### `[ ]` **First queued Errand**\n\n"
          + "- _Disposition:_ `execute-bound`\n",
      },
    });

    await handleErrandNext({ json: true });

    const output = mockStdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(JSON.parse(output)).toMatchObject({
      state: "refused",
      nextAction: "stop",
      reason: expect.stringContaining("Malformed USER-INBOX entry heading"),
      retryCommand: "arc errand next --json",
    });
  });

  it("keeps identity probe failures inside the typed refusal boundary", async () => {
    mockGitExec.mockRejectedValueOnce(new Error("identity configuration is unreadable"));

    await handleErrandNext({ json: true });

    const output = mockStdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(JSON.parse(output)).toMatchObject({
      state: "refused",
      nextAction: "stop",
      reason: "identity configuration is unreadable",
    });
  });
});
