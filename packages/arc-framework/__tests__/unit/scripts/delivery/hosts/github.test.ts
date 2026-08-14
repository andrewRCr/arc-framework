import { describe, expect, it } from "vitest";

import { GhDeliveryHostPort } from "../../../../../src/scripts/delivery/hosts/github.js";
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
        if (args.includes("-f") && !args.includes("--method")) throw new Error("request defaulted to POST");
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
    await expect(new GhDeliveryHostPort(runner({})).observeTarget(repository, "main"))
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
