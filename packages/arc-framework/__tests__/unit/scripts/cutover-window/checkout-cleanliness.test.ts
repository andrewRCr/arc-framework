/** Checkout cleanliness reads the selected physical checkouts and retains incomplete-read evidence. */
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { classifyWindowCheckout } from "../../../../src/scripts/cutover-window/checkouts.js";
import { readWindowCheckoutStatusFindings, readWindowCheckoutUpstreamFindings, windowPersonalLinkFindings } from "../../../../src/scripts/cutover-window/checkout-cleanliness.js";
import { SlugSchema } from "../../../../src/lib/kernel/schema/slug.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import type { WorktreeMarkerReadResult } from "../../../../src/lib/git/worktree-marker.js";

const repo = resolve("primary");
const marked: WorktreeMarkerReadResult = { kind: "present", marker: { spawnedByArc: true, spawningIdentity: "andrew",
  createdAt: "2026-01-01T00:00:00.000Z", createdFor: { kind: "work-unit", name: "alpha" } } };
const absent: WorktreeMarkerReadResult = { kind: "absent" };
const checkout = (primary: boolean, marker: WorktreeMarkerReadResult) => classifyWindowCheckout({ path: repo,
  head: "a".repeat(40), branch: "main", detached: false, primary, folderPresent: true }, marker);
const statusArgs = ["status", "--porcelain=v1", "-z", "--untracked-files=all"];

it.each([
  { primary: true, marker: absent, stdout: "?? unfinished.txt\0", refuses: true },
  { primary: false, marker: marked, stdout: " M code.ts\0", refuses: true },
  { primary: false, marker: absent, stdout: "?? unfinished.txt\0", refuses: false },
  { primary: true, marker: absent, stdout: "", refuses: false },
])("reports physical dirt only for a selected checkout: %j", async ({ primary, marker, stdout, refuses }) => {
  const boundary = scriptGitExec([{ match: statusArgs, responses: [{ stdout }] }]);
  const findings = await readWindowCheckoutStatusFindings({ repo, exec: boundary.exec }, [checkout(primary, marker)]);
  expect(findings).toEqual(refuses ? [expect.objectContaining({ subject: `${repo} (main)`, condition: expect.stringContaining("dirty") })] : []);
});

it("reports an unreadable checkout and permits a clean read after Git access is repaired", async () => {
  const boundary = scriptGitExec([{ match: statusArgs, responses: [
    { failure: { exitCode: 128, stderr: "fatal: index read denied" } }, { stdout: "" },
  ] }]);
  const io = { repo, exec: boundary.exec }, selected = [checkout(true, absent)];
  await expect(readWindowCheckoutStatusFindings(io, selected)).resolves.toEqual([expect.objectContaining({
    subject: `${repo} (main)`, condition: expect.stringContaining("index read denied"), remedy: expect.stringContaining("retry check"),
  })]);
  await expect(readWindowCheckoutStatusFindings(io, selected)).resolves.toEqual([]);
});

it.each([true, false])("requires a readable fetched tip while retaining the configured remote's full ref: present=%s", async present => {
  const upstream = "refs/remotes/backup/main";
  const boundary = scriptGitExec([
    { match: ["for-each-ref", "--format=%(upstream)", "refs/heads/main"], responses: [{ stdout: `${upstream}\n` }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "--end-of-options", upstream],
      responses: [present ? { stdout: "a".repeat(40) } : { failure: { exitCode: 1 } }] },
  ]);
  const findings = await readWindowCheckoutUpstreamFindings({ repo, exec: boundary.exec }, [checkout(true, absent)]);
  expect(findings).toEqual(present ? [] : [expect.objectContaining({ subject: `${repo} (main)`,
    condition: expect.stringContaining("without an upstream"), remedy: expect.stringContaining("retry check") })]);
});

it.each([true, false])("attributes a nested checkout's personal link only to its physical owner: marked=%s", hasMarker => {
  const root = join(repo, "linked");
  const child = { ...checkout(false, hasMarker ? marked : absent), path: root, branch: "feat/alpha" };
  const identityRoot = join(root, ".arc/user/andrew");
  const links = [{ person: SlugSchema.parse("andrew"), path: "link", physicalPath: join(identityRoot, "link"), root: identityRoot }];
  const findings = windowPersonalLinkFindings([checkout(true, absent), child], links);
  expect(findings).toEqual(hasMarker ? [expect.objectContaining({ subject: `${root} (feat/alpha)`,
    condition: expect.stringContaining("personal link"), remedy: expect.stringContaining("Replace") })] : []);
});
