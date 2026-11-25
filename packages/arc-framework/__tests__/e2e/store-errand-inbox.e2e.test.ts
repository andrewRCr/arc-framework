/** Capture ownership through Errand open, link, and abandon. */
import { access, readFile } from "node:fs/promises";

import { expect, it } from "vitest";

import { recordReferences } from "../../src/lib/store/identity.js";
import { parseEntryList } from "../../src/lib/store/kinds/entry-list.js";
import {
  capture, ERRAND_TIMEOUT_MS, errandQueue, errandRepository, listCapture, markerPath, openErrand,
  personalInbox, primaryReference, projectInbox, resultJson, setProjectQueue, workItemUid,
} from "../helpers/store-errand-fixture.js";
import { runArc } from "./helpers.js";

it("moves a queued project capture and repairs an abandon collision by carrying its listed survivor", async () => {
  const repo = await errandRepository();
  const slug = "return-capture";
  const keeper = capture("Leave this queued", "abcdef12");
  await repo.put(projectInbox, `# Project Inbox\n\n## Inbox\n\n${capture("Original concern")}\n${keeper}`);
  await setProjectQueue(repo, "12345678", "abcdef12");
  const opened = await openErrand(repo, slug, "--from-inbox", "project:12345678");
  const primary = await repo.read(primaryReference(slug));
  const description = recordReferences["work-item/description"](primary.reference.owner);
  const body = await repo.read(description);
  const queue = await repo.read(errandQueue);
  const marker = await readFile(markerPath(repo.root), "utf8");
  const refs = await repo.git(["show-ref", "--heads"]);
  expect(opened).toMatchObject({ allocation: { kind: "primary", checkoutPath: repo.root },
    identity: { originEntry: "project:12345678", originEntrySourceDigest: null, branch: expect.stringMatching(/^chore\/return-capture-[0-9a-f]{8}$/u) } });
  expect(primary.placement).toEqual({ kind: "active" });
  expect(JSON.parse(primary.content)).toMatchObject({ state: "open", originEntry: "project:12345678", claimId: opened.subject.claimId });
  expect(JSON.parse(marker)).toMatchObject({ spawnedByArc: false, provisioning: "ready",
    createdFor: { kind: "errand", slug, claimId: opened.subject.claimId } });
  expect(await repo.git(["branch", "--show-current"])).toBe(opened.identity?.branch);
  expect(body.content).toContain("Capture prose for Original concern.");
  expect(body.content).toContain("- _Id:_ `12345678`");
  expect(body.content).toContain("- _Created:_ `2026-01-01`");
  const remaining = await repo.read(projectInbox);
  expect(remaining.content).not.toContain("12345678");
  expect(remaining.content).toContain(keeper.trim());
  expect(queue.content).not.toContain("12345678");
  expect(queue.content).toContain("abcdef12");

  // The route receipt still names the description as home when the same ID reappears with edited prose.
  await repo.put(projectInbox, `${remaining.content.trimEnd()}\n\n${capture("Survivor concern")}`, remaining.version);
  const collision = await repo.read(projectInbox);
  const personal = await repo.read(personalInbox);
  const survivor = await listCapture(repo, "project");
  const carry = ["route", survivor.id, "--from", "project", "--expected-version", survivor.version, "--to", workItemUid(primary)];
  const abandon = ["errand", "abandon", slug, "--json"];
  const refused = await repo.arc(abandon);
  resultJson(refused, 1);
  expect(refused.stdout + refused.stderr).toContain("Survivor concern");
  expect(refused.stdout + refused.stderr).toContain("Original concern");
  expect(refused.stdout + refused.stderr).toContain(`arc ${carry.join(" ")}`);
  expect(await repo.read(projectInbox)).toEqual(collision);
  expect(await repo.read(personalInbox)).toEqual(personal);
  expect(await repo.read(description)).toEqual(body);
  expect(await repo.read(primary.reference)).toEqual(primary);
  expect(await repo.read(errandQueue)).toEqual(queue);
  expect(await readFile(markerPath(repo.root), "utf8")).toBe(marker);
  expect(await repo.git(["show-ref", "--heads"])).toBe(refs);
  expect(await repo.git(["branch", "--show-current"])).toBe(opened.identity?.branch);

  expect(resultJson(await runArc(carry, repo.root))).toMatchObject({ state: "routed", carried: "cited" });
  expect((await repo.read(projectInbox)).content).not.toContain("Survivor concern");
  expect(resultJson(await repo.arc(abandon))).toMatchObject({ outcome: "applied", settlement: { disposition: "retained" } });
  expect((await repo.read(projectInbox)).content).toContain("Original concern");
  expect((await repo.read(projectInbox)).content).toContain("- _Id:_ `12345678`");
  expect((await repo.read(projectInbox)).content).toContain("- _Created:_ `2026-01-01`");
  expect((await repo.read(personalInbox)).content).toContain("Survivor concern");
  expect((await repo.read(description)).content).not.toMatch(/Original concern|Survivor concern/u);
  expect((await repo.read(primary.reference)).placement?.kind).toBe("completed");
  await expect(access(markerPath(repo.root))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await repo.git(["branch", "--show-current"])).toBe("main");
  expect(await repo.git(["rev-parse", "HEAD"])).toBe(repo.base);
  expect(await repo.git(["branch", "--list", `chore/${slug}-*`])).toBe("");
}, ERRAND_TIMEOUT_MS);

