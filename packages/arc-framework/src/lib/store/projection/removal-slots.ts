/** Bind checkout retirement to the command's resolved Store and authority. */
import type { ProjectionRemovalSlots } from "../../git/worktree-removal.js";
import { passingProjectionRemovalSlots } from "../../git/worktree-removal.js";
import type { ProjectionPersistContext } from "./removal-persist.js";
import { checkProjectionRemoval } from "./removal-check.js";
import { persistProjectionRemoval } from "./removal-persist.js";
import { releaseProjectionRemoval } from "./removal-release.js";
import { SlugSchema } from "../../kernel/index.js";
import { projectionProcessState } from "./process-state.js";
import { canonicalCheckout } from "./checkout-identity.js";

/** A resolved Store with a command identity that can still be unavailable. */
export interface ProjectionRemovalSlotInput extends Omit<ProjectionPersistContext, "identity"> {
  readonly identity: string | null;
}

/** Compose all three removal slots over one command's Store. */
export function createProjectionRemovalSlots(input: ProjectionRemovalSlotInput): ProjectionRemovalSlots {
  if (!input.store.capabilities.stateOffBranch) return passingProjectionRemovalSlots;
  const identity = SlugSchema.safeParse(input.identity);
  const context: ProjectionPersistContext = { ...input, identity: identity.success ? identity.data : null,
    mint: input.mint ?? projectionProcessState().command?.mint };
  return {
    check: async (checkout, disposition) => checkProjectionRemoval(await canonicalCheckout(checkout), context, disposition),
    persist: async checkout => persistProjectionRemoval(await canonicalCheckout(checkout), context),
    release: async (checkout, primary) => releaseProjectionRemoval(await canonicalCheckout(checkout), primary, context),
  };
}
