import { describe, expect, it } from "vitest";

import { GhDeliveryHostPort } from "../../../../../src/scripts/delivery/hosts/github.js";
import type { DeliveryNativeStackInput } from "../../../../../src/lib/delivery/native-stack.js";
import { HostedProcessError } from "../../../../../src/scripts/review-gate/hosted/gh-process.js";
import type { HostedProcessRunner } from "../../../../../src/scripts/review-gate/hosted/gh-process.js";

const repository = "andrewRCr/arc-framework";
const headSha = "a".repeat(40);
const mergePolicy = {
  repository,
  stackPosition: "intermediate" as const,
  method: "merge" as const,
  allowedMethods: ["merge"] as Array<"merge" | "rebase" | "squash">,
  policyFingerprint: `sha256:${"a".repeat(64)}`,
};

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
          { number: 401, head: { ref: "delivery/example/first", sha: headSha }, base: { ref: "main" } },
          {
            number: 402,
            head: { ref: "delivery/example/second", sha: "b".repeat(40) },
            base: { ref: "delivery/example/first" },
          },
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

  it("accepts the provider stack listing that omits member base objects", async () => {
    const response = [{
      number: 9,
      base: { ref: "main" },
      pull_requests: [
        { number: 401, head: { ref: "delivery/example/first", sha: headSha } },
        { number: 402, head: { ref: "delivery/example/second", sha: "b".repeat(40) } },
      ],
    }];

    await expect(new GhDeliveryHostPort(runner(response)).observe(nativeInput))
      .resolves.toEqual({ status: "registered", stackNumber: 9 });
  });

  it("excludes a chained dependent request from the registered-member predicate", async () => {
    const response = [{
      number: 9,
      base: { ref: "main" },
      pull_requests: [
        { number: 401, head: { ref: "delivery/example/first", sha: headSha }, base: { ref: "main" } },
        {
          number: 403,
          head: { ref: "delivery/example/top", sha: "c".repeat(40) },
          base: { ref: "delivery/example/second" },
        },
        {
          number: 402,
          head: { ref: "delivery/example/second", sha: "b".repeat(40) },
          base: { ref: "delivery/example/first" },
        },
      ],
    }];

    await expect(new GhDeliveryHostPort(runner(response)).observe(nativeInput))
      .resolves.toEqual({ status: "registered", stackNumber: 9 });
  });

  it("still reports a genuinely mismatched requested member after dependent filtering", async () => {
    const response = [{
      number: 9,
      base: { ref: "main" },
      pull_requests: [
        { number: 401, head: { ref: "delivery/example/first", sha: headSha }, base: { ref: "main" } },
        {
          number: 403,
          head: { ref: "delivery/example/top", sha: "c".repeat(40) },
          base: { ref: "delivery/example/second" },
        },
        {
          number: 402,
          head: { ref: "delivery/example/second", sha: "d".repeat(40) },
          base: { ref: "delivery/example/first" },
        },
      ],
    }];

    await expect(new GhDeliveryHostPort(runner(response)).observe(nativeInput)).resolves.toEqual({
      status: "partial",
      affectedDeliverableIds: [nativeInput.members[1]?.deliverableId],
    });
  });

  it("reads an empty stack listing as unregistered", async () => {
    await expect(new GhDeliveryHostPort(runner([])).observe(nativeInput))
      .resolves.toEqual({ status: "unregistered" });
  });

  it("keeps multiple exact stack matches ambiguous", async () => {
    const pullRequests = [
      { number: 401, head: { ref: "delivery/example/first", sha: headSha }, base: { ref: "main" } },
      {
        number: 402,
        head: { ref: "delivery/example/second", sha: "b".repeat(40) },
        base: { ref: "delivery/example/first" },
      },
    ];
    const response = [9, 10].map((number) => ({ number, base: { ref: "main" }, pull_requests: pullRequests }));

    await expect(new GhDeliveryHostPort(runner(response)).observe(nativeInput))
      .resolves.toEqual({ status: "ambiguous" });
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
      throw new HostedProcessError("request conflict", "gh: Conflict (HTTP 409)", 1, 409, JSON.stringify({
        status: "pending", details: {
        uuid: "effect-8", expected_head_sha: request.topHeadSha,
        merge_method: "merge", merge_action: "direct_merge",
      } }));
    } };
    await expect(new GhDeliveryHostPort(existing).submitNativeMerge(request))
      .resolves.toEqual({ status: "existing", effectIdentity: "effect-8" });
    const conflicting: HostedProcessRunner = { run: async () => {
      throw new HostedProcessError("request conflict", "gh: Conflict (HTTP 409)", 1, 409, JSON.stringify({
        status: "pending", details: {
        uuid: "effect-9", expected_head_sha: "c".repeat(40),
        merge_method: "squash", merge_action: "direct_merge",
      } }));
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

    const merged: HostedProcessRunner = { run: async () => ({
      stdout: JSON.stringify({ status: "merged" }), stderr: "",
    }) };
    await expect(new GhDeliveryHostPort(merged).submitNativeMerge(request))
      .resolves.toEqual({ status: "merged" });

    const enqueued: HostedProcessRunner = { run: async () => ({
      stdout: JSON.stringify({ status: "enqueued" }), stderr: "",
    }) };
    await expect(new GhDeliveryHostPort(enqueued).submitNativeMerge(request))
      .resolves.toEqual({ status: "enqueued" });

    const failed: HostedProcessRunner = { run: async () => ({
      stdout: JSON.stringify({ status: "failed" }), stderr: "",
    }) };
    await expect(new GhDeliveryHostPort(failed).observeNativeMerge({ ...request, effectIdentity: "effect-7" }))
      .resolves.toEqual({ status: "failed" });

    const expired: HostedProcessRunner = { run: async () => {
      throw new HostedProcessError("not found", "", 1, 404);
    } };
    await expect(new GhDeliveryHostPort(expired).observeNativeMerge({ ...request, effectIdentity: "effect-7" }))
      .resolves.toEqual({ status: "refused", reason: "expired" });
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
        mergeCommitSha: null,
      },
    });
    await expect(new GhDeliveryHostPort(runner([])).observeRequest(effect())).resolves.toEqual({ status: "absent" });
    await expect(new GhDeliveryHostPort(runner([pull(), pull({ number: 402 })])).observeRequest(effect()))
      .resolves.toEqual({ status: "refused", reason: "multiple" });
    await expect(new GhDeliveryHostPort(runner([pull({
      head: { ref: "delivery/example/first", sha: headSha, repo: { full_name: "fork/example" } },
    })])).observeRequest(effect())).resolves.toEqual({ status: "refused", reason: "foreign" });
  });

  it("combines every request page and ignores deleted-head tombstones", async () => {
    const tombstone = pull({
      number: 400,
      head: { ref: "delivery/example/first", sha: headSha, repo: null },
    });
    await expect(new GhDeliveryHostPort(runner([[tombstone], [pull()]])).observeRequest(effect()))
      .resolves.toMatchObject({ status: "observed", request: { binding: { changeRequestId: "401" } } });
    await expect(new GhDeliveryHostPort(runner([[tombstone]])).observeRequest(effect()))
      .resolves.toEqual({ status: "absent" });
  });

  it("observes request absence through an explicit GET and owner-qualified head filter", async () => {
    const request = effect();
    const calls: string[][] = [];
    const queryRunner: HostedProcessRunner = {
      run: async (args) => {
        calls.push(args);
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
    expect(calls[0]).toEqual([
      "api", `repos/${repository}/pulls`, "--method", "GET",
      "-f", "state=all", "-f", `head=andrewRCr:${request.headRef}`, "-f", `base=${request.baseRef}`,
      "--paginate", "--slurp",
    ]);
  });

  it("validates direct request bindings and rejects foreign request repositories", async () => {
    const port = new GhDeliveryHostPort(runner(pull()));
    await expect(port.readRequest(repository, { providerId: "github", changeRequestId: "401" }))
      .resolves.toMatchObject({ status: "observed", request: { binding: { changeRequestId: "401" } } });
    await expect(port.readRequest(repository, { providerId: "other", changeRequestId: "401" }))
      .resolves.toEqual({ status: "refused", reason: "malformed" });
    await expect(port.readRequest(repository, { providerId: "github", changeRequestId: "pull/401" }))
      .resolves.toEqual({ status: "refused", reason: "malformed" });
    await expect(new GhDeliveryHostPort(runner(pull({
      base: { ref: "main", repo: { full_name: "someone/else" } },
    }))).readRequest(repository, { providerId: "github", changeRequestId: "401" }))
      .resolves.toEqual({ status: "refused", reason: "foreign" });
    await expect(new GhDeliveryHostPort(runner(pull({
      head: { ref: "delivery/example/first", sha: headSha, repo: { full_name: "someone/else" } },
    }))).readRequest(repository, { providerId: "github", changeRequestId: "401" }))
      .resolves.toEqual({ status: "refused", reason: "foreign" });
  });

  it("submits the bound intermediate merge at one exact head", async () => {
    const exactRunner: HostedProcessRunner = {
      run: async (args) => {
        const expected = [
          "pr", "merge", "401", "--repo", repository,
          "--match-head-commit", headSha, "--merge",
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
      strategy: "merge",
      mergePolicy,
    })).resolves.toEqual({ status: "submitted" });
  });

  it("mints native-stack-required only from a semantic stacked-member rejection", async () => {
    const stacked: HostedProcessRunner = { run: async () => {
      throw new HostedProcessError(
        "stacked pull request requires asynchronous merge",
        "gh: This pull request is part of a stack. Use the merge-async endpoint. (HTTP 422)",
        1,
        422,
      );
    } };
    const effect = {
      providerId: "github",
      repository,
      changeRequestId: "401",
      headSha,
      baseRef: "main",
      targetRef: "refs/heads/main",
      strategy: "merge",
      mergePolicy,
    } as const;

    await expect(new GhDeliveryHostPort(stacked).mergeRequest(effect))
      .resolves.toEqual({ status: "refused", reason: "native-stack-required" });
    await expect(new GhDeliveryHostPort(stacked).submitNativeMerge({
      repository,
      topChangeRequestId: "401",
      topHeadSha: headSha,
      mergeAction: "direct_merge",
      mergeMethod: "merge",
    })).resolves.toEqual({ status: "refused", reason: "native-stack-required" });
    const genericValidation: HostedProcessRunner = { run: async () => {
      throw new HostedProcessError("validation failed", "gh: Validation Failed (HTTP 422)", 1, 422);
    } };
    await expect(new GhDeliveryHostPort(genericValidation).mergeRequest(effect))
      .resolves.toEqual({ status: "refused", reason: "unavailable" });
  });

  it("applies each terminal remedy through one exact pull-request PATCH", async () => {
    for (const [action, tail] of [
      ["retarget", []],
      ["reopen-and-retarget", ["-f", "state=open"]],
    ] as const) {
      const calls: string[][] = [];
      const port = new GhDeliveryHostPort({ run: async (args) => {
        calls.push(args);
        return { stdout: "{}", stderr: "" };
      } });
      await expect(port.applyTopRemedy({
        providerId: "github",
        repository,
        changeRequestId: "401",
        headRef: "delivery/example/first",
        headSha,
        triggerRef: "refs/heads/delivery/example/previous",
        triggerHeadSha: "b".repeat(40),
        fromBaseRef: "delivery/example/previous",
        protectedBaseRef: "main",
        action,
      })).resolves.toEqual({ status: "submitted" });
      expect(calls).toEqual([[
        "api", `repos/${repository}/pulls/401`, "--method", "PATCH", "-f", "base=main", ...tail,
      ]]);
    }
    const malformedCalls: string[][] = [];
    const malformedRunner: HostedProcessRunner = { run: async (args) => {
      malformedCalls.push(args);
      return { stdout: "{}", stderr: "" };
    } };
    await expect(new GhDeliveryHostPort(malformedRunner).applyTopRemedy({
      providerId: "other",
      repository,
      changeRequestId: "401",
      headRef: "delivery/example/first",
      headSha,
      triggerRef: "refs/heads/delivery/example/previous",
      triggerHeadSha: "b".repeat(40),
      fromBaseRef: "delivery/example/previous",
      protectedBaseRef: "main",
      action: "retarget",
    })).resolves.toEqual({ status: "refused", reason: "malformed" });
    expect(malformedCalls).toEqual([]);
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
    let invalidTargetRan = false;
    const invalidTargetRunner: HostedProcessRunner = { run: async () => {
      invalidTargetRan = true;
      return { stdout: "{}", stderr: "" };
    } };
    await expect(new GhDeliveryHostPort(invalidTargetRunner).observeTarget(repository, "main"))
      .resolves.toEqual({ status: "refused", reason: "malformed" });
    expect(invalidTargetRan).toBe(false);
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
      mergePolicy,
    })).resolves.toEqual({ status: "refused", reason: "unavailable" });
  });
});
