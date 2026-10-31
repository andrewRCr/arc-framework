import { describe, expect, it } from "vitest";

import type { GitProcessError } from "../../../src/lib/git/process-error.js";
import type { GitExec, GitExecInput, GitExecOptions, RawGitExec } from "../../../src/lib/git/exec.js";
import {
  createGitFloorGate, gateGitExecutors, parseGitVersion, withGitVersionFloor, type GitVersionProbe,
} from "../../../src/lib/git/version-floor.js";
import { makeGitProcessError, scriptGitExec } from "../../helpers/git-exec-fake.js";

describe("Git version parsing", () => {
  it.each([
    ["git version 2.47.0\n", { major: 2, minor: 47, patch: 0 }],
    ["git version 2.47.1.windows.1", { major: 2, minor: 47, patch: 1 }],
    ["git version 2.47.0 (Apple Git-154)", { major: 2, minor: 47, patch: 0 }],
    ["git version 2.48.0.rc0", { major: 2, minor: 48, patch: 0 }],
  ] as const)("reads %s", (output, expected) => {
    expect(parseGitVersion(output)).toEqual(expected);
  });
});

function failedCall(variant: string, error: GitProcessError, probe: GitVersionProbe): () => Promise<unknown> {
  const args = [...error.args];
  if (variant === "plain") {
    const exec: GitExec = async () => { throw error; };
    return () => withGitVersionFloor(exec, probe)(error.command, args);
  }
  if (variant === "stdin") {
    const exec: GitExecInput = async () => { throw error; };
    return () => withGitVersionFloor(exec, probe)(args, "");
  }
  const exec: RawGitExec = async () => { throw error; };
  return () => withGitVersionFloor(exec, probe)(args);
}

describe("failure-time Git floor", () => {
  it.each(["plain", "stdin", "raw"].flatMap((variant) => ["2.45.0", "2.47.0", "2.48.0", "2.51.2", "2.52.0"].map((version) => ({ variant, version }))))(
    "explains an unsupported option on Git $version through the $variant port", async ({ variant, version }) => {
      const error = makeGitProcessError({ command: "git", args: ["--unknown-option"], exitCode: 129, stderr: "unknown option" });
      const run = failedCall(variant, error, async () => `git version ${version}`);
      await expect(run()).rejects.toThrow(`Git ${version} is below the required Git 2.53. Upgrade Git and retry.`);
    });
});

describe("Git floor diagnostic boundaries", () => {
  it.each(["plain", "stdin", "raw"].flatMap((variant) => [
    { variant, label: "Git 2.53", probe: async (): Promise<string> => "git version 2.53.0" },
    { variant, label: "a later major", probe: async (): Promise<string> => "git version 3.0.0" },
    { variant, label: "unrecognized output", probe: async (): Promise<string> => "unrecognized version output" },
    { variant, label: "a failed probe", probe: async (): Promise<string> => { throw new Error("version invocation failed"); } },
  ]))("keeps the $variant failure with $label", async ({ variant, probe }) => {
    const error = makeGitProcessError({ command: "git", args: ["--unknown-option"], exitCode: 129, stderr: "original Git diagnostic" });
    await expect(failedCall(variant, error, probe)()).rejects.toBe(error);
  });

  it.each(["plain", "stdin", "raw"])("does not probe a successful %s invocation", async (variant) => {
    const probe = async (): Promise<string> => "git version 2.45.0";
    if (variant === "plain") {
      const result = { stdout: "success\n", stderr: "diagnostic\n" };
      const exec: GitExec = async () => result;
      await expect(withGitVersionFloor(exec, probe)("git", ["status"])).resolves.toBe(result);
    } else if (variant === "stdin") {
      const exec: GitExecInput = async () => "object-id\n";
      await expect(withGitVersionFloor(exec, probe)(["hash-object", "--stdin"], "payload")).resolves.toBe("object-id\n");
    } else {
      const result = { stdout: Buffer.from([0, 255, 10]), stderr: Buffer.from("diagnostic\n") };
      const exec: RawGitExec = async () => result;
      await expect(withGitVersionFloor(exec, probe)(["cat-file", "--batch"])).resolves.toBe(result);
    }
  });

  it.each(["plain", "stdin", "raw"].flatMap((variant) => [
    { variant, label: "nonzero", evidence: { exitCode: 128, stderr: "missing remote" } },
    { variant, label: "canceled", evidence: { exitCode: 129, isCanceled: true as const } },
    { variant, label: "timed out", evidence: { exitCode: 129, timedOut: true as const } },
  ]))("keeps a $label $variant failure without consulting an old version", async ({ variant, evidence }) => {
    const error = makeGitProcessError({ command: "git", args: ["fetch", "origin"], ...evidence });
    await expect(failedCall(variant, error, async () => "git version 2.45.0")()).rejects.toBe(error);
  });
});

