/** Checkout preservation and failed Errand provisioning through the built CLI. */
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, it } from "vitest";

import { recordReferences } from "../../src/lib/store/identity.js";
import {
  capture, ERRAND_TIMEOUT_MS, errandQueue, errandRepository, markerPath, openErrand, primaryReference,
  projectInbox, resultJson, setProjectQueue, workItemUid,
} from "../helpers/store-errand-fixture.js";

it("refuses dirty leave and missing saved code, then restores the same spawned Errand from origin", async () => {
  const repo = await errandRepository();
  const slug = "preserve-work";
  const initialRoster = await repo.git(["worktree", "list", "--porcelain"]);
  const opened = await openErrand(repo, slug, "--isolate", "--intent", "Preserve the work");
  const holder = opened.checkout;
  const branch = await repo.git(["branch", "--show-current"], holder);
  const initial = await repo.read(primaryReference(slug));
  const description = await repo.read(recordReferences["work-item/description"](initial.reference.owner));
  const claimId = opened.subject.claimId;
  const marker = await readFile(markerPath(holder), "utf8");
  expect(opened).toMatchObject({ allocation: { kind: "spawned" }, identity: { branch, claimId: expect.any(String) } });
  expect(JSON.parse(marker)).toMatchObject({ spawnedByArc: true, createdFor: { kind: "errand", slug, claimId } });
  await repo.git(["push", "-u", "origin", branch], holder);
  const file = join(holder, "preserved-work.txt");
  const bytes = "Keep these Errand bytes.\n";
  await writeFile(file, bytes);
  const leave = ["errand", "leave", slug, "--state", "paused", "--json"];
  expect(resultJson(await repo.arc(leave, holder), 1)).toMatchObject({ outcome: "refused", reason: "preservation-unproven",
    recommendedPromptText: expect.stringMatching(/dirty|uncommitted|clean/iu) });
  expect(await readFile(file, "utf8")).toBe(bytes);
  expect(await repo.read(initial.reference)).toEqual(initial);
  expect(await repo.read(description.reference)).toEqual(description);
  expect(await readFile(markerPath(holder), "utf8")).toBe(marker);
  expect(await repo.git(["rev-parse", "HEAD"], holder)).toBe(repo.base);
  expect(await repo.git(["rev-parse", `refs/heads/${branch}`], repo.remote)).toBe(repo.base);

  await repo.git(["add", "preserved-work.txt"], holder);
  await repo.git(["commit", "-m", "Preserve authored work"], holder);
  const savedHead = await repo.git(["rev-parse", "HEAD"], holder);
  await repo.git(["push", "origin", branch], holder);
  expect(await repo.git(["rev-parse", `refs/heads/${branch}`], repo.remote)).toBe(savedHead);
  expect(resultJson(await repo.arc(leave, holder))).toMatchObject({ outcome: "applied",
    settlement: { kind: "identity-tail", state: "paused", savedHead } });
  await expect(access(holder)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await repo.git(["worktree", "list", "--porcelain"])).toBe(initialRoster);
  const paused = await repo.read(initial.reference);
  expect(paused.placement?.kind).toBe("active");
  expect(JSON.parse(paused.content)).toMatchObject({ state: "paused", savedHead, claimId, branch });

  await repo.git(["branch", "-D", branch]);
  await repo.git(["push", "origin", "--delete", branch]);
  const materialize = ["errand", "materialize", slug, "--claim-id", String(claimId), "--expected-head", savedHead, "--json"];
  expect(resultJson(await repo.arc(materialize), 1)).toMatchObject({ outcome: "refused", reason: "preservation-unproven" });
  expect(await repo.read(initial.reference)).toEqual(paused);
  expect(await repo.read(description.reference)).toEqual(description);
  expect(await repo.git(["worktree", "list", "--porcelain"])).toBe(initialRoster);
  expect(await repo.git(["for-each-ref", "--format=%(refname)", `refs/heads/${branch}`, `refs/remotes/origin/${branch}`])).toBe("");
  await expect(access(holder)).rejects.toMatchObject({ code: "ENOENT" });

  await repo.git(["push", "origin", `${savedHead}:refs/heads/${branch}`]);
  expect(resultJson(await repo.arc(materialize))).toMatchObject({ outcome: "applied", operation: "errand-materialize",
    allocation: { checkoutPath: holder }, identity: { branch, state: "open", claimId } });
  const resumed = await repo.read(primaryReference(slug));
  expect(workItemUid(resumed)).toBe(workItemUid(initial));
  expect(JSON.parse(resumed.content)).toMatchObject({ state: "open", claimId, branch });
  expect(await repo.read(description.reference)).toEqual(description);
  expect(await repo.git(["rev-parse", "HEAD"], holder)).toBe(savedHead);
  expect(await repo.git(["branch", "--show-current"], holder)).toBe(branch);
  expect(await readFile(file, "utf8")).toBe(bytes);
  expect(JSON.parse(await readFile(markerPath(holder), "utf8"))).toMatchObject({
    spawnedByArc: true, provisioning: "ready", createdFor: { kind: "errand", slug, claimId },
  });
}, ERRAND_TIMEOUT_MS);

