/** Built-CLI coverage for settling and declining a native landing that leaves a remaining suffix. */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  OPERATION_ID,
  installNativeSuffixStack,
  retargetRemoteSuffix,
  seedSubmittedBottomLanding,
  type NativeSuffixStackFixture,
} from "../helpers/delivery-native-suffix-e2e.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcWithStdin } from "./helpers.js";

describe("native delivery suffix settlement", () => {
  let repository: string;

  beforeEach(async () => {
    repository = await createTempRepo("arc-native-suffix-");
    const init = await runArc(["init", "--yes", "--name", "native-suffix"], repository);
    expect(init.exitCode, init.stderr).toBe(0);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(repository);
  });

  const send = async (verb: string, fixture: NativeSuffixStackFixture, request: unknown, mode?: string) => (
    runArcWithStdin(
      ["delivery", "native", verb, "-", "--json"],
      repository,
      `${JSON.stringify(request)}\n`,
      { env: mode === undefined ? fixture.env : { ...fixture.env, ARC_FAKE_GH_MODE: mode } },
    )
  );

  const select = async (fixture: NativeSuffixStackFixture) => {
    const selected = await send("land-select", fixture, {
      planId: fixture.planId,
      repository: "owner/repo",
      remote: "origin",
      mergeAction: "direct",
      explicitAtomic: false,
    });
    expect(selected.exitCode, `${selected.stderr}\n${selected.stdout}`).toBe(0);
    expect(JSON.parse(selected.stdout)).toMatchObject({ status: "selected", arm: "linked-single" });
  };

  const landStatus = async (fixture: NativeSuffixStackFixture, conflictResolution?: unknown) => send(
    "land-status",
    fixture,
    {
      planId: fixture.planId,
      request: {
        repository: "owner/repo",
        topChangeRequestId: fixture.bottom.changeRequestId,
        topHeadSha: fixture.bottom.headSha,
        mergeAction: "direct_merge",
        mergeMethod: "merge",
      },
      remote: "origin",
      ...(conflictResolution === undefined ? {} : { conflictResolution }),
    },
    "settled",
  );

  /** Merge the refreshed predecessor into the checked-out terminal top the way the disclosure directs. */
  const handMergeTerminalTop = async (fixture: NativeSuffixStackFixture, refreshedPredecessor: string) => {
    await git(repository, ["checkout", fixture.terminalRef.replace(/^refs\/heads\//u, "")]);
    await expect(git(repository, ["merge", refreshedPredecessor])).rejects.toThrow();
    await writeFile(join(repository, "shared.txt"), "the hand merge owns this line\n");
    await git(repository, ["add", "shared.txt"]);
    await git(repository, ["commit", "--no-edit"]);
    return git(repository, ["rev-parse", "HEAD"]);
  };

  const landRelease = async (fixture: NativeSuffixStackFixture) => send("land-release", fixture, {
    planId: fixture.planId,
    repository: "owner/repo",
    remote: "origin",
    operationId: OPERATION_ID,
  }, "settled");

  it("lands the bottom member alone and reaches suffix settlement", async () => {
    const fixture = await installNativeSuffixStack(repository);
    await select(fixture);
    await seedSubmittedBottomLanding(fixture);
    await retargetRemoteSuffix(fixture);

    const settled = await landStatus(fixture);
    expect(settled.exitCode, `${settled.stderr}\n${settled.stdout}`).toBe(0);
    expect(JSON.parse(settled.stdout)).toMatchObject({
      status: "applied",
      state: {
        value: {
          activeOperation: null,
          target: { coordinates: { head: fixture.landedTargetHead } },
        },
      },
    });

    // The settlement moved the local refs the host had already rebased, which is the movement a decline reverses.
    for (const [index, ref] of fixture.suffixRefs.entries()) {
      expect(await git(repository, ["rev-parse", ref])).toBe(fixture.retargetedHeads[index]);
    }
  });

  it("settles a suffix collision the operator resubmits unchanged", async () => {
    const fixture = await installNativeSuffixStack(repository, { collision: "suffix" });
    await select(fixture);
    await seedSubmittedBottomLanding(fixture);
    await retargetRemoteSuffix(fixture);

    const disclosed = await landStatus(fixture);
    expect(disclosed.exitCode, `${disclosed.stderr}\n${disclosed.stdout}`).toBe(0);
    const wedge = JSON.parse(disclosed.stdout) as { readonly resolutionInput: unknown };
    expect(wedge).toMatchObject({
      status: "conflict-resolution-required",
      conflicts: [{ deliverableId: fixture.plan.members[2]!.deliverableId, paths: ["shared.txt"] }],
    });

    // A disclosure settles nothing on its own: the reservation is still held and no local ref has moved yet.
    for (const [index, ref] of fixture.suffixRefs.entries()) {
      expect(await git(repository, ["rev-parse", ref])).toBe(fixture.suffixHeads[index]);
    }

    const accepted = await landStatus(fixture, wedge.resolutionInput);
    expect(accepted.exitCode, `${accepted.stderr}\n${accepted.stdout}`).toBe(0);
    expect(JSON.parse(accepted.stdout)).toMatchObject({
      status: "applied",
      state: { value: { activeOperation: null } },
    });
    for (const [index, ref] of fixture.suffixRefs.entries()) {
      expect(await git(repository, ["rev-parse", ref])).toBe(fixture.retargetedHeads[index]);
    }
  });

  it("absorbs a terminal collision the operator merges by hand", async () => {
    const fixture = await installNativeSuffixStack(repository, { collision: "terminal" });
    await select(fixture);
    await seedSubmittedBottomLanding(fixture);
    await retargetRemoteSuffix(fixture);

    const wedged = await landStatus(fixture);
    const refreshedPredecessor = fixture.retargetedHeads.at(-1)!;
    expect(JSON.parse(wedged.stdout)).toMatchObject({
      status: "blocked",
      reason: "contribution-conflicted",
      paths: ["shared.txt"],
      conflictPreparation: {
        topRef: fixture.terminalRef,
        logicalMergeBase: fixture.suffixHeads.at(-1),
        parents: { top: fixture.terminalHead, refreshedPredecessor },
      },
    });

    const merged = await handMergeTerminalTop(fixture, refreshedPredecessor);
    const absorbed = await landStatus(fixture);
    expect(absorbed.exitCode, `${absorbed.stderr}\n${absorbed.stdout}`).toBe(0);
    expect(JSON.parse(absorbed.stdout)).toMatchObject({
      status: "applied",
      state: {
        value: {
          activeOperation: null,
          target: { coordinates: { head: fixture.landedTargetHead } },
        },
      },
    });
    expect(await git(repository, ["rev-parse", fixture.terminalRef])).toBe(merged);
  });

  it("declines a wedged landing, holding the reservation until a displaced ref is restored", async () => {
    const fixture = await installNativeSuffixStack(repository, { collision: "terminal" });
    await select(fixture);
    await seedSubmittedBottomLanding(fixture);
    await retargetRemoteSuffix(fixture);
    const wedged = await landStatus(fixture);
    expect(JSON.parse(wedged.stdout)).toMatchObject({ status: "blocked", reason: "contribution-conflicted" });

    const displaced = fixture.suffixRefs[0]!;
    await git(repository, ["update-ref", displaced, fixture.baseHead]);
    const held = JSON.parse(await readFile(fixture.statePath, "utf8")) as unknown;
    const refused = await landRelease(fixture);
    expect(JSON.parse(refused.stdout)).toMatchObject({
      status: "blocked",
      reason: "local-ref-moved",
      lease: { ref: displaced, expectedHead: fixture.retargetedHeads[0], observedHead: fixture.baseHead },
    });

    // A failed lease writes nothing: the reservation is held whole rather than half-released.
    expect(JSON.parse(await readFile(fixture.statePath, "utf8"))).toEqual(held);
    for (const [index, ref] of fixture.suffixRefs.entries()) {
      expect(await git(repository, ["rev-parse", ref])).toBe(
        index === 0 ? fixture.baseHead : fixture.retargetedHeads[index],
      );
    }

    await git(repository, ["update-ref", displaced, fixture.retargetedHeads[0]!]);
    const released = await landRelease(fixture);
    expect(released.exitCode, `${released.stderr}\n${released.stdout}`).toBe(0);
    expect(JSON.parse(released.stdout)).toMatchObject({
      status: "released",
      state: { value: { activeOperation: null } },
      restorations: fixture.suffixRefs.map((ref, index) => ({
        ref,
        observedHead: fixture.retargetedHeads[index],
        restoreHead: fixture.suffixHeads[index],
      })),
      landed: { affectedDeliverableIds: [fixture.plan.members[0]!.deliverableId] },
    });

    // The decline puts the member refs back where settlement found them and leaves the landing itself standing.
    for (const [index, ref] of fixture.suffixRefs.entries()) {
      expect(await git(repository, ["rev-parse", ref])).toBe(fixture.suffixHeads[index]);
    }
    expect(await git(repository, ["ls-remote", "origin", "refs/heads/main"]))
      .toBe(`${fixture.landedTargetHead}\trefs/heads/main`);
  });
});
