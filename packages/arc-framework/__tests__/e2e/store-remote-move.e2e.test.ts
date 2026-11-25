/** Remote migration control-ref replacement through the real CLI and actual Git receivers. */
import { join } from "node:path";
import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { runArcNoTty } from "./helpers.js";

it("replaces an ancestral forwarding record with a real remote copy", async () => {
  const h = await refSyncFixture(), destination = join(h.a.root, "destination.git");
  const projectId = "34567890-1234-4234-8234-123456789abc";
  const identity = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
  success(await h.a.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId }),
    provenance: { verb: "init", lifecycleAction: "seed" } }));
  expect(success(await h.a.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  const registryCommit = (await h.a.git(["rev-parse", "refs/arc/project/registry"])).stdout.trim();
  await h.a.exec("git", ["init", "--bare", destination]);
  await h.a.exec("git", ["remote", "add", "destination", destination]);
  await h.a.exec("git", ["config", "remote.destination.arc-state", "off"]);
  const moved = await plantRef(destination, "refs/arc/project/moved", [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit }) }], { gitDir: destination });
  const result = await runArcNoTty(["store", "migrate", "--to", "destination", "--json"], h.a.root);
  const envelope = JSON.parse(result.stdout);
  expect(envelope.status, result.stdout).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.a.exec("git", [`--git-dir=${destination}`, "for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  const landed = (await h.a.exec("git", [`--git-dir=${destination}`, "rev-parse", "refs/arc/project/registry"])).stdout.trim();
  expect(landed).not.toBe(registryCommit);
  expect(JSON.parse((await h.a.exec("git", [`--git-dir=${destination}`, "show", `${landed}:identity.json`])).stdout)).toEqual({ projectId });
  expect((await h.a.exec("git", ["rev-parse", "refs/arc/tmp/migrate/deleted-record"])).stdout.trim()).toBe(moved.tip);
}, 45_000);
