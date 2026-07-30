/** Exact branch-generation reads and the teardown a replay must settle. */

import { describe, expect, it } from "vitest";

import {
  readExactBranchGeneration,
  tearDownExactBranchGeneration,
} from "../../../src/lib/errand/exact-branch-generation.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const BRANCH = "chore/groom-alpha";
const HEAD = "a".repeat(40);
const MOVED = "b".repeat(40);
const OPTIONS = {
  branch: BRANCH,
  subject: "grooming",
  temporaryRefNamespace: "refs/arc/tmp/groom-settle",
} as const;

interface Sides {
  local: string | null;
  remote: string | null;
  /** When true the local ref cannot be read, so its absence is never proven. */
  localReadFails?: boolean;
  /** When false the remote cannot be read, so its absence is never proven. */
  remoteReachable?: boolean;
  /** When true the leased remote delete is refused as stale. */
  staleLease?: boolean;
}

function gitFailure(exitCode: number, stderr: string): Error {
  return Object.assign(new Error(stderr), { exitCode, stderr });
}

/** A repository whose two sides of one branch are directly observable. */
function makeExec(sides: Sides): { exec: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  const temporary = new Map<string, string>();
  const exec: GitExec = async (_command, args) => {
    calls.push([...args]);
    const [subcommand] = args;
    if (subcommand === "fetch") {
      const destination = (args.at(3) ?? "").split(":").at(1) ?? "";
      if (sides.remoteReachable === false) {
        throw gitFailure(128, "fatal: unable to access 'origin': connection refused");
      }
      if (sides.remote === null) throw gitFailure(128, `fatal: couldn't find remote ref refs/heads/${BRANCH}`);
      temporary.set(destination, sides.remote);
      return { stdout: "" };
    }
    if (subcommand === "rev-parse") {
      const ref = (args.at(3) ?? "").replace("^{commit}", "");
      if (ref === `refs/heads/${BRANCH}` && sides.localReadFails === true) {
        throw gitFailure(128, "fatal: unable to read the local ref");
      }
      const oid = ref === `refs/heads/${BRANCH}` ? sides.local : temporary.get(ref) ?? null;
      if (oid === null) throw gitFailure(1, "");
      return { stdout: `${oid}\n` };
    }
    if (subcommand === "update-ref") {
      const ref = args.at(2) ?? "";
      if (ref === `refs/heads/${BRANCH}`) sides.local = null;
      else temporary.delete(ref);
      return { stdout: "" };
    }
    if (subcommand === "push") {
      if (sides.staleLease === true) throw gitFailure(1, "! [rejected] (delete) -> chore (stale info)");
      sides.remote = null;
      return { stdout: "" };
    }
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  };
  return { exec, calls };
}

function tearDown(sides: Sides): ReturnType<typeof makeExec> & {
  result: Promise<Awaited<ReturnType<typeof tearDownExactBranchGeneration>>>;
} {
  const boundary = makeExec(sides);
  return { ...boundary, result: tearDownExactBranchGeneration(boundary.exec, { ...OPTIONS, expectedHead: HEAD }) };
}

