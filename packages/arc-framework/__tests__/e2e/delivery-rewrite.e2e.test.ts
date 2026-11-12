/** Built-CLI rewrites preserve contribution proof and record real remote ref changes. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createNativePublishedDeliveryFixture } from "../helpers/store/native-delivery-refusal.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { runArcWithStdin } from "./helpers.js";

it("rewrites an equivalent published member through the built CLI", async () => {
  const h = await createNativePublishedDeliveryFixture();
  // The subprocess uses the shipped repository backend, so project its work-unit identity onto disk.
  await mkdir(join(h.cwd, ".arc/active"), { recursive: true });
  await writeFile(join(h.cwd, ".arc/active/meta-example.md"), makeMetaFixture("example", {
    branch: h.branches[1]!, owner: "andrew", workClass: "Light",
  }));
  await h.git("add", ".arc/active/meta-example.md");
  await h.git("commit", "-m", "Publish work-unit metadata for the CLI");
  await writeWorktreeMarker(h.cwd, { spawnedByArc: false, spawningIdentity: "andrew",
    createdAt: "2026-11-05T12:00:00Z", createdFor: { kind: "work-unit", name: "example" } });
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
