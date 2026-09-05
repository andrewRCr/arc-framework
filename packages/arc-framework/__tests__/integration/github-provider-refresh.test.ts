/** Real-Git coverage for native provider refresh preparation and fork-point recovery. */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  deriveDeliveryProviderRefreshSubject,
} from "../../src/lib/delivery/provider-refresh-observation.js";
import { createRawGitExec } from "../../src/lib/change-facts.js";
import {
  proveGitDeliveryProviderRefreshContribution,
} from "../../src/lib/delivery/git-contribution-proof.js";
import { DeliveryStateV1Schema } from "../../src/lib/delivery/schema.js";
import {
  changedDeliveryProviderRefreshMovements,
  selectDeliveryProviderRefreshProofMovements,
} from "../../src/lib/delivery/suffix-reconciliation.js";
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
    const movements = changedDeliveryProviderRefreshMovements(before, result.observation);
    const dependentMovements = movements === null
      ? null
      : selectDeliveryProviderRefreshProofMovements(
          result.observation.snapshot,
          movements,
          plan.members[0]!.deliverableId,
        );
    const firstMovement = dependentMovements?.[0];
    const beforeMember = firstMovement?.before.coordinates;
    const afterMember = firstMovement?.after.coordinates;
    if (firstMovement === undefined || beforeMember === null || beforeMember === undefined
      || afterMember === null || afterMember === undefined) {
      throw new Error("first dependent movement must be available");
    }
    const proof = await proveGitDeliveryProviderRefreshContribution({
      exec: createRawGitExec(repository),
      before: {
        predecessor: await coordinate(beforeMember.base),
        member: { head: beforeMember.head, tree: beforeMember.tree },
      },
      after: {
        predecessor: await coordinate(afterMember.base),
        member: { head: afterMember.head, tree: afterMember.tree },
      },
    });
    expect(proof).toEqual({ status: "accepted", proof: "mechanical-reapply" });
    expect(await git(repository, ["ls-remote", "--refs", "origin", `refs/heads/${firstDependentName}`]))
      .toContain(firstDependent);
    expect(await git(repository, ["ls-remote", "--refs", "origin", `refs/heads/${secondDependentName}`]))
      .toContain(secondDependent);
  });

  it("absorbs a provider history collision when the exact natural merge is clean", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-github-provider-refresh-collision-" });
    roots.push(repository);
    const remoteParent = await mkdtemp(join(tmpdir(), "arc-github-provider-refresh-collision-remote-"));
    roots.push(remoteParent);
    const remote = join(remoteParent, "remote.git");
    await execFileAsync("git", ["init", "--bare", remote]);
    await git(repository, ["remote", "add", "origin", remote]);

    const plan = deliveryFourMemberStackPlanFixture();
    const selectedName = `delivery/example/${plan.members[0]!.chunkKey}`;
    const firstDependentName = `delivery/example/${plan.members[1]!.chunkKey}`;
    const secondDependentName = `delivery/example/${plan.members[2]!.chunkKey}`;
    const duplicateName = "duplicate/first-dependent";
    const topName = "feat/example";

    const base = await commitFile(repository, "base.txt", "base\n", "base");
    await git(repository, ["push", "origin", `${base}:refs/heads/main`]);
    await git(repository, ["switch", "-c", selectedName]);
    const originalSelected = await commitFile(repository, "selected.txt", "selected zero\n", "original selected");
    await git(repository, ["switch", "-c", firstDependentName]);
    const firstDependent = await commitFile(
      repository,
      "first-dependent.txt",
      "first dependent\n",
      "first dependent",
    );
    await git(repository, ["switch", "-c", secondDependentName]);
    await commitFile(repository, "second-dependent.txt", "second dependent\n", "second dependent");
    await git(repository, ["switch", "-c", duplicateName, base]);
    await commitFile(repository, "first-dependent.txt", "duplicate first dependent\n", "duplicate first dependent");
    await git(repository, ["switch", secondDependentName]);
    await expect(execFileAsync(
      "git",
      ["merge", "--no-ff", duplicateName, "-m", "duplicate union"],
      { cwd: repository },
    )).rejects.toBeDefined();
    await writeFile(join(repository, "first-dependent.txt"), "first dependent\n", "utf8");
    await git(repository, ["add", "first-dependent.txt"]);
    await git(repository, ["commit", "-m", "duplicate union"]);
    const secondDependent = await git(repository, ["rev-parse", "HEAD"]);
    await git(repository, ["switch", "-c", topName]);
    const top = await commitFile(repository, "top.txt", "top\n", "top");
    await git(repository, ["switch", selectedName]);
    const selected = await commitFile(repository, "selected.txt", "selected one\n", "selected correction");

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
          changeRequest: { providerId: "github", changeRequestId: "601" },
          coordinates: { base, ...await coordinate(selected) },
        },
        {
          ...fixture.members[1],
          ref: `refs/heads/${firstDependentName}`,
          changeRequest: { providerId: "github", changeRequestId: "602" },
          coordinates: { base: originalSelected, ...await coordinate(firstDependent) },
        },
        {
          ...fixture.members[2],
          ref: `refs/heads/${secondDependentName}`,
          changeRequest: { providerId: "github", changeRequestId: "603" },
          coordinates: { base: firstDependent, ...await coordinate(secondDependent) },
        },
        {
          ...fixture.members[3],
          ref: `refs/heads/${topName}`,
          changeRequest: { providerId: "github", changeRequestId: "604" },
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
    const branchNames = [selectedName, firstDependentName, secondDependentName] as const;
    const remoteHeads = [selected, firstDependent, secondDependent] as const;
    const remoteView = (): GhStackView => ({
      trunk: "main",
      currentBranch: selectedName,
      branches: branchNames.map((name, index) => ({
        name,
        head: remoteHeads[index]!,
        base: index === 0 ? base : remoteHeads[index - 1]!,
        isCurrent: index === 0,
        isMerged: false,
        isQueued: false,
        needsRebase: index > 0,
        pr: {
          number: 601 + index,
          url: `https://github.com/owner/repo/pull/${601 + index}`,
          state: "OPEN",
        },
      })),
    });
    const gh: DeliveryProviderProcessRunner = {
      run: async (args, options) => {
        const cwd = options?.cwd;
        if (cwd === undefined) throw new Error("provider cwd is required");
        if (args[1] === "--version") return { stdout: "gh-stack 0.1.0\n", stderr: "" };
        if (args[1] === "checkout") {
          await git(cwd, ["config", "user.email", "test@test.com"]);
          await git(cwd, ["config", "user.name", "Test User"]);
          for (const name of ["main", ...branchNames]) {
            await git(cwd, ["update-ref", `refs/heads/${name}`, `refs/remotes/origin/${name}`]);
          }
          return { stdout: "", stderr: "" };
        }
        if (args[1] === "view") return { stdout: JSON.stringify(remoteView()), stderr: "" };
        if (args[1] === "rebase") {
          const forkPoint = await git(cwd, ["merge-base", "--fork-point", selectedName, firstDependentName]);
          await git(cwd, ["switch", firstDependentName]);
          await git(cwd, ["rebase", "--onto", selectedName, forkPoint, firstDependentName]);
          const refreshedFirst = await git(cwd, ["rev-parse", firstDependentName]);
          await git(cwd, ["switch", secondDependentName]);
          await expect(execFileAsync(
            "git",
            ["rebase", "--onto", refreshedFirst, firstDependent, secondDependentName],
            { cwd },
          )).rejects.toBeDefined();
          throw new DeliveryProviderProcessError("provider history collision", {
            stdout: "",
            stderr: "conflicted while replaying duplicate history",
            exitCode: 3,
          });
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
    if (result.status === "refused") throw new Error(`${result.reason}: ${result.detail ?? "no detail"}`);

    expect(result).toMatchObject({
      status: "prepared",
      candidates: [
        { deliverableId: plan.members[1]!.deliverableId },
        { deliverableId: plan.members[2]!.deliverableId },
      ],
    });
    const refreshedSecond = result.observation.snapshot.members[2]?.coordinates;
    expect(refreshedSecond?.head).not.toBe(secondDependent);
    expect(await git(repository, ["rev-list", "--parents", "-n", "1", refreshedSecond!.head]))
      .toBe(`${refreshedSecond!.head} ${secondDependent} ${refreshedSecond!.base}`);
    expect(await git(repository, ["ls-remote", "--refs", "origin", `refs/heads/${secondDependentName}`]))
      .toContain(secondDependent);
  });

  it("resumes a provider history conflict from the exact local two-parent resolution", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-github-provider-refresh-resolution-" });
    roots.push(repository);
    const remoteParent = await mkdtemp(join(tmpdir(), "arc-github-provider-refresh-resolution-remote-"));
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
    const originalSelected = await commitFile(repository, "shared.txt", "original\n", "original selected");
    await git(repository, ["switch", "-c", firstDependentName]);
    const firstDependent = await commitFile(
      repository,
      "shared.txt",
      "dependent\n",
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
    const selected = await commitFile(repository, "shared.txt", "selected\n", "selected correction");

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
          changeRequest: { providerId: "github", changeRequestId: "701" },
          coordinates: { base, ...await coordinate(selected) },
        },
        {
          ...fixture.members[1],
          ref: `refs/heads/${firstDependentName}`,
          changeRequest: { providerId: "github", changeRequestId: "702" },
          coordinates: { base: originalSelected, ...await coordinate(firstDependent) },
        },
        {
          ...fixture.members[2],
          ref: `refs/heads/${secondDependentName}`,
          changeRequest: { providerId: "github", changeRequestId: "703" },
          coordinates: { base: firstDependent, ...await coordinate(secondDependent) },
        },
        {
          ...fixture.members[3],
          ref: `refs/heads/${topName}`,
          changeRequest: { providerId: "github", changeRequestId: "704" },
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
    const branchNames = [selectedName, firstDependentName, secondDependentName] as const;
    const remoteHeads = [selected, firstDependent, secondDependent] as const;
    let providerFirstDependentHead = firstDependent;
    const remoteView = (): GhStackView => ({
      trunk: "main",
      currentBranch: selectedName,
      branches: branchNames.map((name, index) => ({
        name,
        head: index === 1 ? providerFirstDependentHead : remoteHeads[index]!,
        base: index === 0
          ? base
          : index === 2 ? providerFirstDependentHead : remoteHeads[index - 1]!,
        isCurrent: index === 0,
        isMerged: false,
        isQueued: false,
        needsRebase: index > 0,
        pr: {
          number: 701 + index,
          url: `https://github.com/owner/repo/pull/${701 + index}`,
          state: "OPEN",
        },
      })),
    });
    const gh: DeliveryProviderProcessRunner = {
      run: async (args, options) => {
        const cwd = options?.cwd;
        if (cwd === undefined) throw new Error("provider cwd is required");
        if (args[1] === "--version") return { stdout: "gh-stack 0.1.0\n", stderr: "" };
        if (args[1] === "checkout") {
          await git(cwd, ["config", "user.email", "test@test.com"]);
          await git(cwd, ["config", "user.name", "Test User"]);
          for (const name of ["main", ...branchNames]) {
            const head = name === "main" ? base : remoteHeads[branchNames.indexOf(name)]!;
            await git(cwd, ["update-ref", `refs/heads/${name}`, head]);
          }
          return { stdout: "", stderr: "" };
        }
        if (args[1] === "view") return { stdout: JSON.stringify(remoteView()), stderr: "" };
        if (args[1] === "rebase") {
          await git(cwd, ["switch", firstDependentName]);
          await expect(execFileAsync(
            "git",
            ["rebase", "--onto", selectedName, originalSelected, firstDependentName],
            { cwd },
          )).rejects.toBeDefined();
          throw new DeliveryProviderProcessError("provider history collision", {
            stdout: "",
            stderr: "conflicted while replaying the first dependent",
            exitCode: 3,
          });
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
    const request = {
      plan,
      repository: "owner/repo",
      scope: { kind: "dependent-suffix" as const, selectedDeliverableId: plan.members[0]!.deliverableId },
      before,
    };

    const conflict = await port.prepare(request);
    expect(conflict).toMatchObject({
      status: "refused",
      reason: "content-conflict",
      paths: ["shared.txt"],
      conflictPreparation: {
        topRef: `refs/heads/${firstDependentName}`,
        logicalMergeBase: originalSelected,
        parents: { top: firstDependent, refreshedPredecessor: selected },
        workspace: { head: firstDependent },
      },
    });
    expect(await git(repository, ["ls-remote", "--refs", "origin", `refs/heads/${firstDependentName}`]))
      .toContain(firstDependent);

    const resolutionWorkspace = conflict.status === "refused"
      && conflict.conflictPreparation !== undefined
      ? conflict.conflictPreparation.workspace?.path ?? null
      : null;
    if (resolutionWorkspace === null) throw new Error("prepared resolution workspace must be returned");
    expect(await git(resolutionWorkspace, ["rev-parse", "HEAD"])).toBe(firstDependent);
    const operatorNote = join(resolutionWorkspace, "operator-note.txt");
    await writeFile(operatorNote, "preserve me\n", "utf8");
    await expect(port.prepare(request)).resolves.toMatchObject({
      status: "refused",
      reason: "conflict-resolution-mismatch",
    });
    expect(await readFile(operatorNote, "utf8")).toBe("preserve me\n");
    await rm(operatorNote);
    await expect(execFileAsync(
      "git",
      ["merge", "--no-ff", selectedName, "-m", "approved conflict resolution"],
      { cwd: resolutionWorkspace },
    )).rejects.toBeDefined();
    await writeFile(join(resolutionWorkspace, "shared.txt"), "dependent\nselected\n", "utf8");
    await git(resolutionWorkspace, ["add", "shared.txt"]);
    await git(resolutionWorkspace, ["commit", "-m", "approved conflict resolution"]);
    const resolution = await git(resolutionWorkspace, ["rev-parse", "HEAD"]);
    expect(await git(resolutionWorkspace, ["rev-list", "--parents", "-n", "1", resolution]))
      .toBe(`${resolution} ${firstDependent} ${selected}`);

    const resumed = await port.prepare(request);
    if (resumed.status === "refused") {
      throw new Error(`${resumed.reason}: ${resumed.detail ?? "no detail"}`);
    }
    expect(resumed).toMatchObject({
      status: "prepared",
      candidates: [
        { deliverableId: plan.members[1]!.deliverableId, head: resolution },
        { deliverableId: plan.members[2]!.deliverableId },
      ],
    });
    expect(await git(repository, ["rev-parse", `refs/heads/${firstDependentName}`])).toBe(resolution);
    expect(await git(repository, ["ls-remote", "--refs", "origin", `refs/heads/${firstDependentName}`]))
      .toContain(firstDependent);

    await git(repository, ["switch", topName]);
    const resolutionTree = await git(repository, ["rev-parse", `${resolution}^{tree}`]);
    const invalidParentSets = [
      [selected, firstDependent],
      [firstDependent, selected, base],
      [firstDependent],
    ] as const;
    for (const parents of invalidParentSets) {
      const args = ["commit-tree", resolutionTree];
      for (const parent of parents) args.push("-p", parent);
      args.push("-m", "invalid conflict resolution");
      const invalid = await git(repository, args);
      await git(repository, ["update-ref", `refs/heads/${firstDependentName}`, invalid]);
      await expect(port.prepare(request)).resolves.toMatchObject({
        status: "refused",
        reason: "conflict-resolution-mismatch",
      });
    }

    await git(repository, ["update-ref", "-d", `refs/heads/${firstDependentName}`]);
    await expect(port.prepare(request)).resolves.toMatchObject({
      status: "refused",
      reason: "conflict-resolution-mismatch",
    });

    await git(repository, ["update-ref", `refs/heads/${firstDependentName}`, firstDependent]);
    await git(repository, ["update-ref", "refs/heads/differently-named-resolution", resolution]);
    await expect(port.prepare(request)).resolves.toMatchObject({
      status: "refused",
      reason: "content-conflict",
    });

    providerFirstDependentHead = resolution;
    await expect(port.prepare(request)).resolves.toEqual({ status: "refused", reason: "scope-mismatch" });
  });
});
