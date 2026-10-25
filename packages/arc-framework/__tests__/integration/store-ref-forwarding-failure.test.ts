/** Failure guidance observes the forwarding state left by the completed fetch. */
import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";

it.each(["default", "separate"] as const)("does not recommend following a forwarding record pruned before a later failure (%s)", async layout => {
  const h = await refSyncFixture(layout), clock = createRefClock(new Date(0), 1);
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "available.md", owner: { type: "person", name: "andrew" } });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Published value.\n",
    provenance: { verb: "save", lifecycleAction: "save" } }));
  success(await h.a.store.write({ action: "put", reference: RecordReferenceSchema.parse({ kind: "project-registry/identity",
    owner: { type: "project", name: "project" } }), expected: null,
    content: JSON.stringify({ projectId: "34567890-1234-4234-8234-123456789abc" }), provenance: { verb: "init", lifecycleAction: "seed" } }));
  success(await h.a.store.push());
  const registryCommit = (await h.remote("git", ["rev-parse", "refs/arc/project/registry"])).stdout.trim();
  const { projectId } = JSON.parse((await h.remote("git", ["show", `${registryCommit}:identity.json`])).stdout) as { projectId: string };
  const ref = "refs/arc/project/moved", tracking = `refs/arc-remotes/${h.remoteName}/project/moved`;
  await plantRef(h.origin, ref, [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit }) }], { gitDir: h.origin });
  expect(success(await h.b.store.pull()).states).toContainEqual(expect.objectContaining({ status: "moved" }));
  expect((await h.b.git(["for-each-ref", "--format=%(refname)", tracking])).stdout.trim()).toBe(tracking);
  await h.remote("git", ["update-ref", "-d", ref]);
  let expire = true;
  const store = createRefStore({ ...h.b.ports, ...clock, exec: async (command, args, options) => {
    const result = await h.b.ports.exec(command, args, options);
    if (expire && args.includes("fetch") && args.some(arg => arg.includes(`:refs/arc-remotes/${h.remoteName}/`))) {
      expire = false;
      clock.advance(119_000);
      for (let reading = 0; reading < 2_000; reading += 1) clock.clock();
    }
    return result;
  } });
  const result = success(await store.pull());
  expect(expire).toBe(false);
  const failure = result.pulls.find(pull => pull.status === "failed");
  expect(failure).toMatchObject({ failure: { code: "unreachable", cause: "timeout" } });
  if (failure?.status !== "failed") throw new Error("Expected a post-fetch timeout");
  expect(failure.failure.remedy.text).not.toContain("arc store migrate");
  expect(failure.failure.remedy.text).not.toContain("State moved");
  expect((await h.b.git(["for-each-ref", "--format=%(refname)", tracking, `refs/arc/tmp/seen/${h.remoteName}/project/moved`])).stdout).toBe("");
  success(await store.pull());
  expect(success(await h.b.store.read({ reference })).content).toBe("Published value.\n");
});
