import { describe, expect, it, vi } from "vitest";

import type { NormalizedChangeRequest } from "../../../../../src/scripts/review-gate/core/contracts.js";
import type { GitExec } from "../../../../../src/lib/git/exec.js";
import type { HttpFetch } from "../../../../../src/scripts/review-gate/hosts/github/api/http.js";
import type { ChangeRequestResolution } from "../../../../../src/scripts/review-gate/hosts/github/change-request.js";
import { CodeRabbitProviderAdapter } from "../../../../../src/scripts/review-gate/providers/coderabbit/adapter.js";
import {
  SELF_HOSTING_POLICY,
  type SelfHostingPolicy,
} from "../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";
import {
  createAttestRuntime,
  createReconcileRuntime,
  createSharedInfrastructure,
  type CompositionIo,
  type CompositionSeams,
  type ReconcileRuntimeConfig,
} from "../../../../../src/scripts/review-gate/runtime/composition.js";
import { SelfHostingReconcileRuntime } from "../../../../../src/scripts/review-gate/runtime/reconcile-runtime.js";

const HEAD = "c".repeat(40);
const changeRequest: NormalizedChangeRequest = {
  schemaVersion: 1,
  repositoryId: "100",
  changeRequestId: "PR_node",
  hostRef: "github:o/r/pull/7",
  baseRef: "main",
  baseSha: "a".repeat(40),
  diffBaseSha: "b".repeat(40),
  headSha: HEAD,
  changeSetId: "d".repeat(64),
};

const resolvedChange = (): ChangeRequestResolution => ({
  kind: "resolved",
  changeRequest,
  context: {
    changedPaths: [],
    author: { identity: "author-1", nodeId: "U_author", login: "author", kind: "user" },
    isDraft: false,
    isCrossRepository: false,
    mergeability: "mergeable",
  },
});

function baseConfig(overrides: Partial<ReconcileRuntimeConfig> = {}): ReconcileRuntimeConfig {
  return {
    owner: "o",
    repo: "r",
    repositoryId: 100,
    pullRequestNumber: 7,
    appToken: "ghs_installationtoken",
    appSlug: "arc-review-gate",
    expectedAppId: "4268856",
    policy: SELF_HOSTING_POLICY,
    mode: "shadow",
    ...overrides,
  };
}

function makeIo(): { io: CompositionIo; fetch: ReturnType<typeof vi.fn> } {
  const fetch = vi.fn(async () => { throw new Error("no network expected during composition"); });
  return {
    io: { fetch: fetch as unknown as HttpFetch, exec: (async () => ({ stdout: "" })) as GitExec },
    fetch,
  };
}

const verifiedSeams = (overrides: Partial<CompositionSeams> = {}): CompositionSeams => ({
  verifyLaunchAuthority: async () => ({ kind: "verified" }),
  resolveChange: async () => resolvedChange(),
  ...overrides,
});

function coderabbitPolicy(): SelfHostingPolicy {
  const [coderabbit, ...rest] = SELF_HOSTING_POLICY.qualifications;
  if (coderabbit === undefined) throw new Error("missing CodeRabbit policy fixture");
  return {
    ...SELF_HOSTING_POLICY,
    qualifications: [{ ...coderabbit, enabled: true }, ...rest],
  };
}

