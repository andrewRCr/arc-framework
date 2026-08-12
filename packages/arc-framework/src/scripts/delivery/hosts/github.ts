/** GitHub CLI implementation of the provider-neutral delivery host boundary. */

import type {
  DeliveryHostChangeRequest,
  DeliveryHostMutationResult,
  DeliveryHostOpenRequest,
  DeliveryHostPort,
  DeliveryHostRequestObservation,
} from "../../../lib/delivery/host.js";
import type {
  DeliveryChangeRequestV1,
  DeliveryLandEffectV1,
  DeliveryPublishEffectV1,
} from "../../../lib/delivery/schema.js";
import type { HostedProcessRunner } from "../../review-gate/hosted/gh-process.js";

const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function normalizeRequest(value: unknown): DeliveryHostChangeRequest | null {
  const request = record(value);
  const head = record(request?.head);
  const base = record(request?.base);
  const headRepository = record(head?.repo);
  const baseRepository = record(base?.repo);
  const number = request?.number;
  const state = request?.state;
  if (!Number.isSafeInteger(number) || (number as number) <= 0
    || (state !== "open" && state !== "closed")
    || typeof request?.merged !== "boolean"
    || typeof request.draft !== "boolean"
    || typeof head?.ref !== "string" || head.ref === ""
    || typeof head.sha !== "string" || !objectId.test(head.sha)
    || typeof base?.ref !== "string" || base.ref === ""
    || typeof headRepository?.full_name !== "string" || headRepository.full_name === ""
    || typeof baseRepository?.full_name !== "string" || baseRepository.full_name === "") return null;
  return {
    binding: { providerId: "github", changeRequestId: String(number) },
    repository: baseRepository.full_name,
    headRepository: headRepository.full_name,
    headRef: head.ref,
    headSha: head.sha,
    baseRef: base.ref,
    state: request.merged ? "merged" : state,
    draft: request.draft,
  };
}

function exactObservation(
  values: readonly unknown[],
  effect: DeliveryPublishEffectV1,
): DeliveryHostRequestObservation {
  const normalized = values.map(normalizeRequest);
  if (normalized.some((request) => request === null)) return { status: "refused", reason: "malformed" };
  const requests = normalized as DeliveryHostChangeRequest[];
  const exact = requests.filter((request) => request.repository === effect.repository
    && request.headRepository === effect.repository
    && request.headRef === effect.headRef
    && request.headSha === effect.headSha
    && request.baseRef === effect.baseRef);
  if (exact.length > 1) return { status: "refused", reason: "multiple" };
  const [selected] = exact;
  if (selected !== undefined) return { status: "observed", request: selected };
  return requests.length === 0 ? { status: "absent" } : { status: "refused", reason: "foreign" };
}

/** GitHub observations and mutations through the existing bounded `gh` runner. */
export class GhDeliveryHostPort implements DeliveryHostPort {
  constructor(private readonly runner: HostedProcessRunner) {}

  async observeRequest(effect: DeliveryPublishEffectV1): Promise<DeliveryHostRequestObservation> {
    try {
      const result = await this.runner.run([
        "api", `repos/${effect.repository}/pulls`,
        "-f", "state=all", "-f", `head=${effect.headRef}`, "-f", `base=${effect.baseRef}`,
      ]);
      const decoded = parse(result.stdout);
      return Array.isArray(decoded) ? exactObservation(decoded, effect) : { status: "refused", reason: "malformed" };
    } catch {
      return { status: "refused", reason: "unavailable" };
    }
  }

  async openRequest(input: DeliveryHostOpenRequest): Promise<DeliveryHostMutationResult> {
    try {
      const args = [
        "pr", "create", "--repo", input.effect.repository,
        "--head", input.effect.headRef, "--base", input.effect.baseRef,
        "--title", input.title, "--body", input.body,
      ];
      if (input.effect.draft) args.push("--draft");
      await this.runner.run(args);
      return { status: "submitted" };
    } catch {
      return { status: "refused", reason: "unavailable" };
    }
  }

  async readRequest(
    repository: string,
    binding: DeliveryChangeRequestV1,
  ): Promise<DeliveryHostRequestObservation> {
    if (binding.providerId !== "github" || !/^[1-9][0-9]*$/u.test(binding.changeRequestId)) {
      return { status: "refused", reason: "malformed" };
    }
    try {
      const result = await this.runner.run([
        "api", `repos/${repository}/pulls/${binding.changeRequestId}`,
      ]);
      const normalized = normalizeRequest(parse(result.stdout));
      if (normalized === null) return { status: "refused", reason: "malformed" };
      if (normalized.repository !== repository || normalized.headRepository !== repository) {
        return { status: "refused", reason: "foreign" };
      }
      return { status: "observed", request: normalized };
    } catch {
      return { status: "refused", reason: "unavailable" };
    }
  }

  async mergeRequest(effect: DeliveryLandEffectV1): Promise<DeliveryHostMutationResult> {
    if (effect.providerId !== "github") return { status: "refused", reason: "malformed" };
    try {
      const strategyFlag = effect.strategy === "merge" ? "--merge"
        : effect.strategy === "rebase" ? "--rebase" : "--squash";
      await this.runner.run([
        "pr", "merge", effect.changeRequestId, "--repo", effect.repository,
        "--match-head-commit", effect.headSha, strategyFlag,
      ]);
      return { status: "submitted" };
    } catch {
      return { status: "refused", reason: "unavailable" };
    }
  }

  async observeTarget(repository: string, targetRef: string): Promise<
    | { readonly status: "observed"; readonly coordinates: { readonly head: string; readonly tree: string } }
    | { readonly status: "refused"; readonly reason: "malformed" | "unavailable" }
  > {
    try {
      const refName = targetRef.replace(/^refs\/heads\//u, "");
      if (refName === targetRef || refName === "") return { status: "refused", reason: "malformed" };
      const refResult = await this.runner.run(["api", `repos/${repository}/git/ref/heads/${refName}`]);
      const ref = record(parse(refResult.stdout));
      const refObject = record(ref?.object);
      const head = refObject?.sha;
      if (typeof head !== "string" || !objectId.test(head)) return { status: "refused", reason: "malformed" };
      const commitResult = await this.runner.run(["api", `repos/${repository}/git/commits/${head}`]);
      const commit = record(parse(commitResult.stdout));
      const tree = record(commit?.tree)?.sha;
      return typeof tree === "string" && objectId.test(tree)
        ? { status: "observed", coordinates: { head, tree } }
        : { status: "refused", reason: "malformed" };
    } catch {
      return { status: "refused", reason: "unavailable" };
    }
  }
}
