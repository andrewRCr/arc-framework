/** The quiesce check refuses tracked record changes outside the import's selected read copy. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { listWindowRefs } from "../../src/scripts/cutover-window/git.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { parkedWindowFixture } from "../helpers/cutover-window/parked.js";
import { readWindowHold } from "../../src/scripts/cutover-window/hold.js";
import { isCompletedGitFailure, isGitProcessError } from "../../src/lib/git/process-error.js";

async function carryMainToFlip(h: Awaited<ReturnType<typeof windowFixture>>) {
  await h.git("git", ["checkout", h.flip.branch]); await h.git("git", ["merge", "--no-edit", "main"]);
  await h.git("git", ["push", "origin", h.flip.branch]); await h.git("git", ["checkout", "main"]);
}

it.each(["edit", "deletion"] as const)("refuses a live branch's %s to another unit's records and passes after it is dropped", async kind => {
  const h = await windowFixture(), path = ".arc/active/notes-alpha.md", branch = "feat/other";
  await h.git("git", ["checkout", "-b", branch]);
  await writeFile(join(h.root, ".arc/active/meta-other.md"), makeMetaFixture("other", { owner: "andrew", branch }));
  if (kind === "edit") await writeFile(join(h.root, path), "# Notes: Alpha\n\nA change outside the read copy.\n");
  else await h.git("git", ["rm", path]);
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Change another unit's records"]);
  await h.git("git", ["push", "--set-upstream", "origin", branch]); await h.git("git", ["checkout", "main"]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining(branch), condition: expect.stringContaining(path) }),
  ]) } });
  expect(await listWindowRefs({ repo: h.root, exec: h.git }, ["refs/arc-window/"])).toEqual(new Map());
  await h.git("git", ["checkout", branch]); await h.git("git", ["checkout", "main", "--", path]);
  await h.git("git", ["commit", "-m", "Drop the non-read copy's change"]);
  await h.git("git", ["push", "origin", branch]); await h.git("git", ["checkout", "main"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("admits parked main and both branch sides with a branch inheriting their pointer absence", async () => {
  const h = await parkedWindowFixture(), inherited = "feat/inherited-park";
  await h.git("git", ["push", "origin", "main"]); await carryMainToFlip(h);
  await h.git("git", ["checkout", "-b", inherited, h.tip]);
  await writeFile(join(h.root, "inherited.txt"), "A commit the forked branch holds alone.\n");
  await h.git("git", ["add", "inherited.txt"]); await h.git("git", ["commit", "-m", "Advance the branch forked after the park"]);
  const inheritedTip = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["push", "--set-upstream", "origin", inherited]); await h.git("git", ["checkout", "main"]);
  const checked = await checkFixture(h);
  expect(checked, checked.report).toMatchObject({ exit: 0, result: { status: "passed" } });
  const held = await readWindowHold({ repo: h.root, exec: h.git, execInput: h.ports.execInput });
  expect(held.record.branches.live[h.branch]).toMatchObject({ local: h.tip, origin: h.tip });
  expect(inheritedTip).not.toBe(h.tip);
  expect(held.record.branches.live[inherited]).toMatchObject({ local: inheritedTip, origin: inheritedTip });
}, 60_000);

it("refuses a live branch deleting a pointer after the park and passes after it is restored", async () => {
  const h = await parkedWindowFixture(), branch = "feat/after-park";
  await h.git("git", ["push", "origin", "main"]); await carryMainToFlip(h);
  await h.git("git", ["checkout", "-b", branch]);
  await writeFile(join(h.root, ".arc/active/meta-other.md"), makeMetaFixture("other", { owner: "andrew", branch }));
  await h.git("git", ["rm", h.pointer]); await h.git("git", ["add", ".arc"]);
  await h.git("git", ["commit", "-m", "Delete the standing parked pointer"]);
  await h.git("git", ["push", "--set-upstream", "origin", branch]); await h.git("git", ["checkout", "main"]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining(branch), condition: expect.stringContaining(h.pointer) }),
  ]) } });
  await h.git("git", ["checkout", branch]); await h.git("git", ["checkout", "main", "--", h.pointer]);
  await h.git("git", ["commit", "-m", "Restore the standing pointer"]);
  await h.git("git", ["push", "origin", branch]); await h.git("git", ["checkout", "main"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses an unresolved parked branch and passes after its local and fetched tips return", async () => {
  const h = await parkedWindowFixture();
  await h.git("git", ["push", "origin", "main"]); await carryMainToFlip(h);
  await h.git("git", ["branch", "-D", h.branch]); await h.git("git", ["update-ref", "-d", `refs/remotes/origin/${h.branch}`]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused" } });
  const findings = (refused.result as { findings: { subject: string; condition: string; remedy: string }[] }).findings;
  expect(findings.filter(finding => finding.subject.includes(h.slug) || finding.condition.includes(h.slug)
    || finding.condition.includes("(unavailable)"))).toEqual([{ subject: `work unit ${h.slug}`,
    condition: `The parked unit has no readable source at ${h.branch}: Branch '${h.branch}' for '${h.slug}' is missing.`,
    remedy: "Restore or realign the parked branch its committed pointer names, or repair the pointer, then retry." }]);
  expect(findings.filter(finding => finding.remedy.includes("migrate --import"))).toEqual([]);
  expect(await listWindowRefs({ repo: h.root, exec: h.git }, ["refs/arc-window/"])).toEqual(new Map());
  await h.git("git", ["branch", h.branch, h.tip]); await h.git("git", ["fetch", "origin"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("checks the named flip branch even when it holds no work-unit metadata", async () => {
  const h = await windowFixture();
  const path = resolveArcPath({ kind: "cohort-document", cohort: [SlugSchema.parse("group")], placement: { kind: "planned" } });
  await h.git("git", ["checkout", h.flip.branch]);
  await writeFile(join(h.root, path), "# Cohort: `group`\n\n**Purpose:** A change only the flip branch holds.\n");
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Change a shared record on the flip"]);
  await h.git("git", ["push", "origin", h.flip.branch]); await h.git("git", ["checkout", "main"]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining(h.flip.branch), condition: expect.stringContaining(path) }),
  ]) } });
  await h.git("git", ["checkout", h.flip.branch]); await h.git("git", ["checkout", "main", "--", path]);
  await h.git("git", ["commit", "-m", "Drop the flip's shared-record change"]);
  await h.git("git", ["push", "origin", h.flip.branch]); await h.git("git", ["checkout", "main"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses changes in a stale branch copy and passes once that copy only inherits the read branch's content", async () => {
  const h = await windowFixture(), path = ".arc/active/notes-alpha.md", branch = "feat/stale";
  await h.git("git", ["checkout", "-b", branch, "feat/alpha"]);
  await writeFile(join(h.root, path), "# Notes: Alpha\n\nA changed stale copy.\n");
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Change stale branch content"]);
  await h.git("git", ["push", "--set-upstream", "origin", branch]);
  await h.git("git", ["checkout", "feat/alpha"]);
  await writeFile(join(h.root, path), "# Notes: Alpha\n\nThe read copy moved after the stale fork.\n");
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Advance the read copy"]);
  await h.git("git", ["push", "origin", "feat/alpha"]); await h.git("git", ["checkout", "main"]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining(branch), condition: expect.stringContaining(path) }),
  ]) } });
  await h.git("git", ["checkout", branch]); await h.git("git", ["checkout", "HEAD~1", "--", path]);
  await h.git("git", ["commit", "-m", "Drop the stale copy's change"]);
  await h.git("git", ["push", "origin", branch]); await h.git("git", ["checkout", "main"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it.each(["edit", "deletion"] as const)("refuses an %s on main until the read branch carries it", async kind => {
  const h = await windowFixture(), path = ".arc/active/notes-alpha.md";
  if (kind === "edit") await writeFile(join(h.root, path), "# Notes: Alpha\n\nMain-side changes after the fork.\n");
  else await h.git("git", ["rm", path]);
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Change the main copy"]);
  await h.git("git", ["push", "origin", "main"]); await carryMainToFlip(h);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: [
    expect.objectContaining({ subject: expect.stringContaining("refs/heads/main"), condition: expect.stringContaining(path) }),
  ] } });
  await h.git("git", ["checkout", "feat/alpha"]); await h.git("git", ["merge", "--no-edit", "main"]);
  await h.git("git", ["push", "origin", "feat/alpha"]); await h.git("git", ["checkout", "main"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses the only stale branch copy after its unit landed and its own branch disappeared", async () => {
  const h = await windowFixture(), path = ".arc/active/notes-alpha.md", branch = "feat/stale";
  await h.git("git", ["checkout", "feat/alpha"]);
  await writeFile(join(h.root, ".arc/active/meta-alpha.md"), makeMetaFixture("alpha", {
    owner: "alex", state: "Integrating", branch: "feat/alpha",
  }));
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Complete the other owner's unit"]);
  await h.git("git", ["push", "origin", "feat/alpha"]); await h.git("git", ["checkout", "main"]);
  await h.git("git", ["merge", "--ff-only", "feat/alpha"]); await h.git("git", ["push", "origin", "main"]);
  await carryMainToFlip(h);
  await h.git("git", ["checkout", "-b", branch]);
  await writeFile(join(h.root, path), "# Notes: Alpha\n\nUnseen work in the only stale copy.\n");
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Change the last stale copy"]);
  await h.git("git", ["push", "--set-upstream", "origin", branch]); await h.git("git", ["checkout", "main"]);
  await writeFile(join(h.root, path), "# Notes: Alpha\n\nMain moved after the stale fork.\n");
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Advance main's copy"]);
  await h.git("git", ["push", "origin", "main"]); await carryMainToFlip(h);
  await h.git("git", ["branch", "-d", "feat/alpha"]); await h.git("git", ["push", "origin", ":refs/heads/feat/alpha"]);
  await h.git("git", ["update-ref", "-d", "refs/remotes/origin/feat/alpha"]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining(branch), condition: expect.stringContaining(path) }),
  ]) } });
  await h.git("git", ["checkout", branch]); await h.git("git", ["checkout", "HEAD~1", "--", path]);
  await h.git("git", ["commit", "-m", "Drop the last stale copy's change"]);
  await h.git("git", ["push", "origin", branch]); await h.git("git", ["checkout", "main"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("carries a changed parked backlog draft by merging main while retaining the branch's pointer absence and metadata", async () => {
  const h = await parkedWindowFixture(), changed = "# Draft: Parked\n\n**Purpose:** Carry a later main edit.\n";
  await writeFile(join(h.root, h.draft), changed);
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Change the parked backlog draft"]);
  await h.git("git", ["push", "origin", "main"]); await carryMainToFlip(h);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining("refs/heads/main"), condition: expect.stringContaining(h.draft) }),
  ]) } });
  await h.git("git", ["checkout", h.branch]);
  const metadata = await readFile(join(h.root, h.active), "utf8");
  try { await h.git("git", ["merge", "--no-commit", "main"]); }
  catch (error) {
    if (!isGitProcessError(error) || !isCompletedGitFailure(error) || error.exitCode !== 1) throw error;
    const conflicts = (await h.git("git", ["diff", "--name-only", "--diff-filter=U"])).stdout.trim().split("\n").filter(Boolean);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.filter(path => ![h.pointer, h.active, h.draft, h.activeDraft].includes(path))).toEqual([]);
  }
  await writeFile(join(h.root, h.active), metadata); await writeFile(join(h.root, h.activeDraft), changed);
  await h.git("git", ["rm", "-f", "--ignore-unmatch", h.pointer, h.draft]); await h.git("git", ["add", h.active, h.activeDraft]);
  expect((await h.git("git", ["diff", "--name-only", "--diff-filter=U"])).stdout).toBe("");
  await h.git("git", ["commit", "-m", "Carry main while retaining parked branch records"]);
  await h.git("git", ["push", "origin", h.branch]); await h.git("git", ["checkout", "main"]);
  expect((await h.git("git", ["show", `${h.branch}:${h.activeDraft}`])).stdout).toBe(changed.trimEnd());
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("admits deleting a resumed unit's pointer on main", async () => {
  const h = await parkedWindowFixture();
  await h.git("git", ["rm", h.pointer]); await h.git("git", ["commit", "-m", "Resume the parked unit"]);
  await h.git("git", ["push", "origin", "main"]); await carryMainToFlip(h);
  const checked = await checkFixture(h);
  expect(checked, checked.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);