describe("tearDownExactBranchGeneration", () => {
  it("deletes both sides of the proven generation", async () => {
    const sides: Sides = { local: HEAD, remote: HEAD };
    const boundary = tearDown(sides);

    await expect(boundary.result).resolves.toEqual({ kind: "applied" });
    expect(sides).toMatchObject({ local: null, remote: null });
    expect(boundary.calls).toContainEqual([
      "push", "origin", `--force-with-lease=refs/heads/${BRANCH}:${HEAD}`, `:refs/heads/${BRANCH}`,
    ]);
    expect(boundary.calls).toContainEqual(["update-ref", "-d", `refs/heads/${BRANCH}`, HEAD]);
  });

  it("settles the local side when a prior pass already deleted the remote", async () => {
    const sides: Sides = { local: HEAD, remote: null };
    const boundary = tearDown(sides);

    await expect(boundary.result).resolves.toEqual({ kind: "applied" });
    expect(sides.local).toBeNull();
    expect(boundary.calls.some(([subcommand]) => subcommand === "push")).toBe(false);
  });

  it("settles idempotently when a prior pass already deleted both sides", async () => {
    const boundary = tearDown({ local: null, remote: null });

    await expect(boundary.result).resolves.toEqual({ kind: "idempotent" });
    expect(boundary.calls.some(([subcommand]) => subcommand === "push")).toBe(false);
    expect(boundary.calls).not.toContainEqual(["update-ref", "-d", `refs/heads/${BRANCH}`, HEAD]);
  });

  it("reports a fatal local-ref read instead of treating it as absence", async () => {
    const boundary = tearDown({ local: null, remote: null, localReadFails: true });

    await expect(boundary.result).resolves.toMatchObject({
      kind: "error",
      message: expect.stringContaining("fatal: unable to read the local ref"),
    });
  });

  it("refuses a local head that moved off the proven generation", async () => {
    await expect(tearDown({ local: MOVED, remote: HEAD }).result)
      .resolves.toEqual({ kind: "refused", message: "Local grooming head moved." });
  });

  it("refuses a remote head that moved off the proven generation", async () => {
    const sides: Sides = { local: HEAD, remote: MOVED };
    const boundary = tearDown(sides);

    await expect(boundary.result).resolves.toEqual({ kind: "refused", message: "Remote grooming head moved." });
    expect(sides.local).toBe(HEAD);
  });

  it("refuses a remote head that moved between the read and the leased delete", async () => {
    await expect(tearDown({ local: HEAD, remote: HEAD, staleLease: true }).result)
      .resolves.toEqual({ kind: "refused", message: "Remote grooming head moved." });
  });

  it("treats an unreachable remote as unproven rather than as an absent ref", async () => {
    const sides: Sides = { local: HEAD, remote: HEAD, remoteReachable: false };

    await expect(tearDown(sides).result).resolves.toMatchObject({ kind: "error" });
    expect(sides).toMatchObject({ local: HEAD, remote: HEAD });
  });
});

describe("readExactBranchGeneration", () => {
  it("reads the one head both sides carry", async () => {
    const { exec } = makeExec({ local: HEAD, remote: HEAD });

    await expect(readExactBranchGeneration(exec, OPTIONS)).resolves.toEqual({ kind: "exact", head: HEAD });
  });

  it("proves the generation absent once both sides are gone", async () => {
    const { exec } = makeExec({ local: null, remote: null });

    await expect(readExactBranchGeneration(exec, OPTIONS)).resolves.toEqual({ kind: "absent" });
  });

  it("still names the generation when a prior teardown pass deleted only the remote", async () => {
    const { exec } = makeExec({ local: HEAD, remote: null });

    await expect(readExactBranchGeneration(exec, OPTIONS)).resolves.toEqual({ kind: "exact", head: HEAD });
  });

  it("leaves a standing remote head over an absent local branch unproven", async () => {
    const { exec } = makeExec({ local: null, remote: HEAD });

    await expect(readExactBranchGeneration(exec, OPTIONS)).resolves.toEqual({
      kind: "unproven",
      message: "Local grooming branch is absent while its remote head stands.",
    });
  });

  it("leaves differing heads unproven", async () => {
    const { exec } = makeExec({ local: HEAD, remote: MOVED });

    await expect(readExactBranchGeneration(exec, OPTIONS))
      .resolves.toEqual({ kind: "unproven", message: "Local and remote grooming heads differ." });
  });

  it("leaves an unreachable remote unproven rather than absent", async () => {
    const { exec } = makeExec({ local: null, remote: null, remoteReachable: false });

    await expect(readExactBranchGeneration(exec, OPTIONS)).resolves.toMatchObject({ kind: "unproven" });
  });
});
