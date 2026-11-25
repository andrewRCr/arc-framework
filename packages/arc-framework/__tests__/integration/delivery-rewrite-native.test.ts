/** Public native rewrites preserve contribution proof while accepting richer delivery coordinates. */
import { expect, it } from "vitest";
import { createNativePublishedDeliveryFixture, invokeNativeDelivery } from "../helpers/store/native-delivery-refusal.js";
import { RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";

it("rewrites an equivalent published member and records the observed coordinates", async () => {
  const h = await createNativePublishedDeliveryFixture();
  const member = h.state.members[0]!;
  if (member.coordinates === null || member.ref === null) throw new Error("Expected a published member");
  const head = await h.git("commit-tree", member.coordinates.tree, "-p", member.coordinates.base,
    "-m", "Recreate the same member contribution");
  expect(head).not.toBe(member.coordinates.head);
  const requested = { target: h.state.target, members: [{ ...member,
    coordinates: { ...member.coordinates, head } }] };
  const result = await invokeNativeDelivery(h, "rewrite", { planId: h.plan.planId,
    deliverableId: member.deliverableId, requested, remote: "origin" });
  expect(result.exits, result.output).toEqual([]);
  expect(result.result, result.output).toMatchObject({ status: "applied", state: { value: {
    activeOperation: null, members: expect.arrayContaining([requested.members[0]]),
  } } });
  const remote = (await h.realExec("git", ["--git-dir", h.origin, "rev-parse", member.ref], { cwd: h.cwd })).stdout.trim();
  expect(remote).toBe(head);
  const stored = await new RepositoryDeliveryStateStore(new RepositoryGitCommonStatePublisher(h.realExec, h.cwd))
    .read(h.plan.planId);
  expect(stored).toMatchObject({ status: "ok", value: { value: {
    activeOperation: null, members: expect.arrayContaining([requested.members[0]]),
  } } });
}, 60_000);