it("returns a capture after Git rejects the branch cut and opens a fresh generation after repair", async () => {
  const repo = await errandRepository();
  const slug = "retry-open";
  await repo.put(projectInbox, `## Inbox\n\n${capture("Return this capture")}`);
  await setProjectQueue(repo, "12345678");
  // A ref at the branch namespace itself blocks every suffixed child that Git could create.
  await repo.git(["branch", "chore", "main"]);
  const roster = await repo.git(["worktree", "list", "--porcelain"]);
  const open = ["errand", "open", slug, "--from-inbox", "project:12345678", "--json"];
  const failure = await repo.arc(open);
  expect(resultJson(failure, 1)).toMatchObject({ outcome: "error" });
  expect(failure.stdout + failure.stderr).toMatch(/cannot lock ref.*chore\/retry-open-/su);
  const failed = await repo.read(primaryReference(slug));
  const failedDescription = await repo.read(recordReferences["work-item/description"](failed.reference.owner));
  expect(failed.placement?.kind).toBe("completed");
  expect(failedDescription.content).not.toContain("12345678");
  const returned = await repo.read(projectInbox);
  expect(returned.fields).toMatchObject({ entries: [{
    id: "12345678", title: "Return this capture", fields: { Created: "2026-01-01" },
    bytes: expect.stringContaining("Capture prose for Return this capture."),
  }] });
  expect((await repo.read(errandQueue)).content).not.toContain("12345678");
  await expect(access(markerPath(repo.root))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await repo.git(["branch", "--show-current"])).toBe("main");
  expect(await repo.git(["rev-parse", "HEAD"])).toBe(repo.base);
  expect(await repo.git(["worktree", "list", "--porcelain"])).toBe(roster);
  expect(await repo.git(["branch", "--list", `chore/${slug}-*`])).toBe("");

  await repo.git(["branch", "-m", "chore", "preserved-blocker"]);
  expect(resultJson(await repo.arc(open))).toMatchObject({ outcome: "applied" });
  const activated = await repo.read(primaryReference(slug));
  const activeDescription = await repo.read(recordReferences["work-item/description"](activated.reference.owner));
  expect(activated.placement?.kind).toBe("active");
  expect(workItemUid(activated)).not.toBe(workItemUid(failed));
  expect(JSON.parse(activated.content).claimId).not.toBe(JSON.parse(failed.content).claimId);
  expect(activeDescription.content).toContain("Capture prose for Return this capture.");
  expect(activeDescription.content).toContain("12345678");
  expect((await repo.read(projectInbox)).content).not.toContain("12345678");
  expect(await repo.read(failed.reference)).toEqual(failed);
  expect(await repo.read(failedDescription.reference)).toEqual(failedDescription);
  expect(await repo.git(["branch", "--show-current"])).toMatch(/^chore\/retry-open-[a-f0-9]{8}$/u);
  expect(await repo.git(["rev-parse", "HEAD"])).toBe(repo.base);
  expect(await repo.git(["rev-parse", "refs/heads/preserved-blocker"])).toBe(repo.base);
  expect(JSON.parse(await readFile(markerPath(repo.root), "utf8"))).toMatchObject({
    createdFor: { kind: "errand", slug, claimId: JSON.parse(activated.content).claimId }, provisioning: "ready",
  });
}, ERRAND_TIMEOUT_MS);