it("mints a text description and appends a listed capture when link evidence becomes available", async () => {
  const repo = await errandRepository();
  const slug = "link-concern";
  const opened = await openErrand(repo, slug, "--intent", "Keep the original intent");
  const primary = await repo.read(primaryReference(slug));
  const reference = recordReferences["work-item/description"](primary.reference.owner);
  const initial = await repo.read(reference);
  const marker = await readFile(markerPath(repo.root), "utf8");
  expect(opened.identity).toMatchObject({ origin: "description", originEntry: null });
  expect(initial.content).toContain("Keep the original intent");
  expect(initial.content).toMatch(/- _Id:_ `[a-f0-9]{8}`/u);
  expect(initial.content).toMatch(/- _Created:_ `\d{4}-\d{2}-\d{2}`/u);
  const args = ["errand", "link", slug, "--from-inbox", "project:12345678", "--json"];
  expect(resultJson(await repo.arc(args), 1)).toMatchObject({ outcome: "error", error: { code: "locus.errand-link.inbox" } });
  expect(await repo.read(primary.reference)).toEqual(primary);
  expect(await repo.read(reference)).toEqual(initial);
  expect(await readFile(markerPath(repo.root), "utf8")).toBe(marker);
  expect(await repo.git(["branch", "--show-current"])).toBe(opened.identity?.branch);
  expect(await repo.git(["rev-parse", "HEAD"])).toBe(repo.base);

  await repo.put(projectInbox, `## Inbox\n\n${capture("Linked concern")}`);
  expect(resultJson(await repo.arc(args))).toMatchObject({ outcome: "applied", operation: "errand-link",
    identity: { originEntry: "project:12345678", originEntrySourceDigest: null } });
  const linked = await repo.read(reference);
  expect(linked.content).toContain(initial.content.trim());
  expect(linked.content).toContain("Capture prose for Linked concern.");
  expect(linked.content).toContain("- _Id:_ `12345678`");
  expect(linked.content).toContain("- _Created:_ `2026-01-01`");
  expect((await repo.read(projectInbox)).content).not.toContain("12345678");
  expect(JSON.parse((await repo.read(primary.reference)).content)).toMatchObject({ originEntry: "project:12345678", claimId: opened.subject.claimId });
  expect(JSON.parse(await readFile(markerPath(repo.root), "utf8"))).toMatchObject({ createdFor: { kind: "errand", slug, claimId: opened.subject.claimId } });
  expect(await repo.git(["branch", "--show-current"])).toBe(opened.identity?.branch);
  expect(await repo.git(["rev-parse", "HEAD"])).toBe(repo.base);
}, ERRAND_TIMEOUT_MS);

it("binds a partial Errand to the listed version and leaves its capture and remaining queue on abandon", async () => {
  const repo = await errandRepository("partial");
  const slug = "partial-concern";
  const keeper = capture("Keep queued", "abcdef12");
  await repo.put(projectInbox, `## Inbox\n\n${capture("Partial concern")}\n${keeper}`);
  await setProjectQueue(repo, "12345678", "abcdef12");
  const listed = await listCapture(repo, "project");
  const original = await repo.read(projectInbox);
  const opened = await openErrand(repo, slug, "--from-inbox", "project:12345678");
  expect(opened.allocation).toMatchObject({ kind: "primary", checkoutPath: repo.root });
  expect(JSON.parse(await readFile(markerPath(repo.root), "utf8"))).toMatchObject({
    spawnedByArc: false, createdFor: { kind: "partial-errand", slug }, originEntry: "project:12345678", originEntryVersion: listed.version,
  });
  await expect(repo.read(primaryReference(slug))).rejects.toThrow(/not-found/u);
  expect(await repo.git(["branch", "--show-current"])).toBe("main");
  expect(await repo.read(projectInbox)).toEqual(original);
  const queue = await repo.read(errandQueue);
  expect(parseEntryList(queue.content, "personal/errand-queue")).toMatchObject({
    success: true, data: { entries: [{ id: "abcdef12", fields: { Inbox: "project" } }] },
  });

  expect(resultJson(await repo.arc(["errand", "abandon", slug, "--json"]))).toMatchObject({ outcome: "applied", operation: "errand-abandon",
    subject: { kind: "partial-errand", slug }, settlement: { kind: "capture", disposition: "retained" } });
  expect(await repo.read(projectInbox)).toEqual(original);
  expect(await repo.read(errandQueue)).toEqual(queue);
  await expect(access(markerPath(repo.root))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await repo.git(["branch", "--show-current"])).toBe("main");
  expect(await repo.git(["rev-parse", "HEAD"])).toBe(repo.base);
}, ERRAND_TIMEOUT_MS);
