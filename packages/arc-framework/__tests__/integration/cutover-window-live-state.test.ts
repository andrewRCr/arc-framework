/** Live membership uses the import's native composition, including branch-only and unarchived records. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seedImportArchives } from "../helpers/store/import-archives.js";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { createWindowImportContext } from "../../src/scripts/cutover-window/import-context.js";
import { readWindowLiveState } from "../../src/scripts/cutover-window/live-state.js";
import { readWindowCheckouts } from "../../src/scripts/cutover-window/checkouts.js";
import { seedTransients, ordinaryErrand } from "../helpers/store/import-transients.js";
import { hashBlob, writeTreeCommit } from "../../src/lib/errand/ref-tree.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { acquireWindowOriginRefs } from "../../src/scripts/cutover-window/hold.js";
import { createWindowHost } from "../../src/scripts/cutover-window/native-host.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { listWindowRefs } from "../../src/scripts/cutover-window/git.js";

async function inspectLive(h: Awaited<ReturnType<typeof windowFixture>>) {
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runWindow(["check", "--repo", h.root, "--json"], { check: async ({ repo }) => {
    const context = await createWindowImportContext(repo);
    const io = { repo, exec: context.exec };
    const refs = await listWindowRefs(io, ["refs/heads/", "refs/remotes/origin/"]);
    const tips = (prefix: string) => Object.fromEntries([...refs].filter(([ref]) => ref.startsWith(prefix) && ref !== "refs/remotes/origin/HEAD")
      .map(([ref, tip]) => [ref.slice(prefix.length), tip]));
    const state = await readWindowLiveState(context, await readWindowCheckouts(io), { local: tips("refs/heads/"), origin: tips("refs/remotes/origin/") });
    return { operation: "check", status: "reported", findings: [], data: { branches: state.branches,
      selected: [...state.composition.recordsBySlug].map(([slug, row]) => ({ slug, location: row.selected.location, state: row.selected.state })) } };
  } }, { stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); } });
  return { exit, result: JSON.parse(stdout.join("")) as unknown, report: stderr.join("") };
}

it("keeps a contained but unarchived unit and a branch-only active meta live while excluding archived membership", async () => {
  const h = await windowFixture();
  const merged = ".arc/active/meta-merged.md";
  await writeFile(join(h.root, merged), makeMetaFixture("merged", { state: "Integrating", owner: "andrew", branch: "feat/merged" }));
  await h.git("git", ["add", merged]); await h.git("git", ["commit", "-m", "Keep an unarchived merged record"]);
  const contained = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["branch", "feat/merged", contained]);
  await h.git("git", ["checkout", "-b", "feat/leftover"]);
  const leftover = ".arc/active/meta-leftover.md";
  await writeFile(join(h.root, leftover), makeMetaFixture("leftover", { owner: "andrew", branch: "feat/leftover" }));
  await h.git("git", ["add", leftover]); await h.git("git", ["commit", "-m", "Keep a branch-only active record"]);
  const branchOnly = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["checkout", "main"]);
  await seedImportArchives(h.root, h.git);
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const observed = await inspectLive(h);
  expect(observed, observed.report).toMatchObject({ exit: 0, result: { status: "reported", data: {
    selected: expect.arrayContaining([
      { slug: "merged", location: "active", state: "Integrating" },
      expect.objectContaining({ slug: "leftover", location: "active" }),
      expect.objectContaining({ slug: "archived", location: "completed" }),
    ]), branches: {
      "feat/merged": { local: contained, origin: null, reasons: expect.arrayContaining([expect.stringContaining("merged")]) },
      "feat/leftover": { local: branchOnly, origin: null, reasons: expect.arrayContaining([expect.stringContaining("leftover")]) },
    },
  } } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
}, 30_000);

it("keeps an all-stale unit's branch through the composition's named warnings", async () => {
  const h = await windowFixture();
  await h.git("git", ["branch", "-m", "feat/alpha", "feat/stale"]);
  await h.git("git", ["push", "origin", ":refs/heads/feat/alpha"]);
  await h.git("git", ["update-ref", "-d", "refs/remotes/origin/feat/alpha"]);
  await h.git("git", ["checkout", "feat/stale", "--", ".arc/active/meta-alpha.md"]);
  await h.git("git", ["commit", "-m", "Keep the base meta while its linked branch is absent"]);
  const tip = (await h.git("git", ["rev-parse", "feat/stale"])).stdout.trim();
  const observed = await inspectLive(h);
  expect(observed, observed.report).toMatchObject({ exit: 0, result: { status: "reported", data: {
    selected: expect.arrayContaining([expect.objectContaining({ slug: "alpha", location: "active" })]),
    branches: { "feat/stale": { local: tip, origin: null, reasons: expect.arrayContaining([expect.stringContaining("stale branch copy")]) } },
  } } });
}, 30_000);

it("reads every identity's held origin Errands without substituting a later remote snapshot", async () => {
  const h = await windowFixture();
  await seedTransients(h, [ordinaryErrand]);
  const other = TransientIdentityRecordSchema.parse({ ...ordinaryErrand, slug: "other", branch: "chore/other", claimId: "2".repeat(32) });
  const held = await seedTransients(h, [other], "alex");
  const ref = "refs/arc/user/alex/errands";
  await h.git("git", ["push", "origin", "refs/arc/user/andrew/errands", ref]);
  await h.git("git", ["update-ref", "-d", ref, held]);
  const ioRead = { repo: h.root, exec: h.git, execInput: h.ports.execInput };
  await acquireWindowOriginRefs(ioRead, await createWindowHost(ioRead).refs(["refs/arc/*"]));
  const acquired = await inspectLive(h);
  expect(acquired, acquired.report).toMatchObject({ exit: 0, result: { data: { branches: {
    "chore/other": { local: expect.any(String), origin: null,
      reasons: expect.arrayContaining(["Errand other (origin refs/arc/user/alex/errands)"]) },
  } } } });
  const io = { exec: h.ports.exec, execInput: h.ports.execInput, identity: "alex" };
  const late = TransientIdentityRecordSchema.parse({ ...other, slug: "late", branch: "chore/late" });
  const blob = await hashBlob(io.execInput, serializeTransientIdentityRecord(late));
  const moved = await writeTreeCommit(io, new Map([[late.slug, blob]]), "Advance origin after hold", [held], null);
  await h.git("git", ["push", `--force-with-lease=${ref}:${held}`, "origin", ref]);
  await h.git("git", ["update-ref", "-d", ref, moved]);
  const observed = await inspectLive(h);
  expect(observed, observed.report).toMatchObject({ exit: 0, result: { data: { branches: {
    "chore/example": { reasons: expect.arrayContaining(["Errand example (local refs/arc/user/andrew/errands)"]) },
    "chore/other": { reasons: expect.arrayContaining(["Errand other (origin refs/arc/user/alex/errands)"]) },
  } } } });
  expect(JSON.stringify(observed.result)).not.toContain("Errand late");
}, 30_000);

it("refuses an invalid held identity and removes its partial hold before a repaired retry", async () => {
  const h = await windowFixture();
  const ref = "refs/arc/user/alex/errands";
  await h.git("git", ["push", "origin", `HEAD:${ref}`]);
  const failed = await checkFixture(h);
  expect(failed, failed.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: ref, condition: expect.stringContaining("incomplete snapshot") }),
  ]) } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout.trim()).toBe("");
  await seedTransients(h, [], "alex");
  await h.git("git", ["push", "--force", "origin", ref]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);
