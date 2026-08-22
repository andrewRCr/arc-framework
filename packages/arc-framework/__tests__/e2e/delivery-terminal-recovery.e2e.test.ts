/** Built-CLI coverage for terminal deletion authority and interruption recovery. */

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { reserveDeliveryOperation } from "../../src/lib/delivery/operation.js";
import { DeliveryStateV1Schema, type DeliveryStateV1 } from "../../src/lib/delivery/schema.js";
import { deliveryStackPlanFixture } from "../fixtures/delivery-plan.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcWithStdin } from "./helpers.js";

const execFileAsync = promisify(execFile);

describe("delivery terminal recovery", () => {
  let repository: string;
  let remote: string;

  beforeEach(async () => {
    repository = await createTempRepo("arc-delivery-terminal-");
    const init = await runArc(["init", "--yes", "--name", "delivery-terminal"], repository);
    expect(init.exitCode, init.stderr).toBe(0);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "-m", "init"]);
    remote = await mkdtemp(join(tmpdir(), "arc-delivery-terminal-remote-"));
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
    await git(repository, ["remote", "add", "origin", remote]);
  });

  afterEach(async () => {
    await Promise.all([cleanupTempDir(repository), cleanupTempDir(remote)]);
  });

  async function installFixture(input: {
    readonly triggerPresent: boolean;
    readonly teardownReserved: boolean;
  }): Promise<{
    readonly planId: string;
    readonly triggerHead: string;
    readonly statePath: string;
    readonly env: Record<string, string>;
  }> {
    const plan = deliveryStackPlanFixture();
    const targetHead = await git(repository, ["rev-parse", "HEAD"]);
    const tree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
    await git(repository, ["commit", "--allow-empty", "-m", "member 1"]);
    const triggerHead = await git(repository, ["rev-parse", "HEAD"]);
    await git(repository, ["commit", "--allow-empty", "-m", "member 2"]);
    const terminalHead = await git(repository, ["rev-parse", "HEAD"]);
    const branchPushes = [
      `${targetHead}:refs/heads/main`,
      `${terminalHead}:refs/heads/member-2`,
    ];
    if (input.triggerPresent) branchPushes.push(`${triggerHead}:refs/heads/member-1`);
    await git(repository, ["push", "origin", ...branchPushes]);

    const state = DeliveryStateV1Schema.parse({
      schemaVersion: 1,
      semanticsVersion: "delivery-state/v1",
      planId: plan.planId,
      workUnitId: plan.workUnitId,
      boundPlan: { planRevision: plan.planRevision, planDigest: plan.planDigest },
      target: { ref: "refs/heads/main", coordinates: { head: targetHead, tree } },
      members: plan.members.map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: `refs/heads/member-${index + 1}`,
        changeRequest: { providerId: "github", changeRequestId: String(401 + index) },
        coordinates: index === 0
          ? { base: targetHead, head: triggerHead, tree }
          : { base: triggerHead, head: terminalHead, tree },
      })),
      activeOperation: null,
    });
    let storedState: DeliveryStateV1 = state;
    let revision = 1;
    if (input.teardownReserved) {
      const trigger = state.members[0]!;
      const snapshot = { target: state.target, members: [trigger] };
      const reserved = reserveDeliveryOperation({ revision, value: state }, plan, {
        operationId: "teardown-recovery",
        kind: "teardown",
        affectedDeliverableIds: [trigger.deliverableId],
        expectedStateRevision: revision,
        before: snapshot,
        requested: snapshot,
      });
      expect(reserved.status).toBe("reserved");
      if (reserved.status !== "reserved") throw new Error("fixture reservation refused");
      storedState = reserved.state;
      revision += 1;
    }

    const deliveryRoot = join(repository, ".git", "arc", "delivery");
    const planDirectory = join(deliveryRoot, "plans");
    const stateDirectory = join(deliveryRoot, "state");
    await Promise.all([
      mkdir(planDirectory, { recursive: true }),
      mkdir(stateDirectory, { recursive: true }),
    ]);
    await writeFile(join(planDirectory, `${plan.planId}.json`), `${JSON.stringify(plan)}\n`);
    const statePath = join(stateDirectory, `${plan.planId}.json`);
    await writeFile(statePath, `${JSON.stringify({
      schemaVersion: 1,
      semanticsVersion: "delivery-state-store/v1",
      planId: plan.planId,
      revision,
      value: storedState,
    })}\n`);

    const fakeBin = join(repository, "fake-bin");
    const fakeGh = join(fakeBin, "gh");
    const mutationMarker = join(repository, "top-remedy-mutated");
    const request = (
      number: number,
      member: number,
      requestHead: string,
      stateValue: "open" | "closed",
      base: string,
    ) => JSON.stringify({
      number,
      state: stateValue,
      merged: stateValue === "closed",
      draft: stateValue === "open",
      head: { ref: `member-${member}`, sha: requestHead, repo: { full_name: "owner/repo" } },
      base: { ref: base, repo: { full_name: "owner/repo" } },
    });
    await mkdir(fakeBin);
    await writeFile(fakeGh, [
      "#!/bin/sh",
      "case \"$2\" in",
      "  repos/owner/repo/pulls/401)",
      `    if [ "\${ARC_FAKE_WRONG_HEAD:-0}" = "1" ]; then printf '%s\\n' '${request(401, 1, "f".repeat(40), "closed", "main")}'; else printf '%s\\n' '${request(401, 1, triggerHead, "closed", "main")}'; fi`,
      "    ;;",
      "  repos/owner/repo/pulls/402)",
      "    case \"$*\" in",
      "      *--method*PATCH*) : > \"$ARC_FAKE_GH_MARKER\"; printf '{}\\n' ;;",
      `      *) if [ -f "$ARC_FAKE_GH_MARKER" ]; then printf '%s\\n' '${request(402, 2, terminalHead, "open", "main")}'; else printf '%s\\n' '${request(402, 2, terminalHead, "open", "member-1")}'; fi ;;`,
      "    esac",
      "    ;;",
      "  repos/owner/repo/git/ref/heads/main)",
      `    printf '%s\\n' '${JSON.stringify({ object: { sha: targetHead } })}'`,
      "    ;;",
      `  repos/owner/repo/git/commits/${targetHead})`,
      `    printf '%s\\n' '${JSON.stringify({ tree: { sha: tree } })}'`,
      "    ;;",
      "  *) echo \"unexpected gh invocation: $*\" >&2; exit 1 ;;",
      "esac",
      "",
    ].join("\n"));
    await chmod(fakeGh, 0o755);
    return {
      planId: plan.planId,
      triggerHead,
      statePath,
      env: {
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        ARC_FAKE_GH_MARKER: mutationMarker,
      },
    };
  }

  async function reserveInterruptedTopRemedy(fixture: {
    readonly statePath: string;
  }): Promise<void> {
    const envelope = JSON.parse(await readFile(fixture.statePath, "utf8")) as {
      planId: string;
      revision: number;
      value: DeliveryStateV1;
    };
    const trigger = envelope.value.members.at(-2)!;
    const terminal = envelope.value.members.at(-1)!;
    const before = { target: envelope.value.target, members: [terminal] };
    const value = DeliveryStateV1Schema.parse({
      ...envelope.value,
      activeOperation: {
        operationId: "top-remedy-recovery",
        kind: "top-remedy",
        affectedDeliverableIds: [terminal.deliverableId],
        stateRevision: envelope.revision,
        boundPlanDigest: envelope.value.boundPlan.planDigest,
        before,
        requested: before,
        effect: {
          providerId: terminal.changeRequest!.providerId,
          repository: "owner/repo",
          changeRequestId: terminal.changeRequest!.changeRequestId,
          headRef: terminal.ref!.replace(/^refs\/heads\//u, ""),
          headSha: terminal.coordinates!.head,
          triggerRef: trigger.ref!,
          triggerHeadSha: trigger.coordinates!.head,
          fromBaseRef: "member-1",
          protectedBaseRef: "main",
          action: "retarget",
        },
      },
    });
    await writeFile(fixture.statePath, `${JSON.stringify({
      schemaVersion: 1,
      semanticsVersion: "delivery-state-store/v1",
      planId: envelope.planId,
      revision: envelope.revision + 1,
      value,
    })}\n`);
  }

  it("refuses the top remedy while its triggering member ref is still present", async () => {
    const fixture = await installFixture({ triggerPresent: true, teardownReserved: false });
    const result = await runArcWithStdin(
      ["delivery", "top-remedy", "-", "--json"],
      repository,
      `${JSON.stringify({
        planId: fixture.planId,
        action: "retarget",
        repository: "owner/repo",
        protectedBaseRef: "main",
        remote: "origin",
      })}\n`,
      { env: fixture.env },
    );

    expect(result.exitCode, result.stderr).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery top-remedy",
      status: "refused",
      reason: "trigger-ref-present",
    });
  });

  it("applies the top remedy after proving the deleted trigger head locally", async () => {
    const fixture = await installFixture({ triggerPresent: false, teardownReserved: false });
    const result = await runArcWithStdin(
      ["delivery", "top-remedy", "-", "--json"],
      repository,
      `${JSON.stringify({
        planId: fixture.planId,
        action: "retarget",
        repository: "owner/repo",
        protectedBaseRef: "main",
        remote: "origin",
      })}\n`,
      { env: fixture.env },
    );

    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery top-remedy",
      status: "remedied",
      nextAction: "terminal-checkpoint",
    });
  });

  it("adopts an interrupted teardown only after exact post-delete proof", async () => {
    const fixture = await installFixture({ triggerPresent: false, teardownReserved: true });
    const request = `${JSON.stringify({
      planId: fixture.planId,
      repository: "owner/repo",
      remote: "origin",
    })}\n`;
    const result = await runArcWithStdin(
      ["delivery", "reconcile", "-", "--json"], repository, request, { env: fixture.env },
    );

    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery reconcile",
      status: "applied",
      state: { value: { activeOperation: null } },
    });

    const restored = JSON.parse(await readFile(fixture.statePath, "utf8")) as {
      value: DeliveryStateV1;
    };
    expect(restored.value.members[0]).toMatchObject({
      ref: "refs/heads/member-1",
      coordinates: { head: fixture.triggerHead },
      changeRequest: { providerId: "github", changeRequestId: "401" },
    });
  });

  it("retains an interrupted teardown reservation when the request head moved", async () => {
    const fixture = await installFixture({ triggerPresent: false, teardownReserved: true });
    const result = await runArcWithStdin(
      ["delivery", "reconcile", "-", "--json"],
      repository,
      `${JSON.stringify({ planId: fixture.planId, repository: "owner/repo", remote: "origin" })}\n`,
      { env: { ...fixture.env, ARC_FAKE_WRONG_HEAD: "1" } },
    );

    expect(result.exitCode, result.stderr).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery reconcile",
      status: "blocked",
    });
    const retained = JSON.parse(await readFile(fixture.statePath, "utf8")) as {
      value: DeliveryStateV1;
    };
    expect(retained.value.activeOperation).toMatchObject({ kind: "teardown" });
  });

  it.each([
    ["reappears", true, "origin"],
    ["is unavailable", false, "missing"],
  ] as const)("retains an interrupted top-remedy reservation when its trigger ref %s", async (
    _condition,
    triggerPresent,
    remoteName,
  ) => {
    const fixture = await installFixture({ triggerPresent, teardownReserved: false });
    await reserveInterruptedTopRemedy(fixture);
    const result = await runArcWithStdin(
      ["delivery", "reconcile", "-", "--json"],
      repository,
      `${JSON.stringify({ planId: fixture.planId, repository: "owner/repo", remote: remoteName })}\n`,
      { env: fixture.env },
    );

    expect(result.exitCode, result.stderr).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery reconcile",
      status: "blocked",
    });
    const retained = JSON.parse(await readFile(fixture.statePath, "utf8")) as {
      value: DeliveryStateV1;
    };
    expect(retained.value.activeOperation).toMatchObject({ kind: "top-remedy" });
  });
});
