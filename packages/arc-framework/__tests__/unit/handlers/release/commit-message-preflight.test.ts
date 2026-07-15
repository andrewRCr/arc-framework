/** Unit coverage for in-process release-commit message preflight. */

import { describe, expect, it, vi } from "vitest";

import { createCommitMessagePreflight } from "../../../../src/handlers/release/commit-message-preflight.js";
import {
  COMMIT_CHECK_DEFAULTS,
  createCommitCheckContext,
} from "../../../../src/lib/commit-check/index.js";
import type { CommitMessageCheckRepository } from "../../../../src/lib/commit-check/repository.js";

function repository(
  overrides: Partial<typeof COMMIT_CHECK_DEFAULTS> = {},
  facts: { mergeInProgress?: boolean; role?: string } = {},
): CommitMessageCheckRepository {
  return {
    cleanup: "default",
    encoding: "utf-8",
    context: createCommitCheckContext({
      configuration: { ...COMMIT_CHECK_DEFAULTS, ...overrides },
      mergeInProgress: facts.mergeInProgress ?? false,
      role: facts.role,
      resolveArtifact: () => "found",
    }),
  };
}

function create(overrides: {
  readFile?: (path: string) => Promise<Uint8Array>;
  readStdin?: () => Promise<Uint8Array>;
  repo?: CommitMessageCheckRepository;
  hasPrepareCommitMsgHook?: (cwd: string) => Promise<boolean>;
} = {}) {
  const readFile = vi.fn(overrides.readFile ?? (() => Promise.resolve(new Uint8Array())));
  const readStdin = vi.fn(overrides.readStdin ?? (() => Promise.resolve(new Uint8Array())));
  return {
    readFile,
    readStdin,
    preflight: createCommitMessagePreflight({
      stdinIsTTY: false,
      readFile,
      readStdin,
      setupRepository: async () => overrides.repo ?? repository(),
      hasPrepareCommitMsgHook: overrides.hasPrepareCommitMsgHook ?? (async () => false),
    }),
  };
}

describe("createCommitMessagePreflight", () => {
  it("returns a validation refusal for invalid assembled message argv", async () => {
    const { preflight } = create();

    const result = await preflight({ args: ["-m", "short"], cwd: "/repo" });

    expect(result).toMatchObject({ kind: "refused", reason: "validation" });
  });

  it.each([
    { footer: "disabled" as const, expected: "pass" },
    { footer: "recommended" as const, expected: "pass-with-warnings" },
  ])("returns $expected for a canonical validator result", async ({ footer, expected }) => {
    const { preflight } = create({
      repo: repository({ "commit.context_footer": footer }),
    });

    const result = await preflight({
      args: ["-m", "feat(release): a sufficiently long valid subject"],
      cwd: "/repo",
    });

    expect(result).toEqual({ kind: "passed", verdict: expected, transport: { kind: "messages" } });
  });

  it.each([
    { path: "missing.txt", expectedReader: "file" },
    { path: "-", expectedReader: "stdin" },
  ])("maps an unreadable $expectedReader source to an input refusal", async ({ path, expectedReader }) => {
    const failure = async () => Promise.reject(new Error("unreadable"));
    const { preflight, readFile, readStdin } = create({ readFile: failure, readStdin: failure });

    const result = await preflight({ args: ["-F", path], cwd: "/repo" });

    expect(result).toMatchObject({ kind: "refused", reason: "input" });
    expect(readFile).toHaveBeenCalledTimes(expectedReader === "file" ? 1 : 0);
    expect(readStdin).toHaveBeenCalledTimes(expectedReader === "stdin" ? 1 : 0);
  });

  it("maps malformed file bytes to an encoding input refusal", async () => {
    const { preflight } = create({
      readFile: async () => Uint8Array.from([0xc3, 0x28]),
    });

    expect(await preflight({ args: ["-F", "message.txt"], cwd: "/repo" })).toMatchObject({
      kind: "refused",
      reason: "input",
    });
  });

  it.each([
    { path: "message.txt", kind: "file" as const },
    { path: "-", kind: "stdin" as const },
  ])("retains captured raw bytes for $kind transport", async ({ path, kind }) => {
    const bytes = Buffer.from("feat(release): a sufficiently long valid subject\n");
    const { preflight } = create({
      readFile: async () => bytes,
      readStdin: async () => bytes,
      repo: repository({ "commit.context_footer": "disabled" }),
    });

    expect(await preflight({ args: ["-F", path], cwd: "/repo" })).toEqual({
      kind: "passed",
      verdict: "pass",
      transport: { kind, rawBytes: Uint8Array.from(bytes) },
    });
  });

  it("skips source reads for pass-through grammar", async () => {
    const { preflight, readFile, readStdin } = create();

    expect(await preflight({ args: ["-Smsecret"], cwd: "/repo" })).toMatchObject({
      kind: "pass-through",
    });
    expect(readFile).not.toHaveBeenCalled();
    expect(readStdin).not.toHaveBeenCalled();
  });

  it.each([
    { label: "disabled validation", repo: repository({ "hooks.commit_msg": "disabled" }) },
    { label: "merge exemption", repo: repository({}, { mergeInProgress: true }) },
  ])("demotes $label to pass-through", async ({ repo }) => {
    const { preflight } = create({ repo });

    expect(await preflight({ args: ["-m", "short"], cwd: "/repo" })).toEqual({
      kind: "pass-through",
    });
  });

  it("demotes a runnable prepare-commit-msg hook before reading the source", async () => {
    const { preflight, readFile, readStdin } = create({
      hasPrepareCommitMsgHook: async () => true,
    });

    expect(await preflight({ args: ["-F", "message.txt"], cwd: "/repo" })).toEqual({
      kind: "pass-through",
    });
    expect(readFile).not.toHaveBeenCalled();
    expect(readStdin).not.toHaveBeenCalled();
  });
});
