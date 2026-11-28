/** Exact capture retirement and landing through the built Errand commands. */
import { execFileSync } from "node:child_process";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";

import { expect, it } from "vitest";

import { parseStampedFile } from "../../src/lib/store/projection/stamp.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import {
  capture, ERRAND_TIMEOUT_MS, errandQueue, errandRepository, listCapture, markerPath, openErrand,
  personalInbox, primaryReference, projectInbox, resultJson, setProjectQueue, type ErrandRepository,
} from "../helpers/store-errand-fixture.js";
import { runArc, runArcAnchoredSequence } from "./helpers.js";

it.each([false, true])("closes a published partial Errand at the observed capture version (edited=%s)", async edited => {
  const repo = await errandRepository("partial");
  await repo.put(projectInbox, `## Inbox\n\n${capture("Close this capture")}\n${capture("Leave this capture", "abcdef12")}`);
  const original = await repo.read(projectInbox);
  const version = (await listCapture(repo, "project")).version;
  const slug = "close-capture";
  await openErrand(repo, slug, "--from-inbox", "project:12345678");
  expect(JSON.parse(await readFile(markerPath(repo.root), "utf8"))).toMatchObject({ originEntryVersion: version });
  if (edited) await repo.put(projectInbox, original.content.replace("Capture prose for Close this capture.", "Edited after open."), original.version);
  await writeFile(join(repo.root, "landed.txt"), "Published partial work\n");
  await repo.git(["add", "landed.txt"]);
  await repo.git(["commit", "-m", "Land partial work"]);
  const landed = await repo.git(["rev-parse", "HEAD"]);
  await repo.git(["push", "origin", "main"]);
  expect(await repo.git(["rev-parse", "refs/heads/main"], repo.remote)).toBe(landed);
  const before = await repo.read(projectInbox);
  const close = ["errand", "close", slug, "--json"];
  expect(resultJson(await repo.arc(close))).toMatchObject({ outcome: "applied", operation: "errand-close",
    settlement: { disposition: edited ? "retained" : "removed", originEntry: "project:12345678" } });
  const after = await repo.read(projectInbox);
  if (edited) expect(after).toEqual(before);
  else expect(after.content).not.toContain("12345678");
  expect(after.content).toContain(capture("Leave this capture", "abcdef12").trim());
  await expect(access(markerPath(repo.root))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(repo.read(primaryReference(slug))).rejects.toThrow(/not-found/u);
  expect(await repo.git(["rev-parse", "HEAD"])).toBe(landed);
  expect(await readFile(join(repo.root, "landed.txt"), "utf8")).toBe("Published partial work\n");
  expect(resultJson(await repo.arc(close))).toMatchObject({ outcome: "idempotent", settlement: { disposition: "absent" } });
  expect(await repo.read(projectInbox)).toEqual(after);
}, ERRAND_TIMEOUT_MS);

it("retains a stale ID removal, removes only its refreshed version, and replays as absent", async () => {
  const repo = await errandRepository();
  const personalPath = join(repo.root, ".arc", "user", "test-user", "USER-INBOX.md");
  const empty = await repo.read(personalInbox);
  const keeper = capture("Keep this", "abcdef12");
  await repo.put(personalInbox, `# User Inbox\n\n## Errand\n\n${capture("Remove this")}\n${keeper}`, empty.version);
  const original = await repo.read(personalInbox);
  const listed = await listCapture(repo, "personal");
  await repo.put(personalInbox, original.content.replace("Capture prose for Remove this.", "Changed after listing."), original.version);
  const edited = await repo.read(personalInbox);
  await listCapture(repo, "personal");
  const editedBytes = await readFile(personalPath, "utf8");
  expect(parseStampedFile(editedBytes).content).toBe(edited.content);
  const remove = (version: string) => runArc(["user", "inbox-remove", "--id", listed.id, "--expected-version", version], repo.root);
  expect(resultJson(await remove(listed.version))).toMatchObject({ status: "ok", result: { disposition: "retained" } });
  expect(await repo.read(personalInbox)).toEqual(edited);
  expect(await readFile(personalPath, "utf8")).toBe(editedBytes);

  const current = await listCapture(repo, "personal");
  expect(current.version).not.toBe(listed.version);
  expect(resultJson(await remove(current.version))).toMatchObject({ status: "ok", result: { disposition: "removed" } });
  const after = await repo.read(personalInbox);
  expect(after.content).toContain(keeper.trim());
  expect(after.content).not.toContain(listed.id);
  const afterBytes = await readFile(personalPath, "utf8");
  expect(parseStampedFile(afterBytes).content).toBe(after.content);
  expect(resultJson(await remove(current.version))).toMatchObject({ status: "ok", result: { disposition: "absent" } });
  expect(await repo.read(personalInbox)).toEqual(after);
  expect(await readFile(personalPath, "utf8")).toBe(afterBytes);
  expect(await repo.git(["rev-parse", "HEAD"])).toBe(repo.base);
}, ERRAND_TIMEOUT_MS);

it("keeps a full Errand's description and a later same-ID capture when unchanged code closes", async () => {
  const repo = await errandRepository();
  const slug = "later-capture";
  await repo.put(projectInbox, `## Inbox\n\n${capture("Original description")}`);
  const opened = await openErrand(repo, slug, "--from-inbox", "project:12345678");
  const active = await repo.read(primaryReference(slug));
  const description = await repo.read(recordReferences["work-item/description"](active.reference.owner));
  const drained = await repo.read(projectInbox);
  await repo.put(projectInbox, `${drained.content.trimEnd()}\n\n${capture("Later capture")}`, drained.version);
  const later = await repo.read(projectInbox);
  expect(resultJson(await repo.arc(["errand", "close", slug, "--json"]))).toMatchObject({
    outcome: "applied", settlement: { disposition: "absent" }, leftOut: [], skipped: [],
  });
  expect(await repo.read(projectInbox)).toEqual(later);
  expect((await repo.read(description.reference)).content).toBe(description.content);
  const completed = await repo.read(active.reference);
  expect(completed.placement?.kind).toBe("completed");
  expect(completed.links?.landingCommit).toBeUndefined();
  await expect(access(markerPath(repo.root))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await repo.git(["branch", "--show-current"])).toBe("main");
  expect(await repo.git(["rev-parse", "HEAD"])).toBe(repo.base);
  expect(await repo.git(["branch", "--list", String(opened.identity?.branch)])).toBe("");
}, ERRAND_TIMEOUT_MS);

it.each(["full", "partial"] as const)("preserves %s close state while the queue is malformed and closes after queue repair", async protection => {
  const repo = await errandRepository(protection);
  const slug = "repair-queue";
  await repo.put(projectInbox, `## Inbox\n\n${capture("Close this")}\n${capture("Keep queued", "abcdef12")}`);
  await setProjectQueue(repo, "abcdef12");
  await openErrand(repo, slug, "--from-inbox", "project:12345678");
  const queue = await repo.read(errandQueue);
  const corrupt = queue.content.replace(/- _Rank:_ `[^`]+`/u, "- _Rank:_ `bad rank`");
  expect(corrupt).not.toBe(queue.content);
  await repo.put(errandQueue, corrupt, queue.version);

  const marker = await readFile(markerPath(repo.root), "utf8");
  const inbox = await repo.read(projectInbox);
  const before = await repo.read(errandQueue);
  const refs = await repo.git(["show-ref", "--heads"]);
  const active = protection === "full" ? await repo.read(primaryReference(slug)) : null;
  const close = ["errand", "close", slug, "--json"];
  const refused = await repo.arc(close);
  resultJson(refused, 1);
  expect(refused.stdout + refused.stderr).toContain("arc errand queue set");
  expect(await repo.read(errandQueue)).toEqual(before);
  expect(await repo.read(projectInbox), refused.stdout + refused.stderr).toEqual(inbox);
  if (active !== null) expect(await repo.read(active.reference)).toEqual(active);
  expect(await readFile(markerPath(repo.root), "utf8")).toBe(marker);
  expect(await repo.git(["show-ref", "--heads"])).toBe(refs);
  expect(await repo.git(["rev-parse", "HEAD"])).toBe(repo.base);

  await setProjectQueue(repo, "abcdef12");
  expect(resultJson(await repo.arc(close))).toMatchObject({ outcome: "applied" });
  expect((await repo.read(errandQueue)).content).not.toContain("bad rank");
  expect((await repo.read(projectInbox)).content).not.toContain("12345678");
  if (active !== null) expect((await repo.read(active.reference)).placement?.kind).toBe("completed");
  await expect(access(markerPath(repo.root))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await repo.git(["branch", "--show-current"])).toBe("main");
}, ERRAND_TIMEOUT_MS);

async function mergedHost(repo: ErrandRepository, branch: string, head: string, landing: string): Promise<NodeJS.ProcessEnv> {
  const origin = "https://github.com/owner/repo.git";
  await repo.git(["remote", "set-url", "origin", origin]);
  await repo.git(["config", `url.${pathToFileURL(repo.remote).href}.insteadOf`, origin]);
  const bin = join(repo.root, ".git", "host-bin");
  await mkdir(bin);
  const gh = join(bin, "gh");
  const exact = { baseRefName: "main", headRefName: branch, headRefOid: head };
  const lifecycle = { ...exact, number: 1, state: "MERGED", reviewDecision: "APPROVED" };
  const prefix = `pr list --repo owner/repo --state all --head ${branch} --limit 100 --json `;
  await writeFile(gh, [
    "#!/bin/sh",
    'case "$*" in',
    `  "pr list --repo owner/repo --state merged --head ${branch} --limit 2 --json baseRefName,headRefName,headRefOid") printf '%s\\n' '${JSON.stringify([exact])}' ;;`,
    `  "${prefix}number,state,baseRefName,headRefName,headRefOid,reviewDecision,mergeCommit") printf '%s\\n' '${JSON.stringify([{ ...lifecycle, mergeCommit: { oid: landing } }])}' ;;`,
    `  "${prefix}number,url,state,baseRefName,headRefName,headRefOid") printf '%s\\n' '${JSON.stringify([{ ...exact, number: 1, state: "MERGED", url: "https://github.com/owner/repo/pull/1" }])}' ;;`,
    '  *) printf "unexpected gh invocation: %s\\n" "$*" >&2; exit 2 ;;',
    "esac",
    "",
  ].join("\n"));
  await chmod(gh, 0o755);
  return { PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` };
}

