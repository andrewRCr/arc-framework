/** Built-CLI rewrites preserve contribution proof and record real remote ref changes. */
import { expect, it } from "vitest";
import { createNativePublishedDeliveryFixture } from "../helpers/store/native-delivery-refusal.js";
import { TRANSITION_RECORD_NAMESPACE } from "../../src/lib/work-unit/transition-record-store.js";
import { seedStore } from "../helpers/store/seed-store.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { projectIdentityRecord } from "../../src/lib/store/project-identity.js";
import { RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { runArcWithStdin } from "./store-default.js";

it("rewrites an equivalent published member through the built CLI", async () => {
  const h = await createNativePublishedDeliveryFixture();
  // The fixture's work unit lives in an in-process store, and the subprocess opens the repository's own, which refuses a
  // checkout whose HEAD tracks a transition record: drop the fixture's, then hold the project and work unit there, bound
  // to the checkout in place.
  await h.git("rm", "-r", "-q", "--cached", "--", TRANSITION_RECORD_NAMESPACE);
  await h.git("commit", "-m", "Drop the tracked transition record");
  await seedStore(h.cwd, SlugSchema.parse("andrew"), [projectIdentityRecord(h.projectId)]);
  await seedWorkUnit(h.cwd, "example", { identity: "andrew", branch: h.branches[1]!, bind: h.cwd,
    meta: { branch: h.branches[1]!, owner: "andrew", workClass: "Light" } });
  const member = h.state.members[0]!;
  if (member.coordinates === null || member.ref === null) throw new Error("Expected a published member");
  const head = await h.git("commit-tree", member.coordinates.tree, "-p", member.coordinates.base,
    "-m", "Recreate the same member contribution");
  expect(head).not.toBe(member.coordinates.head);
  const requested = { target: h.state.target, members: [{ ...member,
    coordinates: { ...member.coordinates, head } }] };
  const result = await runArcWithStdin(["delivery", "rewrite", "-"], h.cwd, JSON.stringify({
    planId: h.plan.planId, deliverableId: member.deliverableId, requested, remote: "origin",
  }));
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "applied" });
  expect((await h.realExec("git", ["--git-dir", h.origin, "rev-parse", member.ref], { cwd: h.cwd })).stdout.trim())
    .toBe(head);
  const stored = await new RepositoryDeliveryStateStore(new RepositoryGitCommonStatePublisher(h.realExec, h.cwd))
    .read(h.plan.planId);
  expect(stored).toMatchObject({ status: "ok", value: { value: {
    activeOperation: null, members: expect.arrayContaining([requested.members[0]]),
  } } });
}, 60_000);
