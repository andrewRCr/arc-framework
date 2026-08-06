/** Narrow topology adapters for authority derivation and later corroboration. */

import type { RegisteredWorktree } from "../git/worktree-roster.js";
import type { CheckoutCorroborationTopology } from "./role-corroboration.js";
import type { CheckoutAuthorityTopology } from "./role-derivation.js";

/**
 * Project registered topology into the authority-only shape.
 * @param checkout - Complete registered worktree observation.
 * @returns Authority-safe path and primary facts.
 */
export function projectCheckoutAuthorityTopology(checkout: RegisteredWorktree): CheckoutAuthorityTopology {
  return { path: checkout.path, primary: checkout.primary };
}

/**
 * Project registered topology into the observation-only corroboration shape.
 * @param checkout - Complete registered worktree observation.
 * @returns Observed branch, HEAD, and detached facts.
 */
export function projectCheckoutCorroborationTopology(checkout: RegisteredWorktree): CheckoutCorroborationTopology {
  return { branch: checkout.branch, head: checkout.head, detached: checkout.detached };
}
