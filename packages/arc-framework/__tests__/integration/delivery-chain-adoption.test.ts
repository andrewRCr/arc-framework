import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { RawGitExec } from "../../src/lib/change-facts.js";
import { adoptGitDeliveryChain } from "../../src/lib/delivery/chain-adoption.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

describe("delivery chain ancestry adoption", () => {
  it("accepts a final candidate that legitimately edits an earlier member path", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-adopt-overlap-" });
    roots.push(repository);
    const git = async (args: string[]): Promise<string> => (
      await execFileAsync("git", args, { cwd: repository })
    ).stdout.trim();
    await writeFile(join(repository, "shared.txt"), "base\n", "utf8");
    await git(["add", "shared.txt"]);
    await git(["commit", "-m", "base"]);
    const base = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "member"]);
    await writeFile(join(repository, "shared.txt"), "member\n", "utf8");
    await git(["add", "shared.txt"]);
    await git(["commit", "-m", "member"]);
    const member = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "final-candidate"]);
    await writeFile(join(repository, "shared.txt"), "terminal\n", "utf8");
    await git(["add", "shared.txt"]);
    await git(["commit", "-m", "terminal"]);
    const finalCandidate = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "feat/example", base]);
    await writeFile(join(repository, "shared.txt"), "terminal\n", "utf8");
    await git(["add", "shared.txt"]);
    await git(["commit", "-m", "top"]);
    const originalTop = await git(["rev-parse", "HEAD"]);
    const coordinate = async (head: string) => ({ head, tree: await git(["rev-parse", `${head}^{tree}`]) });
    const exec: RawGitExec = async (args) => {
      const result = await execFileAsync("git", args, { cwd: repository, encoding: "buffer" });
      return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
    };

    const adopted = await adoptGitDeliveryChain({
      exec,
      topRef: "refs/heads/feat/example",
      commonBase: await coordinate(base),
      highestMember: await coordinate(member),
      finalCandidate: await coordinate(finalCandidate),
      lifecyclePaths: [],
      top: await coordinate(originalTop),
    });

    expect(adopted.status).toBe("adopted");
    if (adopted.status !== "adopted") return;
    expect(adopted.tree).toBe((await coordinate(originalTop)).tree);
    expect((await git(["rev-list", "--parents", "-n", "1", adopted.head])).split(" "))
      .toEqual([adopted.head, originalTop, member]);
  });

  it("keeps the top tree and ref while appending each contained member as ancestry", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-adopt-" });
    roots.push(repository);
    const git = async (args: string[]): Promise<string> => (
      await execFileAsync("git", args, { cwd: repository })
    ).stdout.trim();
    await writeFile(join(repository, "base.txt"), "base\n", "utf8");
    await git(["add", "base.txt"]);
    await git(["commit", "-m", "base"]);
    const base = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "member-one"]);
    await writeFile(join(repository, "member.txt"), "member\n", "utf8");
    await git(["add", "member.txt"]);
    await git(["commit", "-m", "member one"]);
    const memberOne = await git(["rev-parse", "HEAD"]);
    await git(["switch", "-c", "member-two"]);
    await writeFile(join(repository, "second.txt"), "second\n", "utf8");
    await git(["add", "second.txt"]);
    await git(["commit", "-m", "member two"]);
    const memberTwo = await git(["rev-parse", "HEAD"]);
    await git(["switch", "-c", "complete-candidate"]);
    await writeFile(join(repository, "residual.txt"), "residual\n", "utf8");
    await git(["add", "residual.txt"]);
    await git(["commit", "-m", "complete candidate"]);
    const completeCandidate = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "feat/example", base]);
    await writeFile(join(repository, "member.txt"), "member\n", "utf8");
    await writeFile(join(repository, "second.txt"), "second\n", "utf8");
    await writeFile(join(repository, "residual.txt"), "residual\n", "utf8");
    await git(["add", "member.txt", "second.txt", "residual.txt"]);
    await git(["commit", "-m", "top"]);
    const originalTop = await git(["rev-parse", "HEAD"]);
    const coordinate = async (head: string) => ({ head, tree: await git(["rev-parse", `${head}^{tree}`]) });
    const calls: string[][] = [];
    const exec: RawGitExec = async (args) => {
      calls.push(args);
      const result = await execFileAsync("git", args, { cwd: repository, encoding: "buffer" });
      return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
    };
    const topRef = "refs/heads/feat/example";
    const first = await adoptGitDeliveryChain({
      exec,
      topRef,
      commonBase: await coordinate(base),
      highestMember: await coordinate(memberOne),
      finalCandidate: await coordinate(completeCandidate),
      lifecyclePaths: [],
      top: await coordinate(originalTop),
    });
    expect(first.status).toBe("adopted");
    if (first.status !== "adopted") return;
    expect(first.tree).toBe((await coordinate(originalTop)).tree);
    expect((await git(["rev-list", "--parents", "-n", "1", first.head])).split(" "))
      .toEqual([first.head, originalTop, memberOne]);
    expect((await git(["diff", "--name-only", memberOne, first.head])).split("\n").filter(Boolean))
      .toEqual(["residual.txt", "second.txt"]);

    const commitTreeCalls = calls.filter((args) => args[0] === "commit-tree").length;
    const retried = await adoptGitDeliveryChain({
      exec,
      topRef,
      commonBase: await coordinate(base),
      highestMember: await coordinate(memberOne),
      finalCandidate: await coordinate(completeCandidate),
      lifecyclePaths: [],
      top: { head: first.head, tree: first.tree },
    });
    expect(retried).toEqual({ status: "adopted", head: first.head, tree: first.tree });
    expect(await git(["rev-parse", topRef])).toBe(first.head);
    expect(calls.filter((args) => args[0] === "commit-tree")).toHaveLength(commitTreeCalls);

    const second = await adoptGitDeliveryChain({
      exec,
      topRef,
      commonBase: await coordinate(memberOne),
      highestMember: await coordinate(memberTwo),
      finalCandidate: await coordinate(completeCandidate),
      lifecyclePaths: [],
      top: { head: first.head, tree: first.tree },
    });
    expect(second.status).toBe("adopted");
    if (second.status !== "adopted") return;
    expect(await git(["rev-parse", topRef])).toBe(second.head);
    expect(second.tree).toBe(first.tree);
    expect((await git(["rev-list", "--parents", "-n", "1", second.head])).split(" "))
      .toEqual([second.head, first.head, memberTwo]);
    expect(calls.some((args) => args.includes("--force") || args.includes("--force-with-lease"))).toBe(false);

    await git(["switch", "-c", "member-three", completeCandidate]);
    await writeFile(join(repository, "missing.txt"), "missing\n", "utf8");
    await git(["add", "missing.txt"]);
    await git(["commit", "-m", "member three"]);
    const memberThree = await git(["rev-parse", "HEAD"]);
    await expect(adoptGitDeliveryChain({
      exec,
      topRef,
      commonBase: await coordinate(memberTwo),
      highestMember: await coordinate(memberThree),
      finalCandidate: await coordinate(memberThree),
      lifecyclePaths: [],
      top: { head: second.head, tree: second.tree },
    })).resolves.toEqual({
      status: "refused",
      reason: "containment-diverged",
      paths: ["missing.txt"],
    });
    expect(await git(["rev-parse", topRef])).toBe(second.head);

    const fabricated = await git([
      "commit-tree", second.tree,
      "-p", originalTop,
      "-p", memberTwo,
      "-m", "fabricated wrong-parent adoption",
    ]);
    await git(["update-ref", topRef, fabricated, second.head]);
    await expect(adoptGitDeliveryChain({
      exec,
      topRef,
      commonBase: await coordinate(memberOne),
      highestMember: await coordinate(memberTwo),
      finalCandidate: await coordinate(completeCandidate),
      lifecyclePaths: [],
      top: { head: second.head, tree: second.tree },
    })).resolves.toEqual({
      status: "refused",
      reason: "top-moved",
    });
    expect(await git(["rev-parse", topRef])).toBe(fabricated);

    await expect(adoptGitDeliveryChain({
      exec,
      topRef,
      commonBase: await coordinate(base),
      highestMember: await coordinate(memberOne),
      finalCandidate: await coordinate(completeCandidate),
      lifecyclePaths: [],
      top: await coordinate(originalTop),
    })).resolves.toEqual({ status: "refused", reason: "top-moved" });
    expect(await git(["rev-parse", topRef])).toBe(fabricated);
  });
});
