/** Built-CLI coverage for terminal deletion authority and interruption recovery. */

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  attachDeliveryOperationEffectIdentity,
  reserveDeliveryOperation,
} from "../../src/lib/delivery/operation.js";
import { DeliveryStateV1Schema, type DeliveryStateV1 } from "../../src/lib/delivery/schema.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  serializeCandidateManagedRecord,
} from "../../src/lib/work-unit/candidate-attestation.js";
import { resolveCandidateRecordRelativePath } from "../../src/lib/work-unit/candidate-record-store.js";
import { resolveSubmissionBoundaryPath } from "../../src/lib/work-unit/submission-boundary-store.js";
import { parseIntegrationBoundaryLocus } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
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
      `    if [ "\${ARC_FAKE_NATIVE_NONE:-0}" = "1" ]; then printf '%s\\n' '${request(401, 1, triggerHead, "open", "main")}'; elif [ "\${ARC_FAKE_WRONG_HEAD:-0}" = "1" ]; then printf '%s\\n' '${request(401, 1, "f".repeat(40), "closed", "main")}'; else printf '%s\\n' '${request(401, 1, triggerHead, "closed", "main")}'; fi`,
      "    ;;",
      "  repos/owner/repo/pulls/401/merge-async/native-effect-1)",
      "    if [ \"${ARC_FAKE_NATIVE_MERGED:-0}\" = \"1\" ]; then printf '%s\\n' '{\"status\":\"merged\"}'; else printf '%s\\n' '{\"status\":\"failed\"}'; fi",
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

  async function reserveInterruptedNativeLanding(
    fixture: { readonly statePath: string },
    identityBound: boolean,
  ): Promise<void> {
    const envelope = JSON.parse(await readFile(fixture.statePath, "utf8")) as {
      planId: string;
      revision: number;
      value: DeliveryStateV1;
    };
    const plan = deliveryStackPlanFixture();
    const members = envelope.value.members.slice(0, -1);
    const top = members.at(-1);
    if (top?.changeRequest === null || top?.changeRequest === undefined || top.coordinates === null) {
      throw new Error("fixture native member must be fully bound");
    }
    const snapshot = { target: envelope.value.target, members };
    const operationId = "native-landing-recovery";
    const reserved = reserveDeliveryOperation({ revision: envelope.revision, value: envelope.value }, plan, {
      operationId,
      kind: "land",
      mode: "native",
      affectedDeliverableIds: members.map((member) => member.deliverableId),
      expectedStateRevision: envelope.revision,
      before: snapshot,
      requested: snapshot,
      effect: {
        providerId: "github",
        repository: "owner/repo",
        changeRequestId: top.changeRequest.changeRequestId,
        headSha: top.coordinates.head,
        baseRef: "main",
        targetRef: "refs/heads/main",
        strategy: "merge",
      },
    });
    if (reserved.status !== "reserved") throw new Error("fixture native reservation refused");
    const attached = identityBound
      ? attachDeliveryOperationEffectIdentity(
          { revision: envelope.revision + 1, value: reserved.state },
          operationId,
          { providerId: "github", effectId: "native-effect-1" },
        )
      : null;
    if (attached?.status === "refused") throw new Error("fixture native identity attachment refused");
    await writeFile(fixture.statePath, `${JSON.stringify({
      ...envelope,
      revision: envelope.revision + (attached === null ? 1 : 2),
      value: attached === null ? reserved.state : attached.state,
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

  it("continues an applied highest teardown through the freshly observed top remedy", async () => {
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
      nextAction: "retarget",
      top: {
        status: "refused",
        reason: "top-target-mismatch",
        remedy: {
          nextAction: "retarget",
          repository: "owner/repo",
          changeRequestId: "402",
          protectedBaseRef: "main",
        },
      },
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

    const remedy = await runArcWithStdin(
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
    expect(remedy.exitCode, remedy.stderr).toBe(0);
    expect(JSON.parse(remedy.stdout)).toMatchObject({
      command: "delivery top-remedy",
      status: "remedied",
      nextAction: "terminal-checkpoint",
    });
  });

  it("preserves an exact unperformed teardown for its ordinary rerun", async () => {
    const fixture = await installFixture({ triggerPresent: true, teardownReserved: true });
    const result = await runArcWithStdin(
      ["delivery", "reconcile", "-", "--json"],
      repository,
      `${JSON.stringify({ planId: fixture.planId, repository: "owner/repo", remote: "origin" })}\n`,
      { env: fixture.env },
    );

    expect(result.exitCode, result.stderr).toBe(0);
    const recovery = JSON.parse(result.stdout) as Record<string, unknown>;
    const plan = deliveryStackPlanFixture();
    expect(recovery).toMatchObject({
      command: "delivery reconcile",
      status: "retryable",
      transition: "preserved",
      action: "delivery-teardown",
      selector: {
        planId: fixture.planId,
        operationId: "teardown-recovery",
        operationKind: "teardown",
        affectedDeliverableIds: [plan.members[0]!.deliverableId],
      },
      recommendedActionText:
        "Rerun `arc delivery teardown` for the exact teardown reservation subject.",
    });
    const restored = JSON.parse(await readFile(fixture.statePath, "utf8")) as {
      value: DeliveryStateV1;
    };
    expect(restored.value.activeOperation).toMatchObject({
      operationId: "teardown-recovery",
      kind: "teardown",
      affectedDeliverableIds: [plan.members[0]!.deliverableId],
    });
    await expect(git(repository, ["ls-remote", "--exit-code", "origin", "refs/heads/member-1"]))
      .resolves.toContain(fixture.triggerHead);

    const facts = {
      target: restored.value.target,
      members: restored.value.members,
      landedDeliverableIds: [plan.members[0]!.deliverableId],
    };
    const teardown = await runArcWithStdin(
      ["delivery", "teardown", "-", "--json"],
      repository,
      `${JSON.stringify({
        planId: fixture.planId,
        deliverableId: plan.members[0]!.deliverableId,
        facts,
        repository: "owner/repo",
        protectedTargetRef: "refs/heads/main",
        remote: "origin",
      })}\n`,
      { env: fixture.env },
    );
    expect(teardown.exitCode, teardown.stderr).toBe(0);
    expect(JSON.parse(teardown.stdout)).toMatchObject({
      command: "delivery teardown",
      status: "torn-down",
      nextAction: "retarget",
    });

    const remedy = await runArcWithStdin(
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
    expect(remedy.exitCode, remedy.stderr).toBe(0);
    expect(JSON.parse(remedy.stdout)).toMatchObject({
      command: "delivery top-remedy",
      status: "remedied",
      nextAction: "terminal-checkpoint",
    });
  });

  it("rebinds stale terminal coordinates to the independently settled current Candidate", async () => {
    const fixture = await installFixture({ triggerPresent: false, teardownReserved: false });
    const plan = deliveryStackPlanFixture();
    const envelope = JSON.parse(await readFile(fixture.statePath, "utf8")) as {
      planId: string;
      revision: number;
      value: DeliveryStateV1;
    };
    const terminal = envelope.value.members.at(-1)!;
    const currentHead = await git(repository, ["rev-parse", "HEAD"]);
    const currentTree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
    const currentBase = await git(repository, ["merge-base", currentHead, "refs/heads/main"]);
    const subject = createCandidateSubjectSnapshot([]);
    const attestation = createCandidateAttestation({
      workUnit: plan.workUnitId,
      subject,
      baseRevision: currentHead,
      attestedBy: "owner",
      attestedAt: "2026-08-22T12:00:00.000Z",
      verificationEvidenceRef: "verification://delivery-terminal",
    });
    const candidatePath = join(repository, resolveCandidateRecordRelativePath(plan.workUnitId));
    const boundaryPath = join(repository, resolveSubmissionBoundaryPath(plan.workUnitId));
    await mkdir(join(candidatePath, ".."), { recursive: true });
    await Promise.all([
      writeFile(candidatePath, serializeCandidateManagedRecord({
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        attestation,
        subject,
        transitions: [],
        lineageAttestations: [],
      })),
      writeFile(boundaryPath, `${JSON.stringify(parseIntegrationBoundaryLocus({
        schemaVersion: 1,
        mode: "integration-boundary",
        workUnit: plan.workUnitId,
        candidateId: attestation.candidateId,
        candidateSubjectDigest: subject.subjectDigest,
        locus: "publication-pending",
        nextAction: {
          kind: "continue-publication",
          command: `arc publish ${plan.workUnitId}`,
          interactionText: "Continue publication.",
        },
        policy: null,
        reservation: null,
        terminus: null,
      }))}\n`),
      writeFile(join(repository, "top-remedy-mutated"), ""),
    ]);
    const stale = DeliveryStateV1Schema.parse({
      ...envelope.value,
      members: envelope.value.members.map((member, index, members) => index === members.length - 1
        ? {
            ...member,
            coordinates: {
              ...member.coordinates!,
              base: fixture.triggerHead,
              head: fixture.triggerHead,
            },
          }
        : member),
    });
    await writeFile(fixture.statePath, `${JSON.stringify({ ...envelope, value: stale })}\n`);
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
      status: "rebound",
      nextAction: "rerun-checkpoint",
      state: {
        value: {
          members: [
            expect.anything(),
            {
              ...terminal,
              coordinates: { base: currentBase, head: currentHead, tree: currentTree },
            },
          ],
        },
      },
    });

    const replay = await runArcWithStdin(
      ["delivery", "reconcile", "-", "--json"], repository, request, { env: fixture.env },
    );
    expect(replay.exitCode, replay.stderr).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({
      status: "rebound",
      state: { revision: envelope.revision + 1 },
      nextAction: "rerun-checkpoint",
    });
  });

  it("clears an unperformed top remedy before returning its fresh ordinary action", async () => {
    const fixture = await installFixture({ triggerPresent: false, teardownReserved: false });
    await reserveInterruptedTopRemedy(fixture);
    const request = `${JSON.stringify({
      planId: fixture.planId,
      repository: "owner/repo",
      remote: "origin",
    })}\n`;
    const result = await runArcWithStdin(
      ["delivery", "reconcile", "-", "--json"], repository, request, { env: fixture.env },
    );

    expect(result.exitCode, result.stderr).toBe(0);
    const recovery = JSON.parse(result.stdout) as Record<string, unknown>;
    const plan = deliveryStackPlanFixture();
    expect(recovery).toMatchObject({
      command: "delivery reconcile",
      status: "retryable",
      transition: "cleared",
      action: "delivery-top-remedy",
      selector: {
        planId: fixture.planId,
        operationId: "top-remedy-recovery",
        operationKind: "top-remedy",
        affectedDeliverableIds: [plan.members.at(-1)!.deliverableId],
      },
      recommendedActionText:
        "Rerun `arc delivery top-remedy` for the exact top-remedy reservation subject.",
    });
    const cleared = JSON.parse(await readFile(fixture.statePath, "utf8")) as {
      revision: number;
      value: DeliveryStateV1;
    };
    expect(cleared.value.activeOperation).toBeNull();

    const replay = await runArcWithStdin(
      ["delivery", "reconcile", "-", "--json"], repository, request, { env: fixture.env },
    );
    expect(replay.exitCode, replay.stderr).toBe(1);
    const replayResult = JSON.parse(replay.stdout) as Record<string, unknown>;
    expect(replayResult).toMatchObject({
      command: "delivery reconcile",
      status: "blocked",
      reason: "observation-unavailable",
    });
    expect(replayResult).not.toHaveProperty("action");
    expect(replayResult).not.toHaveProperty("selector");
    const replayedState = JSON.parse(await readFile(fixture.statePath, "utf8")) as {
      revision: number;
      value: DeliveryStateV1;
    };
    expect(replayedState).toEqual(cleared);

    const remedy = await runArcWithStdin(
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
    expect(remedy.exitCode, remedy.stderr).toBe(0);
    expect(JSON.parse(remedy.stdout)).toMatchObject({
      command: "delivery top-remedy",
      status: "remedied",
      nextAction: "terminal-checkpoint",
    });
  });

  it("retains a native landing reservation whose provider identity was not persisted", async () => {
    const fixture = await installFixture({ triggerPresent: false, teardownReserved: false });
    await reserveInterruptedNativeLanding(fixture, false);
    const result = await runArcWithStdin(
      ["delivery", "reconcile", "-", "--json"],
      repository,
      `${JSON.stringify({ planId: fixture.planId, repository: "owner/repo", remote: "origin" })}\n`,
      { env: { ...fixture.env, ARC_FAKE_NATIVE_NONE: "1" } },
    );

    expect(result.exitCode, result.stderr).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery reconcile",
      status: "blocked",
      reason: "native-effect-ambiguous",
    });
    const retained = JSON.parse(await readFile(fixture.statePath, "utf8")) as {
      value: DeliveryStateV1;
    };
    expect(retained.value.activeOperation).toMatchObject({
      operationId: "native-landing-recovery",
      kind: "land",
      mode: "native",
      effectIdentity: null,
    });
  });

  it("clears a persisted failed native effect only after exact none-landed observation", async () => {
    const fixture = await installFixture({ triggerPresent: false, teardownReserved: false });
    await reserveInterruptedNativeLanding(fixture, true);
    const result = await runArcWithStdin(
      ["delivery", "reconcile", "-", "--json"],
      repository,
      `${JSON.stringify({ planId: fixture.planId, repository: "owner/repo", remote: "origin" })}\n`,
      { env: { ...fixture.env, ARC_FAKE_NATIVE_NONE: "1" } },
    );

    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery reconcile",
      status: "retryable",
      transition: "cleared",
      action: "delivery-native-land-select",
      selector: {
        planId: fixture.planId,
        operationId: "native-landing-recovery",
        operationKind: "land",
        mode: "native",
      },
    });
    const cleared = JSON.parse(await readFile(fixture.statePath, "utf8")) as {
      value: DeliveryStateV1;
    };
    expect(cleared.value.activeOperation).toBeNull();
  });

  it("retains a provider-reported merged effect when the selected request identity mismatches", async () => {
    const fixture = await installFixture({ triggerPresent: false, teardownReserved: false });
    await reserveInterruptedNativeLanding(fixture, true);
    const result = await runArcWithStdin(
      ["delivery", "reconcile", "-", "--json"],
      repository,
      `${JSON.stringify({ planId: fixture.planId, repository: "owner/repo", remote: "origin" })}\n`,
      { env: { ...fixture.env, ARC_FAKE_NATIVE_MERGED: "1", ARC_FAKE_WRONG_HEAD: "1" } },
    );

    expect(result.exitCode, result.stderr).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery reconcile",
      status: "blocked",
      reason: "native-effect-ambiguous",
    });
    const retained = JSON.parse(await readFile(fixture.statePath, "utf8")) as {
      value: DeliveryStateV1;
    };
    expect(retained.value.activeOperation).toMatchObject({
      operationId: "native-landing-recovery",
      effectIdentity: { providerId: "github", effectId: "native-effect-1" },
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
    const recovery = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(recovery).toMatchObject({
      command: "delivery reconcile",
      status: "blocked",
    });
    expect(recovery).not.toHaveProperty("action");
    expect(recovery).not.toHaveProperty("selector");
    expect(recovery).toHaveProperty("recommendedActionText");
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
