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
  facts: {
    mergeInProgress?: boolean;
    role?: string;
    cleanup?: string;
    encoding?: string;
  } = {},
): CommitMessageCheckRepository {
  return {
    cleanup: facts.cleanup ?? "default",
    encoding: facts.encoding ?? "utf-8",
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
  readFileWithIdentity?: (path: string) => Promise<{ bytes: Uint8Array; identity: string }>;
  readStdin?: () => Promise<Uint8Array>;
  repo?: CommitMessageCheckRepository;
  setupRepository?: () => Promise<CommitMessageCheckRepository>;
  hasPrepareCommitMsgHook?: (cwd: string) => Promise<boolean>;
  stdinIsTTY?: boolean;
} = {}) {
  const readFile = vi.fn(overrides.readFile ?? (() => Promise.resolve(new Uint8Array())));
  const readStdin = vi.fn(overrides.readStdin ?? (() => Promise.resolve(new Uint8Array())));
  return {
    readFile,
    readStdin,
    preflight: createCommitMessagePreflight({
      stdinIsTTY: overrides.stdinIsTTY ?? false,
      readFile,
      ...(overrides.readFileWithIdentity === undefined
        ? {}
        : { readFileWithIdentity: overrides.readFileWithIdentity }),
      readStdin,
      setupRepository: overrides.setupRepository ?? (async () => overrides.repo ?? repository()),
      hasPrepareCommitMsgHook: overrides.hasPrepareCommitMsgHook ?? (async () => false),
    }),
  };
}

describe("createCommitMessagePreflight", () => {
  it("returns a validation refusal for invalid assembled message argv", async () => {
    const { preflight } = create();

    const result = await preflight({ args: ["-m", "short"], cwd: "/repo" });

    expect(result).toMatchObject({ kind: "refused", reason: "validation" });
    expect(result).toHaveProperty("message", expect.stringContaining("Commit validation FAILED"));
  });

  it.each([
    { label: "unsupported short grammar", args: ["-Smsecret"], repo: repository() },
    {
      label: "explicit trailer modifier",
      args: ["-m", "subject", "--trailer", "Reviewed-by: Person"],
      repo: repository(),
    },
    { label: "implicit cleanup modifier", args: ["-m", "subject"], repo: repository({}, { cleanup: "strip" }) },
    {
      label: "unsupported message encoding",
      args: ["-m", "subject"],
      repo: repository({}, { encoding: "iso-8859-1" }),
    },
    { label: "editor-free reuse", args: ["-C", "HEAD"], repo: repository() },
    { label: "template with explicit source", args: ["-t", "template", "-m", "subject"], repo: repository() },
  ])("passes $label through without reading a source", async ({ args, repo }) => {
    const { preflight, readFile, readStdin } = create({ repo });

    expect(await preflight({ args, cwd: "/repo" })).toMatchObject({ kind: "pass-through" });
    expect(readFile).not.toHaveBeenCalled();
    expect(readStdin).not.toHaveBeenCalled();
  });

  it.each([
    { label: "source-free commit", args: [] },
    { label: "explicit edit", args: ["--edit", "-m", "subject"] },
    { label: "reedit", args: ["-c", "HEAD"] },
    { label: "template", args: ["-t", "template"] },
    { label: "amend fixup", args: ["--fixup=amend:HEAD"] },
    { label: "reword fixup", args: ["--fixup=reword:HEAD"] },
    { label: "squash", args: ["--squash=HEAD"] },
  ])("refuses non-TTY $label editor input", async ({ args }) => {
    const { preflight } = create();

    expect(await preflight({ args, cwd: "/repo" })).toEqual({
      kind: "refused",
      reason: "input",
      message: "Commit-message input requires an interactive editor.",
    });
  });

  it("retains file-generation identity for successful retry cleanup", async () => {
    const bytes = Buffer.from("feat(release): a sufficiently long valid subject\n");
    const { preflight, readFile } = create({
      readFileWithIdentity: async () => ({ bytes, identity: "retry-generation" }),
      repo: repository({ "commit.context_footer": "disabled" }),
    });

    await expect(preflight({ args: ["-F", "message.txt"], cwd: "/repo" })).resolves.toEqual({
      kind: "passed",
      verdict: "pass",
      messageBytes: Uint8Array.from(bytes),
      transport: {
        kind: "file",
        rawBytes: Uint8Array.from(bytes),
        sourcePath: "message.txt",
        sourceIdentity: "retry-generation",
      },
    });
    expect(readFile).not.toHaveBeenCalled();
  });

  it.each([
    { label: "source-free commit", args: [] },
    { label: "explicit edit", args: ["--edit", "-m", "subject"] },
    { label: "reedit", args: ["-c", "HEAD"] },
    { label: "template", args: ["-t", "template"] },
    { label: "amend fixup", args: ["--fixup=amend:HEAD"] },
    { label: "reword fixup", args: ["--fixup=reword:HEAD"] },
    { label: "squash", args: ["--squash=HEAD"] },
  ])("passes TTY $label input through", async ({ args }) => {
    const { preflight, readFile, readStdin } = create({ stdinIsTTY: true });

    expect(await preflight({ args, cwd: "/repo" })).toMatchObject({ kind: "pass-through" });
    expect(readFile).not.toHaveBeenCalled();
    expect(readStdin).not.toHaveBeenCalled();
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

    expect(result).toEqual({
      kind: "passed",
      verdict: expected,
      messageBytes: Uint8Array.from(Buffer.from("feat(release): a sufficiently long valid subject\n")),
      transport: { kind: "messages" },
    });
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
    {
      label: "repository setup",
      createOverrides: {
        setupRepository: async () => Promise.reject(new Error(`\u001b[31m${"x".repeat(200)}`)),
      },
      expectedPrefix: "Could not prepare commit-message preflight: ",
    },
    {
      label: "prepare-commit-msg inspection",
      createOverrides: {
        hasPrepareCommitMsgHook: async () => Promise.reject(new Error(`\u001b[31m${"x".repeat(200)}`)),
      },
      expectedPrefix: "Could not inspect prepare-commit-msg hook: ",
    },
  ])("bounds and escapes $label failures", async ({ createOverrides, expectedPrefix }) => {
    const { preflight } = create(createOverrides);

    const result = await preflight({ args: ["-m", "subject"], cwd: "/repo" });

    expect(result).toMatchObject({ kind: "refused", reason: "input" });
    if (result.kind !== "refused") throw new Error("expected input refusal");
    expect(result.message).toMatch(new RegExp(`^${expectedPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    expect(result.message).toContain("\\u001b");
    expect(result.message).not.toContain("\u001b");
    expect(result.message).toMatch(/…$/);
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
      messageBytes: Uint8Array.from(bytes),
      transport: {
        kind,
        rawBytes: Uint8Array.from(bytes),
        ...(kind === "file" ? { sourcePath: path } : {}),
      },
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

  it.each([
    { label: "disabled validation", repo: repository({ "hooks.commit_msg": "disabled" }) },
    { label: "merge exemption", repo: repository({}, { mergeInProgress: true }) },
  ])("leaves stdin untouched when $label demotes -F - to pass-through", async ({ repo }) => {
    const { preflight, readStdin } = create({ repo });

    expect(await preflight({ args: ["-F", "-"], cwd: "/repo" })).toEqual({
      kind: "pass-through",
    });
    expect(readStdin).not.toHaveBeenCalled();
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
