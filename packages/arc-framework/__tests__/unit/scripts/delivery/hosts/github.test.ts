import { describe, expect, it } from "vitest";

import { GhDeliveryHostPort } from "../../../../../src/scripts/delivery/hosts/github.js";
import type { DeliveryNativeStackInput } from "../../../../../src/lib/delivery/native-stack.js";
import { HostedProcessError } from "../../../../../src/scripts/review-gate/hosted/gh-process.js";
import type { HostedProcessRunner } from "../../../../../src/scripts/review-gate/hosted/gh-process.js";

const repository = "andrewRCr/arc-framework";
const headSha = "a".repeat(40);

function pull(overrides: Record<string, unknown> = {}) {
  return {
    number: 401,
    state: "open",
    merged_at: null,
    draft: true,
    head: { ref: "delivery/example/first", sha: headSha, repo: { full_name: repository } },
    base: { ref: "main", repo: { full_name: repository } },
    ...overrides,
  };
}

function effect() {
  return {
    providerId: "github",
    repository,
    headRef: "delivery/example/first",
    headSha,
    baseRef: "main",
    draft: true,
  } as const;
}

function runner(response: unknown): HostedProcessRunner {
  return { run: async () => ({ stdout: JSON.stringify(response), stderr: "" }) };
}

describe("GhDeliveryHostPort", () => {
  const nativeInput: DeliveryNativeStackInput = {
    repository,
    members: [
      { deliverableId: `sha256:${"1".repeat(64)}`, changeRequestId: "401", headRef: "delivery/example/first", headSha, baseRef: "main" },
      { deliverableId: `sha256:${"2".repeat(64)}`, changeRequestId: "402", headRef: "delivery/example/second", headSha: "b".repeat(40), baseRef: "delivery/example/first" },
    ],
  };

  it("observes and registers only an exact existing pull-request chain through raw REST", async () => {
    const calls: string[][] = [];
    const nativeRunner: HostedProcessRunner = {
      run: async (args) => {
        calls.push(args);
        if (args.includes("-f") && !args.includes("--method")) {
          throw new HostedProcessError("request defaulted to POST", "", 1, 422);
        }
        if (args.includes("POST")) return { stdout: JSON.stringify({ number: 9 }), stderr: "" };
        return { stdout: JSON.stringify([{ number: 9, base: { ref: "main" }, pull_requests: [
          { number: 401, head: { ref: "delivery/example/first", sha: headSha } },
          { number: 402, head: { ref: "delivery/example/second", sha: "b".repeat(40) } },
        ] }]), stderr: "" };
      },
    };
    const port = new GhDeliveryHostPort(nativeRunner);
    await expect(port.observe(nativeInput)).resolves.toEqual({ status: "registered", stackNumber: 9 });
    await expect(port.link(nativeInput)).resolves.toEqual({ status: "submitted" });
    expect(calls[0]).toEqual([
      "api", `repos/${repository}/stacks`, "--method", "GET", "-f", "pull_request=401",
    ]);
    expect(calls[1]).toEqual([
      "api", `repos/${repository}/stacks`, "--method", "POST",
      "-F", "pull_requests[]=401", "-F", "pull_requests[]=402",
    ]);
    expect(calls.flat()).not.toContain("stack");
  });

  it("classifies rejected native stack payloads as malformed", async () => {
    const rejected: HostedProcessRunner = { run: async () => {
      throw new HostedProcessError("validation failed", "", 1, 422);
    } };

    await expect(new GhDeliveryHostPort(rejected).link(nativeInput))
      .resolves.toEqual({ status: "refused", reason: "malformed" });
  });

  it("submits native presentation unlink through the exact stack endpoint and closes failures", async () => {
    const calls: string[][] = [];
    const unlinkRunner: HostedProcessRunner = { run: async (args) => {
      calls.push(args);
      return { stdout: JSON.stringify({ status: "unstacked" }), stderr: "" };
    } };
    await expect(new GhDeliveryHostPort(unlinkRunner).unlink({ ...nativeInput, stackNumber: 9 }))
      .resolves.toEqual({ status: "submitted" });
    expect(calls).toEqual([["api", `repos/${repository}/stacks/9/unstack`, "--method", "POST"]]);

    const absent: HostedProcessRunner = { run: async () => {
      throw new HostedProcessError("not found", "", 1, 404);
    } };
    await expect(new GhDeliveryHostPort(absent).unlink({ ...nativeInput, stackNumber: 9 }))
      .resolves.toEqual({ status: "already-unlinked" });
    const unavailable: HostedProcessRunner = { run: async () => { throw new Error("offline"); } };
    await expect(new GhDeliveryHostPort(unavailable).unlink({ ...nativeInput, stackNumber: 9 }))
      .resolves.toEqual({ status: "refused", reason: "unavailable" });
  });

  it("normalizes SHA-pinned asynchronous merge submission, 409 adoption, and polling", async () => {
    const request = {
      repository, topChangeRequestId: "402", topHeadSha: "b".repeat(40),
      mergeAction: "direct_merge", mergeMethod: "merge",
    } as const;
    const calls: string[][] = [];
    const asyncRunner: HostedProcessRunner = { run: async (args) => {
      calls.push(args);
      return { stdout: JSON.stringify({ status: "pending", details: {
        uuid: "effect-7", expected_head_sha: request.topHeadSha,
        merge_method: "merge", merge_action: "direct_merge",
      } }), stderr: "" };
    } };
    const port = new GhDeliveryHostPort(asyncRunner);
    await expect(port.submitNativeMerge(request)).resolves.toEqual({ status: "submitted", effectIdentity: "effect-7" });
    await expect(port.observeNativeMerge({ ...request, effectIdentity: "effect-7" }))
      .resolves.toEqual({ status: "pending" });
    expect(calls[0]).toContain(`sha=${request.topHeadSha}`);

    const existing: HostedProcessRunner = { run: async () => {
      throw new HostedProcessError(JSON.stringify({ status: "pending", details: {
        uuid: "effect-8", expected_head_sha: request.topHeadSha,
        merge_method: "merge", merge_action: "direct_merge",
      } }), "", 1, 409);
    } };
    await expect(new GhDeliveryHostPort(existing).submitNativeMerge(request))
      .resolves.toEqual({ status: "existing", effectIdentity: "effect-8" });
    const conflicting: HostedProcessRunner = { run: async () => {
      throw new HostedProcessError(JSON.stringify({ status: "pending", details: {
        uuid: "effect-9", expected_head_sha: "c".repeat(40),
        merge_method: "squash", merge_action: "direct_merge",
      } }), "", 1, 409);
    } };
    await expect(new GhDeliveryHostPort(conflicting).submitNativeMerge(request))
      .resolves.toEqual({ status: "refused", reason: "malformed" });

    const movedPending: HostedProcessRunner = { run: async () => ({ stdout: JSON.stringify({
      status: "pending",
      details: {
        uuid: "effect-7", expected_head_sha: "c".repeat(40),
        merge_method: "merge", merge_action: "direct_merge",
      },
    }), stderr: "" }) };
    await expect(new GhDeliveryHostPort(movedPending).observeNativeMerge({ ...request, effectIdentity: "effect-7" }))
      .resolves.toEqual({ status: "refused", reason: "malformed" });
  });

  it("selects exactly one request by repository, head, sha, and base", async () => {
    await expect(new GhDeliveryHostPort(runner([pull()])).observeRequest(effect())).resolves.toEqual({
      status: "observed",
      request: {
        binding: { providerId: "github", changeRequestId: "401" },
        repository,
        headRepository: repository,
        headRef: "delivery/example/first",
        headSha,
        baseRef: "main",
        state: "open",
        draft: true,
      },
    });
    await expect(new GhDeliveryHostPort(runner([])).observeRequest(effect())).resolves.toEqual({ status: "absent" });
    await expect(new GhDeliveryHostPort(runner([pull(), pull({ number: 402 })])).observeRequest(effect()))
      .resolves.toEqual({ status: "refused", reason: "multiple" });
    await expect(new GhDeliveryHostPort(runner([pull({
      head: { ref: "delivery/example/first", sha: headSha, repo: { full_name: "fork/example" } },
    })])).observeRequest(effect())).resolves.toEqual({ status: "refused", reason: "foreign" });
  });

  it("observes request absence through an explicit GET and owner-qualified head filter", async () => {
    const request = effect();
    const queryRunner: HostedProcessRunner = {
      run: async (args) => {
        if (args.includes("-f") && !args.includes("--method")) {
          throw new HostedProcessError("request defaulted to POST", "", 1, 422);
        }
        const owner = repository.slice(0, repository.indexOf("/"));
        const response = args.includes(`head=${owner}:${request.headRef}`) ? [] : [pull()];
        return { stdout: JSON.stringify(response), stderr: "" };
      },
    };

    await expect(new GhDeliveryHostPort(queryRunner).observeRequest(request))
      .resolves.toEqual({ status: "absent" });
  });

  it("maps each configured merge strategy to one exact head-matched mutation", async () => {
    for (const [strategy, flag] of [["merge", "--merge"], ["rebase", "--rebase"], ["squash", "--squash"]] as const) {
      const exactRunner: HostedProcessRunner = {
        run: async (args) => {
          const expected = [
            "pr", "merge", "401", "--repo", repository,
            "--match-head-commit", headSha, flag,
          ];
          if (JSON.stringify(args) !== JSON.stringify(expected)) throw new Error("unexpected host mutation");
          return { stdout: "", stderr: "" };
        },
      };
      await expect(new GhDeliveryHostPort(exactRunner).mergeRequest({
        providerId: "github",
        repository,
        changeRequestId: "401",
        headSha,
        baseRef: "main",
        targetRef: "refs/heads/main",
        strategy,
      })).resolves.toEqual({ status: "submitted" });
    }
  });

  it("normalizes the protected target head and tree without guessing", async () => {
    const targetRunner: HostedProcessRunner = {
      run: async (args) => args[1]?.includes("git/ref/") === true
        ? { stdout: JSON.stringify({ object: { sha: "b".repeat(40) } }), stderr: "" }
        : { stdout: JSON.stringify({ tree: { sha: "c".repeat(40) } }), stderr: "" },
    };
    await expect(new GhDeliveryHostPort(targetRunner).observeTarget(repository, "refs/heads/main"))
      .resolves.toEqual({
        status: "observed",
        coordinates: { head: "b".repeat(40), tree: "c".repeat(40) },
      });
    await expect(new GhDeliveryHostPort(runner({ object: {} })).observeTarget(repository, "refs/heads/main"))
      .resolves.toEqual({ status: "refused", reason: "malformed" });
  });

  it("closes malformed and unavailable host evidence", async () => {
    await expect(new GhDeliveryHostPort(runner({})).observeRequest(effect()))
      .resolves.toEqual({ status: "refused", reason: "malformed" });
    const unavailable: HostedProcessRunner = { run: async () => { throw new Error("offline"); } };
    await expect(new GhDeliveryHostPort(unavailable).observeRequest(effect()))
      .resolves.toEqual({ status: "refused", reason: "unavailable" });
    await expect(new GhDeliveryHostPort(unavailable).mergeRequest({
      providerId: "github",
      repository,
      changeRequestId: "401",
      headSha,
      baseRef: "main",
      targetRef: "refs/heads/main",
      strategy: "merge",
    })).resolves.toEqual({ status: "refused", reason: "unavailable" });
  });
});
