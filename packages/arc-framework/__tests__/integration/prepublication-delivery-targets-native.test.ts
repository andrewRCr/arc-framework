/** Native prepublication composes real delivery targets without projected lifecycle directories. */
import { access, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { createNativeDeliveryReviewRepository } from "../helpers/store/native-delivery-repository.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import { createPrePublicationCompositionDependencies } from "../../src/scripts/review-gate/policy/pre-publication-composition.js";

it("composes native delivery review targets without creating a lifecycle directory", async () => {
  const h = await createNativeDeliveryReviewRepository();
  const states = new RepositoryDeliveryStateStore(new RepositoryGitCommonStatePublisher(h.realExec, h.cwd));
  expect(await states.remove(h.plan.planId, h.stateRevision)).toMatchObject({ status: "ok", value: { removed: true } });
  const commonDir = await h.git("rev-parse", "--git-common-dir");
  for (const [index, member] of h.plan.members.entries()) {
    const head = h.heads[index]!;
    await h.git("update-ref", `refs/arc/delivery-candidates/${h.plan.planId}/${member.chunkKey}`, head);
    const gatePath = resolve(h.cwd, commonDir, "arc", "delivery-gates", h.plan.planId, member.chunkKey);
    await mkdir(dirname(gatePath), { recursive: true });
    await h.git("worktree", "add", "--detach", gatePath, head);
  }
  await expect(access(join(h.cwd, ".arc/active"))).rejects.toMatchObject({ code: "ENOENT" });
  const result = await createPrePublicationCompositionDependencies({ ...h.native, workItem: h.primary.reference.owner })
    .readDeliveryReviewTargets("example");
  expect(result, JSON.stringify(result)).toMatchObject({ status: "composed", planId: h.plan.planId,
    targets: h.heads.map(head => ({ target: { kind: "delivery-member", headSha: head }, vehicle: { kind: "delivery-member", head } })) });
  await expect(access(join(h.cwd, ".arc/active"))).rejects.toMatchObject({ code: "ENOENT" });
}, 30_000);
