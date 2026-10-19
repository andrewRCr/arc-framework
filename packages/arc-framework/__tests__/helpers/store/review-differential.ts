/** Real repository scenarios compared across repository and reference operational backends. */
import { canonicalize } from "../../../src/lib/kernel/index.js";
import { setupMultiClone } from "../multi-clone.js";
import { makeGitExec, makeGitExecInput } from "../integration.js";
import { createReviewHarness } from "./review-harness.js";
import { createStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import type { ReviewInvocationInput } from "../../../src/scripts/review-gate/runtime/invocation.js";
import type { ReviewOutcomePassCounts } from "../../../src/lib/store/kinds/review/outcome/counts.js";

/** Independent clones share operational reference state while retaining actual Git boundaries. */
export async function createReviewRepositoryHarness() {
  const clones = await setupMultiClone();
  const reference = createReviewHarness();
  const clone = (cwd: string): ReviewInvocationInput => ({ cwd, exec: makeGitExec(cwd),
    store: reference.store, projectId: reference.projectId });
  const native = clone(clones.cloneB), secondNative = clone(clones.cloneA);
  const inRepo: ReviewInvocationInput = { cwd: clones.cloneA, exec: makeGitExec(clones.cloneA) };
  inRepo.store = createStore(createDefaultStorePorts({ checkoutRoot: inRepo.cwd, exec: inRepo.exec }));
  return { ...clones, reference, inRepo, native, secondNative,
    seedErrandRef: async (record: Parameters<typeof reference.seedErrand>[0], identity: string, cwd = clones.cloneB) => {
      const { hashBlob, writeTreeCommit } = await import("../../../src/lib/errand/ref-tree.js");
      const { serializeTransientIdentityRecord } = await import("../../../src/lib/errand/identity-record.js");
      const exec = makeGitExec(cwd), execInput = makeGitExecInput(cwd);
      const blob = await hashBlob(execInput, serializeTransientIdentityRecord(record));
      await writeTreeCommit({ exec, execInput, identity }, new Map([[record.slug, blob]]), "Seed review Errand", [], null);
    },
  };
}

/** Run independently derived observations on each backend and retain their exact comparison. */
export async function compareReviewImplementations(harness: Awaited<ReturnType<typeof createReviewRepositoryHarness>>,
  scenario: { inRepo(input: ReviewInvocationInput): Promise<ReviewOutcomePassCounts>;
    native(input: ReviewInvocationInput): Promise<ReviewOutcomePassCounts> }) {
  const inRepo = await scenario.inRepo(harness.inRepo);
  const native = await scenario.native(harness.native);
  if (canonicalize(inRepo) !== canonicalize(native)) throw new Error(
    `review observations differ: in-repo ${canonicalize(inRepo)}; native ${canonicalize(native)}`);
  return { inRepo, native };
}
