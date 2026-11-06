import { join } from "node:path";
import { expect, it } from "vitest";

import { PullResultSchema } from "../../src/lib/store/sync.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { provenance } from "../helpers/store/remote-move.js";

it.each(["default", "separate"] as const)("confirms a lost commit when the remote rewinds and builds on it in %s", async layout => {
  const h = await refSyncFixture(layout), ref = "refs/arc/user/andrew/personal";
  const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "shared.md" });
  const late = RecordReferenceSchema.parse({ ...reference, key: "after-rewind.md" });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Common state.\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const missing = (await h.a.git(["rev-parse", ref])).stdout.trim();
  const current = success(await h.a.store.read({ reference }));
  success(await h.a.store.write({ action: "put", reference, expected: current.version, content: "Retained local edit.\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const previous = (await h.a.git(["rev-parse", ref])).stdout.trim();
  await h.a.git(["update-ref", ref, missing, previous]);
  success(await h.a.store.write({ action: "put", reference: late, expected: null, content: "New remote data.\n", provenance }));
  await h.a.git(["push", `--force-with-lease=${ref}:${previous}`, "--", h.origin, `${ref}:${ref}`]);
  const scope = h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [];
  const bytes = (await h.b.ports.rawExec([...scope, "cat-file", "commit", missing])).stdout;
  await removeLooseObject(h.b.root, missing, h.b.gitDir);
  const result = success(await h.b.store.pull());
  expect(result).toMatchObject({ pulls: [{ status: "failed", failure: {
    code: "refused", class: "terminal", condition: expect.stringContaining(`commit ${missing}`),
    remedy: { text: expect.stringMatching(/restore/iu) },
  } }] });
  const failed = result.pulls[0];
  if (failed?.status !== "failed") throw new Error("Expected the rewind fetch to fail");
  expect(failed.failure.condition).toContain("did not send all necessary objects");
  expect(failed.failure.condition).not.toContain("could not parse commit");
  const restored = await h.b.ports.rawExec([...scope, "hash-object", "-t", "commit", "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(missing);
  expect(success(await h.b.store.pull()).pulls).toMatchObject([{ status: "pulled", notices: [expect.objectContaining({ kind: "history-diverged", ref })] }]);
  expect(success(await h.b.store.read({ reference })).content).toBe("Retained local edit.\n");
  expect(await h.b.store.read({ reference: late })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
}, 60_000);

it.each((["default", "separate"] as const).flatMap(layout => (["state", "code", "temporary", "detached HEAD"] as const).map(kind => ({ layout, kind }))))(
  "reports a lost $kind tip in the $layout layout and resumes after restoration", async ({ layout, kind }) => {
  const h = await refSyncFixture(layout);
  const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "incoming.md" });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Incoming state.\n", provenance }));
  success(await h.a.store.push());
  const ref = kind === "state" ? "refs/arc/work/12345678-1234-4234-8234-123456789abc"
    : kind === "temporary" ? "refs/arc/tmp/retained" : "refs/heads/local-fetch-loss";
  const { tip } = await plantRef(h.b.root, ref, [], { gitDir: h.b.gitDir });
  const scope = h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [];
  const bytes = (await h.b.ports.rawExec([...scope, "cat-file", "commit", tip])).stdout;
  const linked = join(h.b.root, "linked worktree");
  if (kind === "detached HEAD") {
    await h.b.git(["worktree", "add", "--detach", linked, tip]);
    await h.b.git(["update-ref", "-d", ref]);
  }
  const key = kind === "detached HEAD" ? `worktree ${linked} HEAD` : ref;
  await removeLooseObject(h.b.root, tip, h.b.gitDir);
  const result = success(await h.b.store.pull());
  expect(result).toMatchObject({ pulls: [{ remote: h.remoteName, status: "failed", failure: {
    code: "refused", class: "terminal", condition: expect.stringContaining(key),
    remedy: { text: expect.stringMatching(/restore/iu) },
  } }] });
  expect(PullResultSchema.safeParse(result).success).toBe(true);
  const restored = await h.b.ports.rawExec([...scope, "hash-object", "-t", "commit", "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(tip);
  expect(success(await h.b.store.pull()).pulls).toEqual([expect.objectContaining({ status: "pulled" })]);
  expect(success(await h.b.store.read({ reference })).content).toBe("Incoming state.\n");
}, 60_000);

it.each(["default", "separate"] as const)("confirms a failed fetch's named missing parent in %s and resumes after restoration", async layout => {
  const h = await refSyncFixture(layout);
  const scope = h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [];
  const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "ancestry.md" });
  const put = async (content: string) => {
    const current = await h.a.store.read({ reference });
    success(await h.a.store.write({ action: "put", reference, expected: current.status === "ok" ? current.result.version : null, content, provenance }));
    success(await h.a.store.push());
  };
  await put("First state.\n");
  success(await h.b.store.pull());
  const missing = (await h.b.git(["rev-parse", "refs/arc/user/andrew/personal"])).stdout.trim();
  await put("Second state.\n");
  success(await h.b.store.pull());
  await put("Third state.\n");
  const bytes = (await h.b.ports.rawExec([...scope, "cat-file", "commit", missing])).stdout;
  await removeLooseObject(h.b.root, missing, h.b.gitDir);
  const result = success(await h.b.store.pull());
  expect(result).toMatchObject({ pulls: [{ status: "failed", failure: {
    code: "refused", class: "terminal", condition: expect.stringContaining(missing),
    remedy: { text: expect.stringMatching(/restore/iu) },
  } }] });
  const failure = result.pulls[0];
  if (failure?.status !== "failed") throw new Error("Expected a failed fetch");
  expect(failure.failure.condition).toMatch(/Could not read|could not parse commit|did not send all necessary objects/u);
  const restored = await h.b.ports.rawExec([...scope, "hash-object", "-t", "commit", "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(missing);
  expect(success(await h.b.store.pull()).pulls).toEqual([expect.objectContaining({ status: "pulled" })]);
  expect(success(await h.b.store.read({ reference })).content).toBe("Third state.\n");
}, 60_000);