it("diagnoses the same executable that failed", async () => {
  const args = ["--unknown-option"];
  const { exec } = scriptGitExec([
    { command: "/old/toolchain/git", match: args, responses: [{ failure: { exitCode: 129, stderr: "unknown option" } }] },
    { command: "/old/toolchain/git", match: ["--version"], responses: [{ stdout: "git version 2.45.0" }] },
  ]);
  const wrapped = withGitVersionFloor(exec, async (command, _args, options?: GitExecOptions): Promise<string> => {
    return (await exec(command, ["--version"], options)).stdout;
  });
  await expect(wrapped("/old/toolchain/git", args)).rejects.toThrow(/Git 2\.45\.0.*Git 2\.53/u);
});

type Answer = string | Error | Promise<string>;
type Kind = "plain" | "stdin" | "raw";

/** Executors answering `--version` with each kind's queued answers in turn, recording every other call. */
function versionedExecutors(answers: Answer[] | Partial<Record<Kind, Answer[]>>) {
  const queues: Record<Kind, Answer[]> = Array.isArray(answers)
    ? { plain: answers, stdin: answers, raw: answers }
    : { plain: answers.plain ?? [""], stdin: answers.stdin ?? [""], raw: answers.raw ?? [""] };
  const probes: Record<Kind, number> = { plain: 0, stdin: 0, raw: 0 };
  const answer = (kind: Kind): string | Promise<string> => {
    const queue = queues[kind];
    const next = queue[Math.min(probes[kind]++, queue.length - 1)];
    if (next instanceof Error) throw next;
    return next ?? "";
  };
  const calls: string[] = [];
  const exec: GitExec = async (command, args) => {
    if (args[0] === "--version") return { stdout: await answer("plain"), stderr: "" };
    calls.push(`${command} ${args.join(" ")}`);
    return { stdout: "ran\n", stderr: "" };
  };
  const execInput: GitExecInput = async (args) => {
    if (args[0] === "--version") return await answer("stdin");
    calls.push(`stdin ${args.join(" ")}`);
    return "ran\n";
  };
  const rawExec: RawGitExec = async (args) => {
    if (args[0] === "--version") return { stdout: Buffer.from(await answer("raw")), stderr: Buffer.alloc(0) };
    calls.push(`raw ${args.join(" ")}`);
    return { stdout: Buffer.from("ran"), stderr: Buffer.alloc(0) };
  };
  return { executors: { exec, execInput, rawExec }, calls, probes };
}

function runVariant(
  executors: { exec: GitExec; execInput: GitExecInput; rawExec: RawGitExec }, variant: string, signal?: AbortSignal,
): Promise<unknown> {
  if (variant === "plain") return executors.exec("git", ["status"], { signal });
  if (variant === "stdin") return executors.execInput(["hash-object", "--stdin"], "payload", { signal });
  return executors.rawExec(["cat-file", "--batch"], { signal });
}

