import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { isGitProcessError } from "../../src/lib/git/process-error.js";

const provenance = { verb: "edit", lifecycleAction: "save" };

async function raceFixture(layout: "default" | "separate", operation: "create" | "update" | "delete") {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put",
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "receiver-race" } }),
    expected: null, content: makeMetaFixture("receiver-race"), placement: { kind: "active" }, provenance }));
  if (!("uid" in made.reference.owner)) throw new Error("Missing work item UID");
  const ref = `refs/arc/work/${made.reference.owner.uid}`, history = ref.replace("refs/arc/", "refs/arc/history/");
  if (operation === "create") {
    await h.a.git(["push", h.remoteName, `${ref}:refs/test/base`]);
    await h.b.git(["fetch", "--no-tags", h.remoteName, `refs/test/base:${ref}`]);
  } else { success(await h.a.store.push()); success(await h.b.store.pull()); }
  let other = "";
  if (operation !== "update") {
    const before = success(await h.b.store.read({ reference: made.reference }));
    success(await h.b.store.write({ action: "put", reference: before.reference, expected: before.version,
      placement: before.placement, content: `${before.content}\nReceiver-side edit.\n`, provenance }));
    other = (await h.b.git(["rev-parse", ref])).stdout.trim();
    await h.b.git(["push", h.remoteName, `${ref}:refs/test/receiver-edit`]);
  }
  const before = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
    content: `${before.content}\nLocal edit.\n`, placement: operation === "delete"
      ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") } : before.placement, provenance }));
  const marker = join(h.origin, "race-done"), hook = join(h.origin, "hooks", "update");
  const mutation = operation === "update" ? 'git update-ref -d "$1" "$2"' : `git update-ref "$1" '${other}' "$2"`;
  await writeFile(hook, `#!/bin/sh
if test "$1" = '${ref}' && ! test -f '${marker}'; then
  ${mutation} || exit 2
  printf done > '${marker}'
fi
exit 0
`, { mode: 0o755 });
  return { ...h, made, ref, history, other };
}

describe.each(["default", "separate"] as const)("receiver commit races in the %s layout", (layout) => {
  it.each(["create", "update", "delete"] as const)("settles a leased %s after the update hook changes its receiver tip", async (operation) => {
    const h = await raceFixture(layout, operation);
    let observed: string | undefined, porcelain = "";
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      if (observed !== undefined || !args.includes("push")) return h.a.ports.exec(command, args, options);
      try { return await h.a.ports.exec(command, args, options); }
      catch (error) {
        observed = (await h.remote("git", ["for-each-ref", "--format=%(objectname)", h.ref])).stdout.trim();
        if (isGitProcessError(error)) porcelain = error.stdout;
        throw error;
      }
    } });
    const result = success(await store.push());
    expect(observed).toBe(operation === "update" ? "" : h.other);
    expect(porcelain).toContain("[remote rejected]");
    expect(result.publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect(result.publishes.some((row) => "retryCount" in row && row.retryCount > 0)).toBe(true);
    success(await h.b.store.pull());
    const current = success(await h.b.store.read({ reference: h.made.reference }));
    expect(current.placement).toMatchObject({ kind: operation === "delete" ? "completed" : "active" });
    const history = success(await h.b.store.history({ reference: h.made.reference }));
    expect(history.some(({ content }) => content?.includes("Local edit."))).toBe(true);
    if (operation !== "update") {
      expect(history.some(({ content }) => content?.includes("Receiver-side edit."))).toBe(true);
      const tip = (await h.remote("git", ["rev-parse", operation === "delete" ? h.history : h.ref])).stdout.trim();
      await h.a.git(["merge-base", "--is-ancestor", h.other, tip]);
    }
    if (operation === "delete") expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", h.ref])).stdout).toBe("");
  });
});
