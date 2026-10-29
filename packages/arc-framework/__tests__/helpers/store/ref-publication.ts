/** Bounded continuation of an accepted writer's public publication operation. */
import type { Store, StoreResult, PushResult } from "../../../src/lib/store/index.js";

export async function publishAcceptedWrite(store: Pick<Store, "push">): Promise<{
  publication: StoreResult<PushResult>; publicationAttempts: StoreResult<PushResult>[];
}> {
  const publicationAttempts: StoreResult<PushResult>[] = [];
  for (let attempt = 0; ; attempt += 1) {
    const publication = await store.push();
    publicationAttempts.push(publication);
    if (attempt === 4 || !canContinue(publication)) return { publication, publicationAttempts };
  }
}

function canContinue(publication: StoreResult<PushResult>): boolean {
  if (publication.status !== "ok") return false;
  const { states, carry, pulls, publishes } = publication.result;
  if (states.length || carry || pulls.some(({ notices }) => notices.length)) return false;
  const failures = [...pulls, ...publishes].filter(outcome => outcome.status === "failed");
  return failures.length > 0 && failures.every(({ failure }) => failure.class === "recoverable"
    && (failure.code === "retries-exhausted" || failure.code === "unreachable" && failure.cause === "timeout"))
    && publishes.every(outcome => ["pushed", "reconciled", "noop", "failed"].includes(outcome.status));
}
