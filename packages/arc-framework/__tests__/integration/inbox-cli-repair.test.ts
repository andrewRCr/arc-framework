/** Recovery continuations cross the actual CLI parse tree and commit real Store outcomes. */
import { expect, it } from "vitest";
import { repairCliFixture, repairCli, cliRows, editRecord } from "../helpers/repair-cli.js";
import { entry } from "../helpers/inbox-harness.js";
import { addBareRemote } from "../helpers/integration.js";
import { success } from "../helpers/store/suite-tools.js";
import { resolveEntryList } from "../../src/lib/inbox/lists.js";
import type { Store } from "../../src/lib/store/contract.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { OwnerIdentitySchema } from "../../src/lib/store/identity.js";

it("lists actual captures, refuses an invalid target filter, and routes a stale entry only after listing its new version", async () => {
  const f = await repairCliFixture(), original = (await cliRows(f, "project"))[0];
  if (!original) throw new Error("No capture");
  const before = success(await f.h.context.store.version());
  expect(await repairCli(f, ["inbox", "project", "--target", "target", "--json"])).toMatchObject({ exitCode: 1, result: { state: "refused", remedy: { text: expect.stringContaining("arc inbox personal --target") } } });
  expect(success(await f.h.context.store.version())).toBe(before);
  const source = await resolveEntryList("project", f.h.context);
  if (source.status !== "ok" || !source.result.saved) throw new Error("No source");
  await editRecord(f, source.result.saved, source.result.saved.content.replace("Prose", "Edited capture"));
  const args = ["route", original.id, "--from", "project", "--expected-version", original.version, "--to", "personal", "--section", "Errand"];
  expect(await repairCli(f, args)).toMatchObject({ exitCode: 1, result: { state: "refused", remedy: { text: expect.stringContaining("arc inbox <list>") } } });
  expect(await cliRows(f, "personal")).toEqual([]);
  const fresh = (await cliRows(f, "project"))[0]; if (!fresh) throw new Error("No fresh capture");
  args[5] = fresh.version;
  expect(await repairCli(f, args)).toMatchObject({ result: { state: "routed" } });
  expect(await cliRows(f, "project")).toEqual([]);
  expect(await cliRows(f, "personal")).toMatchObject([{ id: original.id, raw: expect.stringContaining("Edited capture") }]);
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
}, 30000);

it("retains a stale stable-ID removal, removes its fresh version, and replays as absent", async () => {
  const f = await repairCliFixture(); const source = await resolveEntryList("personal", f.h.context);
  if(source.status !== "ok" || !source.result.saved) throw new Error("No source");
  await editRecord(f, source.result.saved, `## Work Unit\n\n${entry()}\n`);
  const saved = success(await f.h.context.store.read({ reference: source.result.reference }));
  const original = (await cliRows(f, "personal"))[0]; if (!original) throw new Error("No capture");
  await editRecord(f, saved, saved.content.replace("Prose", "Keep changed capture"));
  const args = ["user", "inbox-remove", "--id", original.id, "--expected-version", original.version];
  expect(await repairCli(f, args)).toMatchObject({ result: { status: "ok", result: { disposition: "retained" } } });
  const fresh = (await cliRows(f, "personal"))[0]; if (!fresh) throw new Error("Edited capture lost");
  expect(fresh.raw).toContain("Keep changed capture"); args[5] = fresh.version;
  expect(await repairCli(f, args)).toMatchObject({ result: { status: "ok", result: { disposition: "removed" } } });
  expect(await cliRows(f, "personal")).toEqual([]);
  expect(await repairCli(f, args)).toMatchObject({ result: { status: "ok", result: { disposition: "absent" } } });
}, 30000);

it("refuses duplicate queue IDs across inboxes and accepts a repaired single member", async () => {
  const f = await repairCliFixture(); const personal = await resolveEntryList("personal", f.h.context);
  if(personal.status !== "ok" || !personal.result.saved) throw new Error("No inbox");
  await editRecord(f, personal.result.saved, `## Work Unit\n\n${entry()}\n`);
  const invoke = (members: { inbox: string; id: string }[]) => repairCli(f, ["errand", "queue", "set", "-"], { stdin: JSON.stringify({ schemaVersion: 1, members }) });
  const before = success(await f.h.context.store.version());
  const member = { inbox: "project", id: "12345678" };
  expect(await invoke([member, { ...member, inbox: "personal" }])).toMatchObject({ exitCode: 1, result: { state: "refused", reason: expect.stringContaining("12345678") } });
  expect(success(await f.h.context.store.version())).toBe(before);
  expect(await invoke([member])).toMatchObject({ result: { state: "set", members: [member] } });
  expect(await repairCli(f, ["errand", "queue", "--json"])).toMatchObject({ result: { state: "listed", members: [member] } });
}, 30000);

