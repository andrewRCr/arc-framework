/** The active reader preserves legacy bytes while its default root delegates through operational state. */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { parseMetaFile, readActiveMetaCandidates } from "../../../src/lib/active/meta-reader.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { inRepoStoreAt } from "../../helpers/store/in-repo-ports.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-current-delegate-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const root = join(cwd, ".arc/active");
  await mkdir(root, { recursive: true });
  return { cwd, root };
}

/** A meta whose branch and soft fields hold `sentinel`. */
function sentinelMeta(sentinel: string): string {
  return makeMetaFixture("example", { branch: "feat/example" })
    .replace("`feat/example`", sentinel).replace("- **Design:** [none]", `- **Design:** ${sentinel}`)
    .replace("- **Depends On:** [none]", `- **Depends On:** ${sentinel}`)
    .replace("- **Current Workflow:** [none]", `- **Current Workflow:** ${sentinel}`)
    .replace("- **Next Task:** [none]", `- **Next Task:** ${sentinel}`)
    .replace("- **Task List:** `tasks-example.md`", `- **Task List:** ${sentinel}`);
}

describe("active-meta store delegate", () => {
  // A symbolic link under the default root is the in-repo implementation's flat scan.
  it("excludes a symlink under an explicitly passed default root", async () => {
    const h = await fixture();
    const outside = join(h.cwd, "elsewhere.md");
    await writeFile(outside, makeMetaFixture("example"));
    await symlink(outside, join(h.root, "meta-example.md"));
    expect(await readActiveMetaCandidates(h.cwd, { rootSegments: [".arc", "active"], store: inRepoStoreAt(h.cwd) }))
      .toEqual({ layout: "full", candidates: [], warnings: [] });
  });

  it("preserves [none] fields through the held meta's store record", async () => {
    const h = await fixture();
    const content = sentinelMeta("[none]");
    const store = createLifecycleHarness();
    const record = await store.seed(RecordReferenceSchema.parse({ kind: "work-item/meta",
      owner: { type: "work-item", name: "example" } }), content, { kind: "active" });
    await writeWorktreeMarker(h.cwd, { spawnedByArc: false, createdFor: boundWorkUnitSubject(record),
      spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
    const expected = { path: ".arc/active/meta-example.md", filename: "meta-example.md", ...parseMetaFile(content), integrationBoundary: null };
    expect(await readActiveMetaCandidates(h.cwd, { store: store.store }))
      .toMatchObject({ layout: "full", candidates: [expected], warnings: [] });
  });

  // The store refuses these sentinels, so only the in-repo implementation's tracked files hold them.
  it.each(["[none associated]", "—", "[TBD]"])("preserves %s fields while semantic parsing may reject Design and Depends On", async (sentinel) => {
    const h = await fixture();
    const content = sentinelMeta(sentinel);
    await writeFile(join(h.root, "meta-example.md"), content);
    const expected = { path: ".arc/active/meta-example.md", filename: "meta-example.md", ...parseMetaFile(content), integrationBoundary: null };
    expect(await readActiveMetaCandidates(h.cwd, { store: inRepoStoreAt(h.cwd) }))
      .toEqual({ layout: "full", candidates: [expected], warnings: [] });
  });

  // A status file beside the metas is the in-repo implementation's flat root.
  it("reads the held meta and ignores malformed status.md bytes", async () => {
    const h = await fixture();
    const content = makeMetaFixture("example");
    await writeFile(join(h.root, "status.md"), "not a metadata record");
    await writeFile(join(h.root, "meta-example.md"), content);
    const expected = { path: ".arc/active/meta-example.md", filename: "meta-example.md", ...parseMetaFile(content), integrationBoundary: null };
    expect(await readActiveMetaCandidates(h.cwd, { store: inRepoStoreAt(h.cwd) })).toEqual({ layout: "full", candidates: [expected], warnings: [] });
  });

  it("keeps the contributor root's legacy symlink scan", async () => {
    const h = await fixture();
    const content = makeMetaFixture("example");
    await writeFile(join(h.root, "meta-example.md"), content);
    const contributor = join(h.cwd, ".arc/user/andrew/active");
    await mkdir(contributor, { recursive: true });
    await symlink(join(h.root, "meta-example.md"), join(contributor, "meta-example.md"));
    expect(await readActiveMetaCandidates(h.cwd, { rootSegments: [".arc", "user", "andrew", "active"] })).toMatchObject({ layout: "full",
      candidates: [{ path: ".arc/user/andrew/active/meta-example.md", filename: "meta-example.md" }] });
  });

});
