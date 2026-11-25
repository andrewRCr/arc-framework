/** Candidate registry faults retain their origin and an executable repair route. */

import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const identity = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
const projectId = "34567890-1234-4234-8234-123456789abc";
const registry = "refs/arc/project/registry";

it.each([
  { layout: "default", object: "blob" },
  { layout: "separate", object: "tree" },
] as const)("repairs a missing candidate $object in the $layout layout before retrying designation", async ({ layout, object }) => {
  const h = await refSyncFixture(layout);
  for (const checkout of [h.a, h.b]) success(await checkout.store.write({ action: "put", reference: identity,
    expected: null, content: JSON.stringify({ projectId }), provenance: { verb: "init", lifecycleAction: "seed" } }));
  await h.a.git(["push", h.remoteName, "refs/arc/*:refs/arc/*"]);
  await h.b.git(["config", "--unset", `remote.${h.remoteName}.arc-state`]);
  // An unconfigured backing candidate is fetched by its pointer URL, before its alias exists.
  if (layout === "separate") await h.b.git(["remote", "remove", "backing"]);
  await h.b.git(["config", "fetch.unpackLimit", "100000"]);
  const before = (await h.b.git(["rev-parse", registry])).stdout.trim();
  let armed = true, candidate = "", missing = "", target = "";
  const ports = { ...h.b.ports, backingRepository: async () => layout === "separate" ? h.origin : null,
    exec: async (...args: Parameters<typeof h.b.ports.exec>) => {
      const result = await h.b.ports.exec(...args);
      if (armed && args[1].includes("fetch") && args[2]?.input?.includes(":refs/arc/tmp/designate/")) {
        armed = false;
        candidate = (await h.b.git(["rev-parse", `refs/arc/tmp/designate/${h.remoteName}/registry`])).stdout.trim();
        target = args[1][args[1].lastIndexOf("--") + 1] ?? "";
        missing = (await h.b.git(["rev-parse", object === "blob" ? `${candidate}:identity.json` : `${candidate}^{tree}`])).stdout.trim();
        await removeLooseObject(h.b.root, missing, h.b.gitDir);
      }
      return result;
    } };
  const invoke = async () => (await invokeStoreRemote([h.remoteName, "push"], { cwd: h.b.root, ports })).result;
  const result = await invoke();
  expect(armed).toBe(false);
  await expect(h.b.git(["cat-file", "-e", missing])).rejects.toMatchObject({ exitCode: 1 });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
    code: "refused", condition: expect.stringContaining(`Candidate registry ${candidate} from remote ${h.remoteName}`),
  } } });
  if (result.status !== "refused" || result.refusal.code !== "store" || result.refusal.refusal.code !== "refused") {
    throw new Error(`Expected candidate refusal: ${JSON.stringify(result)}`);
  }
  const failure = result.refusal.refusal;
  expect(failure.condition).toContain(object === "blob" ? missing : "captured tree is unavailable");
  expect((await h.b.git(["rev-parse", registry])).stdout.trim()).toBe(before);
  await expect(h.b.git(["config", "--get", `remote.${h.remoteName}.arc-state`])).rejects.toMatchObject({ exitCode: 1 });
  expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/designate/"])).stdout).toBe("");
  expect(target).toBe(layout === "separate" ? h.origin : h.remoteName);
  const argv = ["git", ...h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [], "fetch", "--refetch", "--", target, registry];
  expect(failure.remedy.argv).toEqual(argv);
  expect(failure.remedy.text).toContain("--refetch");
  await h.b.exec("git", failure.remedy.argv!.slice(1));
  await h.b.git(["cat-file", "-e", missing]);
  expect(await invoke()).toMatchObject({ status: "ok" });
  expect((await h.b.git(["config", `remote.${h.remoteName}.arc-state`])).stdout.trim()).toBe("push");
});

it("repairs an unparseable candidate on its remote registry before retrying designation", async () => {
  const h = await refSyncFixture();
  for (const checkout of [h.a, h.b]) success(await checkout.store.write({ action: "put", reference: identity,
    expected: null, content: JSON.stringify({ projectId }), provenance: { verb: "init", lifecycleAction: "seed" } }));
  const original = (await h.a.git(["rev-parse", registry])).stdout.trim();
  const rows = (await h.a.git(["ls-tree", "-r", "--format=%(objectname) %(path)", original])).stdout.trim().split("\n");
  const entries = rows.map(row => ({ path: row.slice(row.indexOf(" ") + 1), oid: row.slice(0, row.indexOf(" ")), mode: "100644" as const }));
  await plantRef(h.a.root, registry, entries.map(entry => entry.path === "identity.json"
    ? { path: entry.path, content: "{ malformed identity\n" } : entry), { parents: [original] });
  await h.a.git(["push", h.remoteName, "refs/arc/*:refs/arc/*"]);
  const candidate = (await h.remote("git", ["rev-parse", registry])).stdout.trim();
  await h.b.git(["config", "--unset", `remote.${h.remoteName}.arc-state`]);
  const invoke = async () => (await invokeStoreRemote([h.remoteName, "push"], { cwd: h.b.root, ports: h.b.ports })).result;
  expect(await invoke()).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
    code: "refused", condition: `Candidate registry ${candidate} from remote origin: The project identity must contain exactly projectId with a lowercase UUID value.`,
    remedy: { text: expect.stringContaining("Repair identity.json on origin's refs/arc/project/registry") },
  } } });
  await expect(h.b.git(["config", "--get", "remote.origin.arc-state"])).rejects.toMatchObject({ exitCode: 1 });
  await plantRef(h.a.root, registry, entries, { parents: [candidate] });
  await h.a.git(["push", h.remoteName, "refs/arc/*:refs/arc/*"]);
  expect(await invoke()).toMatchObject({ status: "ok" });
  expect((await h.b.git(["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
});
