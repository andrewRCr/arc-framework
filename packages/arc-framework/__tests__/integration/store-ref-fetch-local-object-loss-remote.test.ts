import { expect, it } from "vitest";

import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { provenance } from "../helpers/store/remote-move.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

type LocalLoss = "none" | "parent" | "grandparent" | "code shared" | "code unvisited";

async function recentLocalChain(h: RefSyncFixture, loss: Exclude<LocalLoss, "none">) {
  const ref = loss.startsWith("code") ? "refs/heads/recent-local"
    : "refs/arc/work/12345678-1234-4234-8234-123456789abc";
  const scope = h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [];
  await h.b.git(["config", "core.commitGraph", "false"]);
  const { tree } = await plantRef(h.b.root, ref, [], { gitDir: h.b.gitDir });
  const latest = Math.max(...(await h.b.git(["log", "--format=%ct", "--all"])).stdout.trim().split("\n").map(Number));
  let tip = "", missing = "", bytes = Buffer.alloc(0);
  for (let index = 0; index < (loss === "grandparent" ? 3 : 2); index++) {
    // Fetch's recent-commit traversal must reach this chain before its older tracking tips.
    const date = latest + 1 + index;
    const content = Buffer.from(`tree ${tree}\n${tip ? `parent ${tip}\n` : ""}author Local Writer <local@example.test> ${date} +0000\ncommitter Local Writer <local@example.test> ${date} +0000\n\nRecent local commit ${index}\n`);
    const written = await h.b.ports.rawExec([...scope, "hash-object", "-t", "commit", "-w", "--stdin"], { input: content });
    tip = Buffer.from(written.stdout).toString().trim();
    if (index === 0) { missing = tip; bytes = content; }
  }
  await h.b.git(["update-ref", ref, tip]);
  // A state ref sharing code ancestry makes the fetch read that code history during negotiation.
  if (loss === "code shared") await h.b.git(["update-ref", "refs/arc/work/12345678-1234-4234-8234-123456789abc", tip]);
  return { scope, missing, bytes };
}

it.each((["default", "separate"] as const).flatMap(layout => (["none", "parent", "grandparent", "code shared", "code unvisited"] as const).map(loss => ({ layout, loss }))))(
  "keeps remote send failure evidence beside $loss local loss in $layout and resumes after both repairs", async ({ layout, loss }) => {
  const h = await refSyncFixture(layout);
  const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "remote-missing.md" });
  const common = RecordReferenceSchema.parse({ ...reference, key: "common.md" });
  success(await h.a.store.write({ action: "put", reference: common, expected: null, content: "Common state.\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const local = loss === "none" ? undefined : await recentLocalChain(h, loss);
  const content = "Unique unsent remote data.\n";
  success(await h.a.store.write({ action: "put", reference, expected: null, content, provenance }));
  success(await h.a.store.push());
  const home = expandStoredPath(reference);
  const remoteMissing = (await h.remote("git", ["rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
  const remoteScope = [`--git-dir=${h.origin}`];
  const remoteBytes = (await h.a.ports.rawExec([...remoteScope, "cat-file", "blob", remoteMissing])).stdout;
  await removeLooseObject(h.origin, remoteMissing, h.origin);
  await expect(h.remote("git", ["cat-file", "-e", remoteMissing])).rejects.toBeDefined();
  if (local) await removeLooseObject(h.b.root, local.missing, h.b.gitDir);
  const tips = (await h.b.git(["for-each-ref", "--format=%(objectname)"])).stdout;
  const checked = await h.b.ports.exec("git", [...h.b.gitDir ? [`--git-dir=${h.b.gitDir}`] : [], "cat-file", "--batch-check"], { input: tips });
  expect(checked.stdout).not.toContain(" missing");
  const result = success(await h.b.store.pull());
  const failed = result.pulls[0];
  const namedLocal = local && loss !== "code unvisited";
  expect(failed).toMatchObject({ status: "failed", failure: {
    code: namedLocal ? "refused" : "unreachable", condition: expect.stringContaining(remoteMissing),
  } });
  if (failed?.status !== "failed") throw new Error("Expected a failed fetch");
  expect(failed.failure.condition).toMatch(/remote: (?:error|fatal):/u);
  if (local) {
    if (namedLocal) {
      expect(failed.failure).toMatchObject({ class: "terminal", condition: expect.stringContaining(`commit ${local.missing}`),
        remedy: { text: expect.stringMatching(/restore/iu) } });
      expect(failed.failure.condition).toContain(`Could not read ${local.missing}`);
    } else {
      expect(failed.failure.condition).not.toContain(local.missing);
      expect(failed.failure).toMatchObject({ class: "recoverable", remedy: { text: expect.stringMatching(/connectivity/iu) } });
    }
    const restored = await h.b.ports.rawExec([...local.scope, "hash-object", "-t", "commit", "-w", "--stdin"], { input: local.bytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(local.missing);
    expect(success(await h.b.store.pull()).pulls).toMatchObject([{ status: "failed", failure: {
      code: "unreachable", condition: expect.stringContaining(remoteMissing),
    } }]);
  } else expect(failed.failure).toMatchObject({ class: "recoverable", remedy: { text: expect.stringMatching(/connectivity/iu) } });
  const restored = await h.a.ports.rawExec([...remoteScope, "hash-object", "-w", "--stdin"], { input: remoteBytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(remoteMissing);
  expect(success(await h.b.store.pull()).pulls).toMatchObject([{ status: "pulled" }]);
  expect(success(await h.b.store.read({ reference })).content).toBe(content);
}, 60_000);
