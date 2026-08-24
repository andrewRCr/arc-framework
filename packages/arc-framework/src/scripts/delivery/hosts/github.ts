/** GitHub CLI implementation of the provider-neutral delivery host boundary. */

import type {
  DeliveryHostChangeRequest,
  DeliveryHostMutationResult,
  DeliveryHostOpenRequest,
  DeliveryHostPort,
  DeliveryHostRequestObservation,
  DeliveryTopRemedyHostPort,
} from "../../../lib/delivery/host.js";
import type {
  DeliveryChangeRequestV1,
  DeliveryLandEffectV1,
  DeliveryPublishEffectV1,
  DeliveryTopRemedyEffectV1,
} from "../../../lib/delivery/schema.js";
import { HostedProcessError, type HostedProcessRunner } from "../../review-gate/hosted/gh-process.js";
import type {
  DeliveryNativeStackInput,
  DeliveryNativeStackObservation,
  DeliveryNativeStackPort,
  DeliveryNativeStackUnlinkPort,
} from "../../../lib/delivery/native-stack.js";
import type {
  DeliveryNativeMergeHostPort,
  DeliveryNativeMergeObservation,
  DeliveryNativeMergeRequest,
  DeliveryNativeMergeSubmission,
} from "../../../lib/delivery/native-landing.js";

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

function requiresNativeStackMerge(error: unknown): boolean {
  if (!(error instanceof HostedProcessError) || error.httpStatus !== 422) return false;
  const detail = `${error.message}\n${error.stderr}\n${error.stdout}`;
  return /\bstack(?:ed)?\b/iu.test(detail)
    && /(?:merge-async|asynchronous merge|stack merge)/iu.test(detail);
}

function isDependentNativeRequest(
  value: unknown,
  requestedIds: ReadonlySet<string>,
  highestHeadRef: string,
): boolean {
  const request = record(value);
  const head = record(request?.head);
  const base = record(request?.base);
  return request !== null && Number.isSafeInteger(request.number) && (request.number as number) > 0
    && !requestedIds.has(String(request.number))
    && typeof head?.ref === "string" && head.ref !== ""
    && typeof head.sha === "string" && objectId.test(head.sha)
    && base?.ref === highestHeadRef;
}

function nativeRequestBaseRef(
  requests: readonly unknown[],
  index: number,
  stackBaseRef: string,
): string | null {
  const request = record(requests[index]);
  if (request === null) return null;
  if (request.base !== undefined) {
    const base = record(request.base);
    return typeof base?.ref === "string" && base.ref !== "" ? base.ref : null;
  }
  if (index === 0) return stackBaseRef;
  const predecessor = record(requests[index - 1]);
  const predecessorHead = record(predecessor?.head);
  return typeof predecessorHead?.ref === "string" && predecessorHead.ref !== ""
    ? predecessorHead.ref
    : null;
}

function normalizeRequest(value: unknown): DeliveryHostChangeRequest | null {
  const request = record(value);
  const head = record(request?.head);
  const base = record(request?.base);
  const headRepository = record(head?.repo);
  const baseRepository = record(base?.repo);
  const number = request?.number;
  const state = request?.state;
  const merged = request?.merged;
  const mergedAt = request?.merged_at;
  const mergeCommitSha = request?.merge_commit_sha;
  if (request === null || !Number.isSafeInteger(number) || (number as number) <= 0
    || (state !== "open" && state !== "closed")
    || (merged !== undefined && typeof merged !== "boolean")
    || (mergedAt !== undefined && mergedAt !== null && (typeof mergedAt !== "string" || mergedAt === ""))
    || (mergeCommitSha !== undefined && mergeCommitSha !== null
      && (typeof mergeCommitSha !== "string" || !objectId.test(mergeCommitSha)))
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
    state: merged === true || typeof mergedAt === "string" ? "merged" : state,
    draft: request.draft,
    mergeCommitSha: typeof mergeCommitSha === "string" ? mergeCommitSha : null,
  };
}

function isDeletedHeadRequest(value: unknown): boolean {
  const request = record(value);
  const head = record(request?.head);
  return request !== null && head !== null && head.repo === null;
}

