/** Bounded reruns of ref listings that a concurrent files-format transaction tore. */

import { isCompletedGitFailure, isGitProcessError } from "./process-error.js";

const TORN_LISTING_ATTEMPTS = 3;
// A loose-ref directory read that met one ref at two values; the files format refuses rather than list both.
const TORN_LISTING = /^fatal: Duplicated ref, and SHA1s don't match: /mu;

/** Whether Git refused a listing because one directory read met a ref at two values. */
function isTornListing(error: unknown): boolean {
  return isGitProcessError(error) && isCompletedGitFailure(error) && TORN_LISTING.test(error.stderr);
}

/**
 * Run a ref listing, running it again without waiting while Git refuses it as torn.
 * @param list - One complete listing call; every other failure, and the last refusal, propagates unchanged.
 */
export async function retryTornRefListing<Result>(list: () => Promise<Result>): Promise<Result> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await list();
    } catch (error) {
      if (attempt >= TORN_LISTING_ATTEMPTS || !isTornListing(error)) throw error;
    }
  }
}
