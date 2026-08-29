/** Real-Git coverage for native provider refresh preparation and fork-point recovery. */

import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  deriveDeliveryProviderRefreshSubject,
} from "../../src/lib/delivery/provider-refresh-observation.js";
import { DeliveryStateV1Schema } from "../../src/lib/delivery/schema.js";
import {
  GhDeliveryProviderRefreshPort,
  type GhStackView,
} from "../../src/scripts/delivery/hosts/github-refresh.js";
import {
  DeliveryProviderProcessError,
  type DeliveryProviderProcessRunner,
} from "../../src/scripts/delivery/provider-process.js";
import { deliveryFourMemberStackPlanFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { makeGitExec } from "../helpers/integration.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

async function git(cwd: string, args: readonly string[]): Promise<string> {
  return (await execFileAsync("git", [...args], { cwd })).stdout.trim();
}

async function commitFile(
  repository: string,
  path: string,
  content: string,
  message: string,
): Promise<string> {
  await writeFile(join(repository, path), content, "utf8");
  await git(repository, ["add", path]);
  await git(repository, ["commit", "-m", message]);
  return git(repository, ["rev-parse", "HEAD"]);
}

describe("GitHub provider refresh preparation", () => {
  it("recovers the fork boundary after a contribution-equivalent dependent adoption", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-github-provider-refresh-" });
    roots.push(repository);
    const remoteParent = await mkdtemp(join(tmpdir(), "arc-github-provider-refresh-remote-"));
    roots.push(remoteParent);
    const remote = join(remoteParent, "remote.git");
    await execFileAsync("git", ["init", "--bare", remote]);
    await git(repository, ["remote", "add", "origin", remote]);

    const plan = deliveryFourMemberStackPlanFixture();
    const selectedName = `delivery/example/${plan.members[0]!.chunkKey}`;
    const firstDependentName = `delivery/example/${plan.members[1]!.chunkKey}`;
    const secondDependentName = `delivery/example/${plan.members[2]!.chunkKey}`;
    const topName = "feat/example";

    const base = await commitFile(repository, "base.txt", "base\n", "base");
    await git(repository, ["push", "origin", `${base}:refs/heads/main`]);

    await git(repository, ["switch", "-c", selectedName]);
    const originalSelected = await commitFile(
      repository,
      "selected.txt",
      "selected zero\n",
      "original selected",
    );

    await git(repository, ["switch", "-c", firstDependentName]);
    const firstDependent = await commitFile(
      repository,
      "first-dependent.txt",
      "first dependent\n",
      "first dependent",
    );

    await git(repository, ["switch", "-c", secondDependentName]);
    const secondDependent = await commitFile(
      repository,
      "second-dependent.txt",
      "second dependent\n",
      "second dependent",
    );

    await git(repository, ["switch", "-c", topName]);
    const top = await commitFile(repository, "top.txt", "top\n", "top");

    await git(repository, ["switch", selectedName]);
    const recordedPredecessor = await commitFile(
      repository,
      "selected.txt",
      "selected one\n",
      "first selected correction",
    );
    const selected = await commitFile(
      repository,
      "selected.txt",
      "selected two\n",
      "second selected correction",
    );

    for (const [name, head] of [
      [selectedName, selected],
      [firstDependentName, firstDependent],
      [secondDependentName, secondDependent],
      [topName, top],
    ] as const) {
      await git(repository, ["push", "origin", `${head}:refs/heads/${name}`]);
    }

    const coordinate = async (head: string) => ({
      head,
      tree: await git(repository, ["rev-parse", `${head}^{tree}`]),
    });
    const fixture = deliveryStateFixture(plan);
    const state = DeliveryStateV1Schema.parse({
      ...fixture,
      target: { ref: "refs/heads/main", coordinates: await coordinate(base) },
      members: [
        {
          ...fixture.members[0],
          ref: `refs/heads/${selectedName}`,
          changeRequest: { providerId: "github", changeRequestId: "501" },
          coordinates: { base, ...await coordinate(selected) },
        },
        {
          ...fixture.members[1],
          ref: `refs/heads/${firstDependentName}`,
          changeRequest: { providerId: "github", changeRequestId: "502" },
          coordinates: { base: recordedPredecessor, ...await coordinate(firstDependent) },
        },
        {
          ...fixture.members[2],
          ref: `refs/heads/${secondDependentName}`,
          changeRequest: { providerId: "github", changeRequestId: "503" },
          coordinates: { base: firstDependent, ...await coordinate(secondDependent) },
        },
        {
          ...fixture.members[3],
          ref: `refs/heads/${topName}`,
          changeRequest: { providerId: "github", changeRequestId: "504" },
          coordinates: { base: secondDependent, ...await coordinate(top) },
        },
      ],
    });
    const derived = deriveDeliveryProviderRefreshSubject({
      plan,
      state,
      facts: { target: state.target, members: state.members, landedDeliverableIds: [] },
    });
    if (derived.status !== "derived") throw new Error("refresh subject must derive");
    const before = derived.subject.before;

    let rebased = false;
    let observedForkPoint: string | null = null;
    const branchNames = [selectedName, firstDependentName, secondDependentName] as const;
    const view = async (cwd: string): Promise<GhStackView> => {
      const heads = await Promise.all(branchNames.map(async (name) => git(cwd, ["rev-parse", name])));
      return {
        trunk: "main",
        currentBranch: selectedName,
        branches: branchNames.map((name, index) => ({
          name,
          head: heads[index]!,
          base: index === 0 ? base : heads[index - 1]!,
          isCurrent: index === 0,
          isMerged: false,
          isQueued: false,
          needsRebase: !rebased && index > 0,
          pr: {
            number: 501 + index,
            url: `https://github.com/owner/repo/pull/${501 + index}`,
            state: "OPEN",
          },
        })),
      };
    };
    const gh: DeliveryProviderProcessRunner = {
      run: async (args, options) => {
        const cwd = options?.cwd;
        if (cwd === undefined) throw new Error("provider cwd is required");
        if (args[1] === "--version") return { stdout: "gh-stack 0.1.0\n", stderr: "" };
        if (args[1] === "checkout") {
          await git(cwd, ["config", "user.email", "test@test.com"]);
          await git(cwd, ["config", "user.name", "Test User"]);
          for (const name of ["main", ...branchNames]) {
            await git(cwd, [
              "update-ref",
              `refs/heads/${name}`,
              `refs/remotes/origin/${name}`,
            ]);
          }
          return { stdout: "", stderr: "" };
        }
        if (args[1] === "view") {
          return { stdout: JSON.stringify(await view(cwd)), stderr: "" };
        }
        if (args[1] === "rebase") {
          try {
            observedForkPoint = await git(cwd, [
              "merge-base",
              "--fork-point",
              selectedName,
              firstDependentName,
            ]);
            const oldFirstDependent = await git(cwd, ["rev-parse", firstDependentName]);
            await git(cwd, ["switch", firstDependentName]);
            await git(cwd, ["rebase", "--onto", selectedName, observedForkPoint, firstDependentName]);
            const refreshedFirstDependent = await git(cwd, ["rev-parse", firstDependentName]);
            await git(cwd, ["switch", secondDependentName]);
            await git(cwd, [
              "rebase",
              "--onto",
              refreshedFirstDependent,
              oldFirstDependent,
              secondDependentName,
            ]);
            rebased = true;
            return { stdout: "", stderr: "" };
          } catch (error) {
            throw new DeliveryProviderProcessError("provider rebase failed", {
              stdout: "",
              stderr: error instanceof Error ? error.message : String(error),
              exitCode: 1,
            });
          }
        }
        throw new Error(`unexpected provider invocation: ${args.join(" ")}`);
      },
    };
    const port = new GhDeliveryProviderRefreshPort({
      git: makeGitExec(repository),
      gh,
      nativeStack: { observe: async () => ({ status: "registered", stackNumber: 558 }) },
      checkoutPath: repository,
      remote: "origin",
    });

    const result = await port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "dependent-suffix", selectedDeliverableId: plan.members[0]!.deliverableId },
      before,
    });
    if (result.status === "refused") {
      throw new Error(`${result.reason}: ${result.detail ?? "no detail"}`);
    }

    expect(result).toMatchObject({
      status: "prepared",
      candidates: [
        { deliverableId: plan.members[1]!.deliverableId },
        { deliverableId: plan.members[2]!.deliverableId },
      ],
    });
    expect(observedForkPoint).toBe(originalSelected);
    expect(await git(repository, ["ls-remote", "--refs", "origin", `refs/heads/${firstDependentName}`]))
      .toContain(firstDependent);
    expect(await git(repository, ["ls-remote", "--refs", "origin", `refs/heads/${secondDependentName}`]))
      .toContain(secondDependent);
  });
});
