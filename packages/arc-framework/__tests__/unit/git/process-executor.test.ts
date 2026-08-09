import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));

vi.mock("execa", () => ({ execa: execaMock }));

import {
  createExecaGitExec,
  createExecaGitExecInput,
  createExecaRawGitExec,
} from "../../../src/lib/git/process-executor.js";

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("local-only object access", () => {
  it("keeps byte-preserving Git reads noninteractive without invocation-specific policy", async () => {
    vi.stubEnv("GIT_SSH_COMMAND", undefined);
    execaMock.mockImplementation(async (_command, _args, options) => {
      expect(options.env).toMatchObject({
        GIT_TERMINAL_PROMPT: "0",
        GIT_EDITOR: "true",
        GIT_PAGER: "cat",
        PAGER: "cat",
        GIT_SSH_COMMAND: "ssh -oBatchMode=yes -oNumberOfPasswordPrompts=0",
        SSH_ASKPASS_REQUIRE: "never",
      });
      expect(options.stdin).toBe("ignore");
      return { stdout: Buffer.from("raw"), stderr: Buffer.alloc(0) };
    });

    await expect(createExecaRawGitExec("/repo")(["cat-file", "blob", "a".repeat(40)]))
      .resolves.toEqual({ stdout: Buffer.from("raw"), stderr: Buffer.alloc(0) });
  });

  it("composes SSH prompt suppression with user commands after cwd environment sanitization", async () => {
    vi.stubEnv("GIT_SSH_COMMAND", 'ssh -F "/configs/work account" -i "/keys/work key"');
    vi.stubEnv("GIT_DIR", "/wrong/repository");
    vi.stubEnv("GIT_CONFIG_COUNT", "1");

    execaMock.mockImplementation(async (_command, _args, options) => {
      expect(options.env).toMatchObject({
        GIT_SSH_COMMAND: 'ssh -F "/configs/work account" -i "/keys/work key" -oBatchMode=yes -oNumberOfPasswordPrompts=0',
        SSH_ASKPASS_REQUIRE: "never",
      });
      expect(options.env.GIT_DIR).toBeUndefined();
      expect(options.env.GIT_CONFIG_COUNT).toBeUndefined();
      return { stdout: Buffer.from("raw"), stderr: Buffer.alloc(0) };
    });

    await expect(createExecaRawGitExec("/intended/repository")(["rev-parse", "HEAD"]))
      .resolves.toEqual({ stdout: Buffer.from("raw"), stderr: Buffer.alloc(0) });
  });

  it("makes a prompt-capable SSH transport fail promptly in a real Git process", async () => {
    const promptCapableSsh = [
      "sh -c '",
      'if [ "$1" = -oBatchMode=yes ] && [ "$2" = -oNumberOfPasswordPrompts=0 ];',
      "then exit 86; fi;",
      "sleep 10",
      "' arc-ssh-fixture",
    ].join(" ");
    vi.stubEnv("GIT_SSH_COMMAND", promptCapableSsh);

    execaMock.mockImplementation(async (command, args, options) => {
      const actual = await vi.importActual<typeof import("execa")>("execa");
      return actual.execa(command, args, { ...options, timeout: 2_000 });
    });

    const startedAt = Date.now();
    await expect(createExecaRawGitExec(process.cwd())([
      "ls-remote",
      "ssh://prompt.invalid/repository",
    ])).rejects.toMatchObject({ kind: "nonzero-exit", exitCode: 128 });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it("pairs the Git global option and environment guard for captured output", async () => {
    execaMock.mockImplementation(async (_command, args, options) => {
      if (args[0] !== "--no-lazy-fetch" || options.env?.GIT_NO_LAZY_FETCH !== "1") {
        throw new Error("object access was allowed to materialize");
      }
      return { stdout: "local-only", stderr: "" };
    });

    await expect(createExecaGitExec()("git", ["cat-file", "-e", "HEAD"], {
      objectAccess: "local-only",
    })).resolves.toEqual({ stdout: "local-only", stderr: "" });
  });

  it("pairs the Git global option and environment guard for stdin-fed output", async () => {
    execaMock.mockImplementation(async (_command, args, options) => {
      if (
        args[0] !== "--no-lazy-fetch"
        || options.env?.GIT_NO_LAZY_FETCH !== "1"
        || options.input !== "HEAD\n"
      ) {
        throw new Error("stdin-fed object access was allowed to materialize");
      }
      return { stdout: "HEAD commit 1\n", stderr: "" };
    });

    await expect(createExecaGitExecInput()(
      ["cat-file", "--batch-check"],
      "HEAD\n",
      { objectAccess: "local-only" },
    )).resolves.toBe("HEAD commit 1\n");
  });

  it("places the capability guard before an unsupported Git can enter the object subcommand", async () => {
    let objectSubcommandRan = false;
    execaMock.mockImplementation(async (_command, args) => {
      if (args[0] === "--no-lazy-fetch") {
        throw Object.assign(new Error("unknown option: --no-lazy-fetch"), {
          exitCode: 129,
          stderr: "unknown option: --no-lazy-fetch",
        });
      }
      objectSubcommandRan = true;
      return { stdout: "unexpected", stderr: "" };
    });

    await expect(createExecaGitExec()("git", ["cat-file", "-e", "HEAD"], {
      objectAccess: "local-only",
    })).rejects.toMatchObject({ kind: "nonzero-exit", exitCode: 129 });
    expect(objectSubcommandRan).toBe(false);
  });

  it("preserves captured-output argv and environment for ordinary or explicit calls", async () => {
    execaMock.mockImplementation(async (_command, args, options) => {
      if (args[0] !== "fetch" || options.env?.GIT_NO_LAZY_FETCH !== undefined) {
        throw new Error("default acquisition policy changed");
      }
      return { stdout: "fetched", stderr: "" };
    });

    await expect(createExecaGitExec()("git", ["fetch", "origin", "main"]))
      .resolves.toEqual({ stdout: "fetched", stderr: "" });
  });

  it("preserves stdin-fed argv and environment for ordinary or explicit calls", async () => {
    execaMock.mockImplementation(async (_command, args, options) => {
      if (
        args[0] !== "hash-object"
        || options.env?.GIT_NO_LAZY_FETCH !== undefined
        || options.input !== "payload"
      ) {
        throw new Error("default stdin-fed acquisition policy changed");
      }
      return { stdout: "object\n", stderr: "" };
    });

    await expect(createExecaGitExecInput()(["hash-object", "--stdin"], "payload"))
      .resolves.toBe("object\n");
  });

  it("binds forbidden terminal policy to stdin-fed Git execution", async () => {
    execaMock.mockImplementation(async (_command, _args, options) => {
      expect(options.env).toMatchObject({
        GIT_TERMINAL_PROMPT: "0",
        GIT_EDITOR: "true",
        GIT_PAGER: "cat",
        PAGER: "cat",
      });
      return { stdout: "object\n", stderr: "" };
    });

    const execInput = createExecaGitExecInput(1024, {
      terminalPrompts: "forbidden",
      presenters: "forbidden",
      ambientStdin: "closed",
    });

    await expect(execInput(["hash-object", "--stdin"], "payload"))
      .resolves.toBe("object\n");
  });

  it("leaves prompt policy untouched for allowed stdin-fed Git execution", async () => {
    execaMock.mockImplementation(async (_command, _args, options) => {
      expect(options.env?.GIT_TERMINAL_PROMPT).toBeUndefined();
      expect(options.env?.GIT_EDITOR).toBeUndefined();
      expect(options.env?.GIT_PAGER).toBeUndefined();
      expect(options.env?.PAGER).toBeUndefined();
      return { stdout: "object\n", stderr: "" };
    });

    const execInput = createExecaGitExecInput(1024, {
      terminalPrompts: "allowed",
      presenters: "allowed",
      ambientStdin: "inherit",
    });

    await expect(execInput(["hash-object", "--stdin"], "payload"))
      .resolves.toBe("object\n");
  });
});
