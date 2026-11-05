/** Persistent native configuration damage must not let acquisition cleanup replace a typed refusal. */
import { join } from "node:path";
import { expect, it } from "vitest";
import { createRefStore, PullResultSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { isCompletedGitFailure } from "../../src/lib/git/process-error.js";
import { completenessFault } from "../helpers/store/completeness-configuration.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { keptPrefix, ordinaryErrand, seedTransients, transientCommon, transientSourceRef } from "../helpers/store/import-transients.js";
import { personal, provenance } from "../helpers/store/remote-move.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["default", "separate"] as const)("returns a typed %s pull failure before repairing persistent configuration", async layout => {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "Published.\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const ref = "refs/arc/user/andrew/personal", first = (await h.remote("git", ["rev-parse", ref])).stdout.trim();
  const current = success(await h.a.store.read({ reference: personal }));
  success(await h.a.store.write({ action: "put", reference: personal, expected: current.version, content: "New published.\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const second = (await h.remote("git", ["rev-parse", ref])).stdout.trim();
  await h.remote("git", ["update-ref", ref, first, second]);
  const pending = RecordReferenceSchema.parse({ ...personal, key: "retained-local.md" });
  success(await h.b.store.write({ action: "put", reference: pending, expected: null, content: "Retained local.\n", provenance }));
  await h.b.exec("git", ["remote", "add", "aaa", join(h.b.root, "unavailable.git")]);
  await h.b.exec("git", ["config", "remote.aaa.arc-state", "read"]);
  const broken = completenessFault(h.b.ports, `refs/arc-remotes/${h.remoteName}/`, "native", true);
  const store = createRefStore(broken.ports);
  try {
    const observed: unknown = await store.pull().catch(error => error);
    expect(broken.evidence(), JSON.stringify(observed)).toMatchObject({ fetched: true, injected: true, restored: false });
    expect(isCompletedGitFailure(broken.evidence().failure)).toBe(true);
    expect(observed).toMatchObject({ status: "ok" });
    if (typeof observed !== "object" || observed === null || !("result" in observed)) throw new Error("Pull returned no result");
    const result = PullResultSchema.parse(observed.result);
    expect(result.pulls).toContainEqual(expect.objectContaining({ remote: "aaa", status: "failed" }));
    expect(result.pulls).toContainEqual(expect.objectContaining({ remote: h.remoteName, status: "failed",
      failure: expect.objectContaining({ code: "refused", remedy: { text: expect.stringContaining("Repair") } }),
      notices: expect.arrayContaining([expect.objectContaining({ kind: "history-diverged", ref })]) }));
  } finally { await broken.repair(); }
  expect(success(await store.read({ reference: personal })).content).toBe("New published.\n");
  const retried = success(await store.pull());
  expect(retried.pulls.find(row => row.remote === h.remoteName)?.status).not.toBe("failed");
  expect(retried.pulls.flatMap(row => row.notices)).toContainEqual(expect.objectContaining({ kind: "history-diverged", ref }));
  expect(success(await store.read({ reference: pending })).content).toBe("Retained local.\n");
  await h.remote("git", ["update-ref", ref, second, first]);
  expect(success(await store.pull()).pulls.find(row => row.remote === h.remoteName)?.notices).toEqual([]);
  expect(success(await store.read({ reference: personal })).content).toBe("New published.\n");
}, 60_000);

it.each((["default", "separate"] as const).flatMap(layout => (["native", "canceled", "signaled", "untyped"] as const)
  .map(kind => ({ layout, kind }))))("preserves $layout import publication $kind failure and retries after repair", async ({ layout, kind }) => {
  const h = await importFixture(layout);
  if (layout === "separate") {
    const scope = [`--git-dir=${join(h.root, ".git/arc/store")}`];
    await h.git("git", ["init", "--bare", "--ref-format=reftable", "--object-format=sha1", join(h.root, ".git/arc/store")]);
    await h.git("git", [...scope, "config", "remote.backing.url", h.origin]);
    await h.git("git", [...scope, "config", "remote.backing.arc-state", "push"]);
  }
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const tip = await seedTransients(h, [ordinaryErrand, { ...transientCommon, kind: "groom", slug: "groom-alpha",
    anchorStub: "alpha", members: ["alpha"], openedBaseHead: head, protection: "partial", branch: null, state: "open", changeRequest: null }]);
  await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  const journal = "refs/arc/tmp/migrate/import-required", prefix = "refs/arc/tmp/migrate/import-published/";
  let keepers = "", required = "", landed = "";
  const scope = layout === "default" ? [] : [`--git-dir=${join(h.root, ".git/arc/store")}`];
  h.ports.migrateStep = async step => {
    if (step !== "import.transient.remote-delete" || keepers) return;
    keepers = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", keptPrefix])).stdout;
    required = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", journal])).stdout;
    landed = (await h.git("git", [...scope, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/work/"])).stdout;
  };
  const broken = completenessFault(h.ports, prefix, kind, true);
  Object.assign(h.ports, broken.ports);
  try {
    const observed: unknown = await h.migrate().catch(error => error);
    expect(broken.evidence(), JSON.stringify(observed)).toMatchObject({ fetched: true, injected: true, restored: false });
    if (kind !== "native") expect(observed).toBe(broken.evidence().failure);
    else {
      expect(isCompletedGitFailure(broken.evidence().failure)).toBe(true);
      expect(observed).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
      remedy: { argv: ["arc", "store", "migrate", "--import"] } } });
    }
  } finally { await broken.repair(); }
  const gathering = (await h.git("git", [...scope, "for-each-ref", "--format=%(refname)", prefix])).stdout;
  if (kind === "native") expect(gathering).not.toBe(""); else expect(gathering).toBe("");
  expect(keepers).toContain(tip); expect(required).not.toBe(""); expect(landed).not.toBe("");
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", keptPrefix])).stdout).toBe(keepers);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", journal])).stdout).toBe(required);
  expect((await h.remote("git", ["rev-parse", transientSourceRef])).stdout.trim()).toBe(tip);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect((await h.git("git", [...scope, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/work/"])).stdout).toBe(landed);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix, journal])).stdout).toBe("");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", transientSourceRef])).stdout).toBe("");
}, 60_000);