describe("up-front Git floor gate", () => {
  it.each(["plain", "stdin", "raw"].flatMap((variant) => ["2.47.3", "2.51.0", "2.52.0"].map((version) => ({ variant, version }))))(
    "refuses Git $version before the $variant call runs", async ({ variant, version }) => {
      const fake = versionedExecutors([`git version ${version}\n`]);
      const gated = gateGitExecutors(createGitFloorGate(), fake.executors);
      await expect(runVariant(gated, variant)).rejects.toThrow(`Git ${version} is below the required Git 2.53. Upgrade Git and retry.`);
      expect(fake.calls).toEqual([]);
    });

  it.each(["plain", "stdin", "raw"].flatMap((variant) => ["2.53.0", "2.55.0.windows.1", "3.0.0"].map((version) => ({ variant, version }))))(
    "runs the $variant call on Git $version", async ({ variant, version }) => {
      const fake = versionedExecutors([`git version ${version}\n`]);
      await expect(runVariant(gateGitExecutors(createGitFloorGate(), fake.executors), variant)).resolves.toBeDefined();
      expect(fake.calls).toHaveLength(1);
    });

  it("probes each executor once across calls and concurrent first calls", async () => {
    const fake = versionedExecutors(["git version 2.53.0"]);
    const gated = gateGitExecutors(createGitFloorGate(), fake.executors);
    await Promise.all(["plain", "stdin", "raw", "plain", "raw", "stdin"].map((variant) => runVariant(gated, variant)));
    await Promise.all(["plain", "stdin", "raw"].map((variant) => runVariant(gated, variant)));
    expect(fake.probes).toEqual({ plain: 1, stdin: 1, raw: 1 });
    expect(fake.calls).toHaveLength(9);
  });

  it("checks each executor against the Git it runs", async () => {
    const fake = versionedExecutors({ plain: ["git version 2.52.0"], stdin: ["git version 2.55.0"], raw: ["git version 2.55.0"] });
    const gated = gateGitExecutors(createGitFloorGate(), fake.executors);
    await expect(runVariant(gated, "raw")).resolves.toBeDefined();
    await expect(runVariant(gated, "stdin")).resolves.toBeDefined();
    await expect(runVariant(gated, "plain")).rejects.toThrow(/Git 2\.52\.0/u);
    expect(fake.calls).toEqual(["raw cat-file --batch", "stdin hash-object --stdin"]);
  });

  it("repeats a refusal without probing again", async () => {
    const fake = versionedExecutors(["git version 2.52.0", "git version 2.53.0"]);
    const gated = gateGitExecutors(createGitFloorGate(), fake.executors);
    for (const variant of ["raw", "plain", "stdin", "raw", "plain", "stdin"]) {
      await expect(runVariant(gated, variant)).rejects.toThrow(/Git 2\.52\.0/u);
    }
    expect(fake.probes).toEqual({ plain: 1, stdin: 1, raw: 1 });
    expect(fake.calls).toEqual([]);
  });

  it("keeps an unreadable answer and runs every call", async () => {
    const fake = versionedExecutors(["unrecognized version output", "git version 2.52.0"]);
    const gated = gateGitExecutors(createGitFloorGate(), fake.executors);
    for (const variant of ["plain", "plain", "raw", "raw"]) await runVariant(gated, variant);
    expect(fake.probes).toEqual({ plain: 1, stdin: 0, raw: 1 });
    expect(fake.calls).toHaveLength(4);
  });

  it("runs the call when the probe fails, then probes again and refuses once it answers", async () => {
    const fake = versionedExecutors([new Error("version invocation failed"), "git version 2.52.0"]);
    const gated = gateGitExecutors(createGitFloorGate(), fake.executors);
    await expect(runVariant(gated, "plain")).resolves.toBeDefined();
    await expect(runVariant(gated, "plain")).rejects.toThrow(/Git 2\.52\.0/u);
    expect(fake.probes.plain).toBe(2);
    expect(fake.calls).toEqual(["git status"]);
  });

  it.each(["plain", "stdin", "raw"] as const)(
    "releases a canceled %s call while its first probe stalls, and answers the call still waiting", async (variant) => {
      let finish: (output: string) => void = () => {};
      const fake = versionedExecutors([new Promise<string>((resolve) => { finish = resolve; })]);
      const gated = gateGitExecutors(createGitFloorGate(), fake.executors);
      const controller = new AbortController();
      const canceled = runVariant(gated, variant, controller.signal);
      const waiting = runVariant(gated, variant);
      controller.abort(new Error("sync deadline expired"));
      await expect(canceled).rejects.toMatchObject({ kind: "canceled", isCanceled: true });
      finish("git version 2.55.0\n");
      await expect(waiting).resolves.toBeDefined();
      expect(fake.probes[variant]).toBe(1);
      expect(fake.calls).toHaveLength(1);
    });

  it("refuses an already-canceled call before probing", async () => {
    const fake = versionedExecutors(["git version 2.55.0"]);
    const gated = gateGitExecutors(createGitFloorGate(), fake.executors);
    const controller = new AbortController();
    controller.abort();
    for (const variant of ["plain", "stdin", "raw"]) {
      await expect(runVariant(gated, variant, controller.signal)).rejects.toMatchObject({ kind: "canceled" });
    }
    expect(fake.probes).toEqual({ plain: 0, stdin: 0, raw: 0 });
    expect(fake.calls).toEqual([]);
  });

  it("answers each plain executable separately", async () => {
    const versions = new Map([["/old/toolchain/git", "git version 2.52.0"], ["git", "git version 2.55.0"]]);
    const ran: string[] = [];
    const exec: GitExec = async (command, args) => {
      if (args[0] === "--version") return { stdout: versions.get(command) ?? "", stderr: "" };
      ran.push(command);
      return { stdout: "", stderr: "" };
    };
    const gated = gateGitExecutors(createGitFloorGate(), { exec, execInput: async () => "", rawExec: async () => ({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }) });
    await expect(gated.exec("/old/toolchain/git", ["status"])).rejects.toThrow(/Git 2\.52\.0/u);
    await expect(gated.exec("git", ["status"])).resolves.toBeDefined();
    expect(ran).toEqual(["git"]);
  });
});