describe("review-gate composition roots", () => {
  it("returns the shared graph without any publish or provider capability", async () => {
    const { io, fetch } = makeIo();
    const shared = await createSharedInfrastructure(baseConfig(), io, verifiedSeams());

    expect(shared.launchAuthority).toEqual({ kind: "verified" });
    expect(shared.host).toBeDefined();
    expect(shared.checks).toBeDefined();
    expect(shared.issueCommentApi).toBeDefined();
    expect(shared).not.toHaveProperty("runtime");
    expect(shared).not.toHaveProperty("store");
    expect(shared).not.toHaveProperty("provider");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("wires a full reconcile runtime observable through injected boundaries", async () => {
    const { io, fetch } = makeIo();
    const composition = await createReconcileRuntime(baseConfig(), io, verifiedSeams());

    expect(composition.runtime).toBeInstanceOf(SelfHostingReconcileRuntime);
    expect(composition.provider).toBeInstanceOf(CodeRabbitProviderAdapter);
    expect(composition.store).toBeDefined();
    expect(composition.checks).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("wires an attest-only graph without reconcile, provider, or publisher capability", async () => {
    const { io, fetch } = makeIo();
    const composition = await createAttestRuntime({
      ...baseConfig(),
      dispatchActorLogin: "maintainer",
      dispatchActorId: "maintainer-1",
    }, io, verifiedSeams({
      resolveActorCapabilities: async () => ({
        schemaVersion: 1,
        actorIdentity: "maintainer-1",
        permissions: ["maintain"],
      }),
      stateExpected: async () => false,
    }));

    await expect(composition.resolveValidationContext()).resolves.toMatchObject({
      repositoryId: "100",
      changeRequestId: "PR_node",
      authenticatedActor: { actorIdentity: "maintainer-1" },
      requirement: { id: "independent-analysis" },
    });
    expect(composition.store).toBeDefined();
    expect(composition).not.toHaveProperty("runtime");
    expect(composition).not.toHaveProperty("provider");
    expect(composition).not.toHaveProperty("checks");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains the source path when a code file is renamed to a routine destination", async () => {
    const { io } = makeIo();
    const renamed = resolvedChange();
    if (renamed.kind !== "resolved") throw new Error("expected resolved fixture");
    renamed.context.changedPaths = [{ status: "renamed", path: "docs/controller.md", previousPath: "src/controller.ts" }];
    const composition = await createAttestRuntime({
      ...baseConfig(),
      dispatchActorLogin: "maintainer",
      dispatchActorId: "maintainer-1",
    }, io, verifiedSeams({
      resolveChange: async () => renamed,
      resolveActorCapabilities: async () => ({
        schemaVersion: 1,
        actorIdentity: "maintainer-1",
        permissions: ["maintain"],
      }),
      stateExpected: async () => false,
    }));

    await expect(composition.resolveValidationContext()).resolves.toMatchObject({
      requirement: { obligation: "required" },
    });
  });

  it.each([
    ["empty appToken", { appToken: "" }, /appToken is required/u],
    ["empty owner", { owner: "" }, /owner is required/u],
    ["non-positive repositoryId", { repositoryId: 0 }, /repositoryId must be a positive integer/u],
    ["non-positive pullRequestNumber", { pullRequestNumber: -1 }, /pullRequestNumber must be a positive integer/u],
  ])("fails closed on %s before constructing effects", async (_name, overrides, message) => {
    const { io } = makeIo();
    await expect(createReconcileRuntime(baseConfig(overrides), io, verifiedSeams())).rejects.toThrow(message);
  });

  it("fails closed when launch authority does not verify the installation token", async () => {
    const { io } = makeIo();
    const seams = verifiedSeams({ verifyLaunchAuthority: async () => ({ kind: "failed", reason: "app-bot-id-mismatch" }) });

    const shared = await createSharedInfrastructure(baseConfig(), io, seams);
    expect(shared.launchAuthority).toEqual({ kind: "failed", reason: "app-bot-id-mismatch" });

    await expect(createReconcileRuntime(baseConfig(), io, seams)).rejects.toThrow(/launch authority failed/u);
  });

  it("fails closed when the canonical change request is unavailable", async () => {
    const { io } = makeIo();
    const seams = verifiedSeams({ resolveChange: async () => ({ kind: "unavailable", reason: "objects-unavailable" }) });

    await expect(createReconcileRuntime(baseConfig(), io, seams)).rejects.toThrow(/change request unavailable/u);
  });

  it("wires the CodeRabbit boundary under both a disabled and an enabled provider policy", async () => {
    const { io } = makeIo();
    const disabled = await createReconcileRuntime(baseConfig(), io, verifiedSeams());
    const enabled = await createReconcileRuntime(baseConfig({ policy: coderabbitPolicy() }), io, verifiedSeams());

    expect(disabled.provider).toBeInstanceOf(CodeRabbitProviderAdapter);
    expect(enabled.provider).toBeInstanceOf(CodeRabbitProviderAdapter);
  });
});