function exactObservation(
  values: readonly unknown[],
  effect: DeliveryPublishEffectV1,
): DeliveryHostRequestObservation {
  const normalized = values.filter((value) => !isDeletedHeadRequest(value)).map(normalizeRequest);
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
export class GhDeliveryHostPort implements DeliveryHostPort, DeliveryTopRemedyHostPort, DeliveryNativeStackPort,
  DeliveryNativeStackUnlinkPort, DeliveryNativeMergeHostPort {
  constructor(private readonly runner: HostedProcessRunner) {}

  async observe(input: DeliveryNativeStackInput): Promise<DeliveryNativeStackObservation> {
    try {
      const result = await this.runner.run([
        "api", `repos/${input.repository}/stacks`, "--method", "GET",
        "-f", `pull_request=${input.members[0]?.changeRequestId ?? ""}`,
      ]);
      const decoded = parse(result.stdout);
      if (!Array.isArray(decoded)) return { status: "malformed" };
      if (decoded.length === 0) return { status: "unregistered" };
      const matches: number[] = [];
      const affected = new Set<string>();
      for (const candidate of decoded) {
        const stack = record(candidate);
        const number = stack?.number;
        const base = record(stack?.base);
        const stackBaseRef = base?.ref;
        const requests = stack?.pull_requests;
        if (!Number.isSafeInteger(number) || typeof stackBaseRef !== "string" || stackBaseRef === ""
          || !Array.isArray(requests)) return { status: "malformed" };
        const firstMember = input.members[0];
        const highestMember = input.members.at(-1);
        const requestedIds = new Set(input.members.map((member) => member.changeRequestId));
        const dependentIndexes = highestMember === undefined ? [] : requests.flatMap((request, index) => (
          isDependentNativeRequest(request, requestedIds, highestMember.headRef) ? [index] : []
        ));
        const comparedRequests = dependentIndexes.length === 1
          ? requests.filter((_, index) => index !== dependentIndexes[0])
          : requests;
        let exact = comparedRequests.length === input.members.length && stackBaseRef === firstMember?.baseRef;
        if (stackBaseRef !== firstMember?.baseRef && firstMember !== undefined) {
          affected.add(firstMember.deliverableId);
        }
        for (const [index, member] of input.members.entries()) {
          const request = record(comparedRequests[index]);
          const head = record(request?.head);
          const matchesMember = String(request?.number) === member.changeRequestId
            && head?.ref === member.headRef && head.sha === member.headSha
            && nativeRequestBaseRef(comparedRequests, index, stackBaseRef) === member.baseRef;
          if (!matchesMember) affected.add(member.deliverableId);
          exact &&= matchesMember;
        }
        if (exact) matches.push(number as number);
      }
      const [matchedStack] = matches;
      if (matches.length === 1 && matchedStack !== undefined) {
        return { status: "registered", stackNumber: matchedStack };
      }
      if (matches.length > 1) return { status: "ambiguous" };
      return affected.size > 0
        ? { status: "partial", affectedDeliverableIds: [...affected] }
        : { status: "unregistered" };
    } catch (error) {
      const status = record(error)?.httpStatus;
      return status === 404 ? { status: "unsupported" } : { status: "unavailable" };
    }
  }

  async link(input: DeliveryNativeStackInput): Promise<
    { readonly status: "submitted" } | { readonly status: "refused"; readonly reason: "unsupported" | "unavailable" | "malformed" }
  > {
    try {
      await this.runner.run([
        "api", `repos/${input.repository}/stacks`, "--method", "POST",
        ...input.members.flatMap((member) => ["-F", `pull_requests[]=${member.changeRequestId}`]),
      ]);
      return { status: "submitted" };
    } catch (error) {
      const status = error instanceof HostedProcessError ? error.httpStatus : record(error)?.httpStatus;
      return {
        status: "refused",
        reason: status === 404 ? "unsupported" : status === 422 ? "malformed" : "unavailable",
      };
    }
  }

  async unlink(input: DeliveryNativeStackInput & { readonly stackNumber: number }): Promise<
    { readonly status: "submitted" | "already-unlinked" }
    | { readonly status: "refused"; readonly reason: "unsupported" | "unavailable" | "malformed" }
  > {
    try {
      await this.runner.run([
        "api", `repos/${input.repository}/stacks/${input.stackNumber}/unstack`, "--method", "POST",
      ]);
      return { status: "submitted" };
    } catch (error) {
      if (error instanceof HostedProcessError && error.httpStatus === 404) return { status: "already-unlinked" };
      return { status: "refused", reason: "unavailable" };
    }
  }

  async submitNativeMerge(input: DeliveryNativeMergeRequest): Promise<DeliveryNativeMergeSubmission> {
    const normalize = (text: string, existing: boolean): DeliveryNativeMergeSubmission => {
      const response = record(parse(text));
      const status = response?.status;
      const details = record(response?.details);
      if (status === "merged") return { status: "merged" };
      if (status === "enqueued") return { status: "enqueued" };
      if (status !== "pending" || typeof details?.uuid !== "string" || details.uuid === "") {
        return { status: "refused", reason: "malformed" };
      }
      if (details.expected_head_sha !== input.topHeadSha
        || details.merge_method !== input.mergeMethod || details.merge_action !== input.mergeAction) {
        return { status: "refused", reason: "malformed" };
      }
      return { status: existing ? "existing" : "submitted", effectIdentity: details.uuid };
    };
    try {
      const result = await this.runner.run([
        "api", `repos/${input.repository}/pulls/${input.topChangeRequestId}/merge-async`,
        "--method", "PUT", "-f", `sha=${input.topHeadSha}`,
        "-f", `merge_method=${input.mergeMethod}`, "-f", `merge_action=${input.mergeAction}`,
      ]);
      return normalize(result.stdout, false);
    } catch (error) {
      if (error instanceof HostedProcessError && error.httpStatus === 409) {
        const payload = [error.stdout, error.stderr, error.message]
          .find((candidate) => record(parse(candidate)) !== null) ?? error.message;
        return normalize(payload, true);
      }
      if (error instanceof HostedProcessError && error.httpStatus === 404) {
        return { status: "refused", reason: "unsupported" };
      }
      if (requiresNativeStackMerge(error)) {
        return { status: "refused", reason: "native-stack-required" };
      }
      return { status: "refused", reason: "unavailable" };
    }
  }

  async observeNativeMerge(
    input: DeliveryNativeMergeRequest & { readonly effectIdentity: string },
  ): Promise<DeliveryNativeMergeObservation> {
    try {
      const result = await this.runner.run([
        "api", `repos/${input.repository}/pulls/${input.topChangeRequestId}/merge-async/${input.effectIdentity}`,
      ]);
      const response = record(parse(result.stdout));
      const status = response?.status;
      if (status === "pending") {
        const details = record(response?.details);
        return details?.uuid === input.effectIdentity
          && details.expected_head_sha === input.topHeadSha
          && details.merge_method === input.mergeMethod
          && details.merge_action === input.mergeAction
          ? { status }
          : { status: "refused", reason: "malformed" };
      }
      return status === "merged" || status === "enqueued" || status === "failed"
        ? { status }
        : { status: "refused", reason: "malformed" };
    } catch (error) {
      return error instanceof HostedProcessError && error.httpStatus === 404
        ? { status: "refused", reason: "expired" }
        : { status: "refused", reason: "unavailable" };
    }
  }

  async observeRequest(effect: DeliveryPublishEffectV1): Promise<DeliveryHostRequestObservation> {
    const [owner, name, ...extra] = effect.repository.split("/");
    if (owner === undefined || owner === "" || name === undefined || name === "" || extra.length > 0) {
      return { status: "refused", reason: "malformed" };
    }
    try {
      const result = await this.runner.run([
        "api", `repos/${effect.repository}/pulls`, "--method", "GET",
        "-f", "state=all", "-f", `head=${owner}:${effect.headRef}`, "-f", `base=${effect.baseRef}`,
        "--paginate", "--slurp",
      ]);
      const decoded = parse(result.stdout);
      if (!Array.isArray(decoded)) return { status: "refused", reason: "malformed" };
      const pageFlags = decoded.map(Array.isArray);
      if (pageFlags.some(Boolean) && !pageFlags.every(Boolean)) return { status: "refused", reason: "malformed" };
      const values = pageFlags.every(Boolean) ? decoded.flat() : decoded;
      return exactObservation(values, effect);
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
      await this.runner.run([
        "pr", "merge", effect.changeRequestId, "--repo", effect.repository,
        "--match-head-commit", effect.headSha, "--merge",
      ]);
      return { status: "submitted" };
    } catch (error) {
      return {
        status: "refused",
        reason: requiresNativeStackMerge(error) ? "native-stack-required" : "unavailable",
      };
    }
  }

  async applyTopRemedy(effect: DeliveryTopRemedyEffectV1): Promise<DeliveryHostMutationResult> {
    const parts = effect.repository.split("/");
    if (effect.providerId !== "github" || parts.length !== 2 || parts.some((part) => part === "")
      || !/^[1-9][0-9]*$/u.test(effect.changeRequestId)
      || effect.protectedBaseRef.startsWith("refs/") || effect.protectedBaseRef === "") {
      return { status: "refused", reason: "malformed" };
    }
    try {
      await this.runner.run([
        "api", `repos/${effect.repository}/pulls/${effect.changeRequestId}`,
        "--method", "PATCH", "-f", `base=${effect.protectedBaseRef}`,
        ...(effect.action === "reopen-and-retarget" ? ["-f", "state=open"] : []),
      ]);
      return { status: "submitted" };
    } catch (error) {
      return {
        status: "refused",
        reason: error instanceof HostedProcessError && error.httpStatus === 422 ? "malformed" : "unavailable",
      };
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