it("keeps a survivor through destination rename and failed atomic carry, then replaces only its held capture on retry", async () => {
  const f = await repairCliFixture(), target = await f.h.workUnit();
  const source = await resolveEntryList("project", f.h.context);
  if (source.status !== "ok" || !source.result.saved) throw new Error("No source");
  const saved = source.result.saved, row = (await cliRows(f, "project"))[0]; if (!row) throw new Error("No row");
  const racing = Object.create(f.h.context.store) as Store;
  racing.batch = async input => { await editRecord(f, saved, saved.content.replace("Prose", "Surviving prose")); return f.h.context.store.batch(input); };
  const args = ["route", row.id, "--from", "project", "--expected-version", row.version, "--to", target.reference.owner.name];
  expect(await repairCli(f, args, { store: racing })).toMatchObject({ result: { state: "routed" } });
  const survivor = (await cliRows(f, "project"))[0]; if (!survivor) throw new Error("Survivor lost");
  const uid = target.reference.owner.type === "work-item" ? target.reference.owner.uid : undefined;
  expect(survivor).toMatchObject({ survivor: { home: { list: uid } } }); args[5] = survivor.version;
  const renamed = `${target.reference.owner.name}-after`;
  success(await f.h.context.store.write({ action: "put", reference: { ...target.reference,
    owner: OwnerIdentitySchema.parse({ ...target.reference.owner, name: renamed }) }, expected: target.version,
    content: target.content.replaceAll(target.reference.owner.name, renamed), placement: { kind: "active" },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  if (uid === undefined) throw new Error("Generation UID required");
  args[7] = uid;
  const failed = Object.create(f.h.context.store) as Store;
  failed.batch = async () => ({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "project", condition: "Crash before atomic carry commit", remedy: { text: "Repair the Store and retry." } } });
  const before = success(await f.h.context.store.version());
  expect(await repairCli(f, args, { store: failed })).toMatchObject({ exitCode: 1, result: { state: "refused", reason: expect.stringContaining("Crash before atomic carry commit") } });
  expect(success(await f.h.context.store.version())).toBe(before);
  expect(await cliRows(f, "project")).toMatchObject([{ raw: expect.stringContaining("Surviving prose") }]);
  expect(await cliRows(f, target.reference.owner.name)).toMatchObject([{ raw: expect.stringContaining("Prose") }]);
  expect(await repairCli(f, args)).toMatchObject({ result: { state: "routed", carried: "replaced" } });
  expect(await cliRows(f, "project")).toEqual([]);
  expect(await cliRows(f, target.reference.owner.name)).toMatchObject([{ id: row.id, raw: expect.stringContaining("Surviving prose") }]);
}, 30000);

it("refuses a full abandon collision, carries the survivor by its named repair, and returns both captures on retry", async () => {
  const f = await repairCliFixture();
  const source = await resolveEntryList("project", f.h.context);
  if (source.status !== "ok" || !source.result.saved) throw new Error("No source");
  const saved = source.result.saved, racing = Object.create(f.h.context.store) as Store;
  let raced = false;
  racing.batch = async input => {
    if (!raced && input.provenance.verb === "errand-open") { raced = true; await editRecord(f, saved, saved.content.replace("Concern", "Survivor concern")); }
    return f.h.context.store.batch(input);
  };
  expect(await repairCli(f, ["errand", "open", "collision", "--from-inbox", "project:12345678", "--json"], { store: racing })).toMatchObject({ result: { outcome: "applied" } });
  const beforeRefusal = success(await f.h.context.store.version());
  const refused = await repairCli(f, ["errand", "abandon", "collision", "--json"]);
  expect(refused, JSON.stringify(refused)).toMatchObject({ exitCode: 1 });
  expect(success(await f.h.context.store.version())).toBe(beforeRefusal);
  expect(await readWorktreeMarker(f.cwd)).toMatchObject({ kind: "present", marker: { createdFor: { kind: "errand", slug: "collision" } } });
  expect(refused.stdout + refused.stderr).toContain("Survivor concern"); expect(refused.stdout + refused.stderr).toContain("Concern");
  const survivor = (await cliRows(f, "project"))[0]; if (!survivor) throw new Error("No survivor");
  const args = ["route", survivor.id, "--from", "project", "--expected-version", survivor.version, "--to", "collision"];
  expect(refused.stdout + refused.stderr).toContain(`arc ${args.join(" ")}`);
  expect(await repairCli(f, args)).toMatchObject({ result: { state: "routed", carried: "cited" } });
  expect(await cliRows(f, "project")).toEqual([]);
  expect(await repairCli(f, ["errand", "abandon", "collision", "--json"])).toMatchObject({ result: { outcome: "applied" } });
  const returned = [...await cliRows(f, "project"), ...await cliRows(f, "personal")];
  expect(returned.map(row => row.title).sort()).toEqual(["Concern", "Survivor concern"]);
  expect(await cliRows(f, "collision")).toEqual([]); expect(await readWorktreeMarker(f.cwd)).toEqual({ kind: "absent" });
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
}, 30000);

it("abandons a partial Errand without changing its capture or queue", async () => {
  const f = await repairCliFixture("partial");
  await addBareRemote(f.cwd); await f.exec("git", ["push", "-u", "origin", "main"]);
  await repairCli(f, ["errand", "queue", "set", "-"], { stdin: JSON.stringify({ schemaVersion: 1, members: [{ inbox: "project", id: "12345678" }] }) });
  expect(await repairCli(f, ["errand", "open", "partial-abandon", "--from-inbox", "project:12345678", "--json"])).toMatchObject({ result: { outcome: "applied" } });
  const before = await cliRows(f, "project"), queue = await repairCli(f, ["errand", "queue", "--json"]);
  const abandoned = await repairCli(f, ["errand", "abandon", "partial-abandon", "--json"]);
  expect(abandoned, JSON.stringify(abandoned)).toMatchObject({ result: { outcome: "applied" } });
  expect(await cliRows(f, "project")).toEqual(before);
  expect((await repairCli(f, ["errand", "queue", "--json"])).result).toEqual(queue.result);
  expect(await readWorktreeMarker(f.cwd)).toEqual({ kind: "absent" });
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
}, 30000);