// The merged pull request is stubbed host evidence. The head, landing, store, marker and checkout are real.
it.runIf(process.platform !== "win32")("repairs unreadable claims before merge admission and records the exact landing on close", async () => {
  const repo = await errandRepository();
  const slug = "land-real-code";
  const opened = await openErrand(repo, slug, "--intent", "Land this work");
  const branch = await repo.git(["branch", "--show-current"]);
  const claimId = opened.subject.claimId;
  const active = await repo.read(primaryReference(slug));
  const description = await repo.read(recordReferences["work-item/description"](active.reference.owner));
  const registry = await repo.read(recordReferences["project-registry/identity"](projectInbox.owner));
  const { projectId } = JSON.parse(registry.content) as { projectId: string };
  expect(projectId).toEqual(expect.any(String));
  const bytes = "This change has a distinct merge commit.\n";
  const code = join(repo.root, "landed.txt");
  await writeFile(code, bytes);
  await repo.git(["add", "landed.txt"]);
  await repo.git(["commit", "-m", "Change Errand code"]);
  const head = await repo.git(["rev-parse", "HEAD"]);
  await repo.git(["push", "origin", branch]);
  const tree = await repo.git(["rev-parse", "HEAD^{tree}"]);
  const landing = await repo.git(["commit-tree", tree, "-p", repo.base, "-p", head, "-m", "Merge Errand code"]);
  await repo.git(["push", "origin", `${landing}:refs/heads/main`]);
  const close = ["errand", "close", slug, "--json"];
  const marker = await readFile(markerPath(repo.root), "utf8");
  expect(resultJson(await repo.arc(close), 1)).toMatchObject({ outcome: "refused", reason: "change-request-unverifiable" });
  expect(await repo.read(active.reference)).toEqual(active);
  expect(await repo.read(description.reference)).toEqual(description);
  expect(await readFile(markerPath(repo.root), "utf8")).toBe(marker);
  expect(await repo.git(["rev-parse", "HEAD"])).toBe(head);

  const env = await mergedHost(repo, branch, head, landing);
  const refs = await repo.git(["show-ref", "--heads"]);
  const roster = await repo.git(["worktree", "list", "--porcelain"]);
  const request = join(repo.root, ".git", "merge-request.json");
  await writeFile(request, JSON.stringify({
    schemaVersion: 1, identity: { slug, claimId, branch, generation: `errand-v1/${slug}/${claimId}` },
    approvedTarget: { repository: "owner/repo", pullRequest: 1, baseRef: "main", headRef: branch, headSha: head },
    lane: "auto", mergeMethod: { method: "merge", policyFingerprint: `sha256:${"d".repeat(64)}` },
  }));
  const merge = ["errand", "merge", slug, request, "--json"];
  const claims = "refs/arc/user/test-user/claims";
  const claim = recordReferences["claims/groom"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" }), "groom-topic");
  const now = "2026-01-01T00:00:00Z";
  await repo.put(claim, JSON.stringify({ version: 3, kind: "groom", slug: "groom-topic", claimId: "c".repeat(32),
    createdAt: now, updatedAt: now, anchorStub: "topic", members: ["topic"], openedBaseHead: repo.base,
    protection: "full", branch: "chore/groom-topic", state: "open", changeRequest: null }));
  const goodTip = await repo.git(["rev-parse", claims]);
  const goodClaim = await repo.read(claim);
  const entries = (await repo.git(["ls-tree", goodTip])).split("\n");
  const invalidBlob = await repo.git(["rev-parse", "HEAD:landed.txt"]);
  const mergeCommand = () => runArcAnchoredSequence([merge], repo.root, { env });
  const closeCommand = () => runArcAnchoredSequence([close], repo.root, { env });
  const brokenClaims = [
    { label: "missing metadata", entries: entries.filter(line => !line.includes("\tmetadata-")), diagnostic: claims },
    { label: "malformed record", entries: entries.map(line => line.includes("\tgroom-")
      ? line.replace(/blob [0-9a-f]+/u, `blob ${invalidBlob}`) : line), diagnostic: "groom-topic" },
  ];
  for (const broken of brokenClaims) {
    const brokenTree = execFileSync("git", ["mktree"], { cwd: repo.root, input: `${broken.entries.join("\n")}\n`, encoding: "utf8" }).trim();
    const brokenTip = await repo.git(["commit-tree", brokenTree, "-p", goodTip, "-m", `Claims with ${broken.label}`]);
    await repo.git(["update-ref", claims, brokenTip, goodTip]);
    const blockedMerge = await mergeCommand();
    expect(blockedMerge.exitCode, blockedMerge.stdout + blockedMerge.stderr).toBe(0);
    expect(blockedMerge.results[0], blockedMerge.stdout + blockedMerge.stderr).toMatchObject({
      state: "invalidated", reason: "identity-moved", nextAction: "request-approval",
      detail: expect.stringContaining(broken.diagnostic),
    });
    const blockedClose = await closeCommand();
    expect(blockedClose.exitCode, blockedClose.stdout + blockedClose.stderr).toBe(1);
    expect(blockedClose.results[0]).toMatchObject({ operation: "errand-close", outcome: "refused" });
    expect(blockedClose.stdout + blockedClose.stderr).toContain(broken.diagnostic);
    expect(blockedClose.stdout + blockedClose.stderr).toMatch(/restore|repair|fetch/iu);
    expect(await repo.read(active.reference)).toEqual(active);
    expect(await repo.read(description.reference)).toEqual(description);
    expect(await readFile(markerPath(repo.root), "utf8")).toBe(marker);
    expect(await readFile(code, "utf8")).toBe(bytes);
    expect(await repo.git(["show-ref", "--heads"])).toBe(refs);
    expect(await repo.git(["worktree", "list", "--porcelain"])).toBe(roster);
    expect(await repo.git(["rev-parse", claims])).toBe(brokenTip);
    expect(await repo.git(["rev-parse", `refs/heads/${branch}`], repo.remote)).toBe(head);
    expect(await repo.git(["rev-parse", "refs/heads/main"], repo.remote)).toBe(landing);
    await repo.git(["update-ref", claims, goodTip, brokenTip]);
    expect(await repo.read(claim)).toEqual(goodClaim);
  }

  const merged = await mergeCommand();
  expect(merged.exitCode, merged.stdout + merged.stderr).toBe(0);
  expect(merged.results[0], merged.stdout + merged.stderr).toMatchObject({ state: "merged" });
  const closed = await closeCommand();
  expect(closed.exitCode, closed.stdout + closed.stderr).toBe(0);
  expect(closed.results[0], closed.stdout + closed.stderr).toMatchObject({ outcome: "applied", operation: "errand-close" });
  const completed = await repo.read(active.reference);
  expect(completed.placement?.kind).toBe("completed");
  expect(completed.links?.landingCommit).toEqual({ repository: projectId, sha: landing });
  expect((await repo.read(description.reference)).content).toBe(description.content);
  await expect(access(markerPath(repo.root))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await repo.git(["branch", "--show-current"])).toBe("main");
  expect(await repo.git(["branch", "--list", branch])).toBe("");
  expect(await repo.git(["ls-remote", "--heads", "origin", `refs/heads/${branch}`])).toBe("");
  expect(await repo.git(["show", `${landing}:landed.txt`])).toBe(bytes.trim());
}, ERRAND_TIMEOUT_MS);
