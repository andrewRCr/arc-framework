/** Candidate designation reports transport-resolution faults without authorizing a role. */
import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { isCompletedGitFailure, isGitProcessError } from "../../src/lib/git/process-error.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import type { RefStorePorts } from "../../src/lib/store/ports.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";

it("reports a failed candidate when its named transport disappears, then designates after repair", async () => {
  const h = await refSyncFixture();
  const reference = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
  const content = JSON.stringify({ projectId: "34567890-1234-4234-8234-123456789abc" }), provenance = { verb: "init", lifecycleAction: "seed" };
  success(await h.a.store.write({ action: "put", reference, expected: null, content, provenance }));
  success(await h.a.store.push());
  success(await h.b.store.write({ action: "put", reference, expected: null, content, provenance }));
  const before = (await h.b.git(["rev-parse", "refs/arc/project/registry"])).stdout;
  await h.b.exec("git", ["config", "remote.origin.arc-state", "off"]);
  await h.b.exec("git", ["remote", "add", "upstream", h.origin]);
  let injected = false, completedFailure = false;
  const ports: RefStorePorts = { ...h.b.ports, exec: async (command, args, options) => {
    const targeted = args.includes("get-url") && args.at(-1) === "upstream";
    if (!injected && targeted) { injected = true; await h.b.exec("git", ["remote", "remove", "upstream"]); }
    try { return await h.b.ports.exec(command, args, options); }
    catch (error) {
      if (injected && targeted) completedFailure = isGitProcessError(error) && isCompletedGitFailure(error);
      throw error;
    }
  } };
  const designate = async () => (await invokeStoreRemote(["upstream", "push", "--json"], { cwd: h.b.root, ports })).result;
  const held = await designate();
  expect(injected).toBe(true); expect(completedFailure).toBe(true);
  expect(held).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "refused",
    condition: expect.stringContaining("upstream"), remedy: { text: expect.stringMatching(/repair.*URL/iu) } } } });
  expect((await h.b.git(["rev-parse", "refs/arc/project/registry"])).stdout).toBe(before);
  await h.b.exec("git", ["remote", "add", "upstream", h.origin]);
  expect(await designate()).toMatchObject({ status: "ok" });
  expect((await h.b.exec("git", ["config", "remote.upstream.arc-state"])).stdout.trim()).toBe("push");
  expect(success(await createRefStore(ports).read({ reference })).content).toBe(content);
}, 60_000);
