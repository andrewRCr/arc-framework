/** Authenticate native checkout ownership before constructing local review's durable adapters. */
import { resolveReviewInvocation, type ReviewInvocationInput } from "./invocation.js";
import { readLocalReviewLiveContext, type ResolvedLocalReviewLiveContext } from "../hosts/local/live-context.js";
import { resolveLocalReviewVehicle } from "../hosts/local/review-authority.js";

/** Invocation authority with the production selection retained for the command's subsequent checks. */
export interface LocalReviewInvocationInput extends ReviewInvocationInput {
  localLiveContext?: Promise<ResolvedLocalReviewLiveContext>;
}

/** Resolve the existing local vehicle, retaining its exact primary while preserving an already bound owner. */
export async function resolveLocalReviewInvocation(options: ReviewInvocationInput): Promise<LocalReviewInvocationInput> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  if (!input.store.capabilities.stateOffBranch || input.workItem !== undefined) return input;
  const live = await readLocalReviewLiveContext(input);
  await resolveLocalReviewVehicle({}, { readLiveContext: () => Promise.resolve(live.context) });
  return { ...input, ...(live.workItem === undefined ? {} : { workItem: live.workItem }), localLiveContext: Promise.resolve(live) };
}
