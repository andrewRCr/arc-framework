/** Accepted copied cohort history is recoverable after a real atomic end withdrawal restores it live. */
import { join } from "node:path";
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { switchFixture, createRemoteMover } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

it("recovers copied cohort history at its descendant live ref after withdrawal of a batch-closed cohort", async () => {
  const h = await switchFixture(), provenance = { verb: "archive", lifecycleAction: "archive" };
  const ownQuarter = ArchiveQuarterSchema.parse("2027-q1"), winnerQuarter = ArchiveQuarterSchema.parse("2026-q4");
  const cohort = success(await h.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ owner: { type: "cohort", name: "copy-closed-cohort" }, kind: "cohort/document" }),
    content: "# Copy Closed Cohort\n\n**Purpose:** Finish its member.\n", provenance }));
  const member = success(await h.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "copy-cohort-member" }, kind: "work-item/meta" }),
    content: makeMetaFixture("copy-cohort-member", { cohort: "copy-closed-cohort" }), placement: { kind: "active" },
    provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.store.push()); success(await h.b.store.pull());
  const primary = success(await h.store.read({ reference: member.reference }));
  const document = success(await h.store.read({ reference: cohort.reference }));
  success(await h.store.batch({ writes: [
    { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter: ownQuarter } },
    { action: "put", reference: document.reference, expected: document.version, content: document.content, placement: { kind: "completed", quarter: ownQuarter } },
  ], provenance }));
  success(await h.store.push());
  // The independent receiver publishes only the member's end, leaving the cohort open.
  const winner = join(h.b.root, "independent-winner.git");
  await h.b.exec("git", ["init", "--bare", winner]);
  await h.b.exec("git", ["remote", "set-url", "origin", winner]);
  const remotePrimary = success(await h.b.store.read({ reference: member.reference }));
  success(await h.b.store.write({ action: "put", reference: remotePrimary.reference, expected: remotePrimary.version,
    content: remotePrimary.content, placement: { kind: "completed", quarter: winnerQuarter }, provenance }));
  expect(success(await h.b.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  let published = false, interrupt = true;
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports,
    exec: async (command, args, options) => {
      const result = await h.ports.exec(command, args, options);
      if (args.includes("push") && args.includes(h.destinationDirectory)) published = true;
      return result;
    },
    execInput: (args, input, options) => {
      if (published && interrupt && args.includes("update-ref")) { interrupt = false; throw new Error("Accepted cohort copy before confirmation"); }
      return h.ports.execInput(args, input, options);
    },
  })).rejects.toThrow("Accepted cohort copy before confirmation");
  const owner = cohort.reference.owner, workOwner = member.reference.owner;
  if (owner.type !== "cohort" || !owner.uid || workOwner.type !== "work-item" || !workOwner.uid) throw new Error("Both closed owners need UIDs");
  const live = `refs/arc/cohort/${owner.uid}`, history = HistoryRefSchema.parse(live.replace("refs/arc/", "refs/arc/history/"));
  const journal = "refs/arc/tmp/migrate/pending-copy/record";
  const account = JSON.parse((await h.a.exec("git", ["show", journal])).stdout) as { attempt: { changes: { ref: string; next: string | null }[] } };
  const proposed = account.attempt.changes.find(row => row.ref === history)?.next;
  if (!proposed) throw new Error("The accepted copy did not propose cohort history");
  const peer = await createRemoteMover(h, h.destinationDirectory, "cohort-withdrawer");
  success(await peer.store.pull({ history: [history, HistoryRefSchema.parse(`refs/arc/history/work/${workOwner.uid}`)] }));
  const destination = new Map((await peer.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout.split("\n")
    .filter(row => row && !row.startsWith("refs/arc/tmp/")).map(row => row.split(" ") as [string, string]));
  await peer.exec("git", ["config", "remote.origin.arc-state", "off"]);
  await peer.exec("git", ["remote", "add", "winner", winner]);
  await peer.exec("git", ["config", "remote.pushDefault", "winner"]);
  await peer.exec("git", ["config", "remote.winner.arc-state", "push"]);
  const withdrawn = success(await peer.store.pull());
  expect(withdrawn.pulls.flatMap(row => row.notices), JSON.stringify(withdrawn)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: member.reference.owner }));
  expect(success(await peer.store.read({ reference: cohort.reference })).placement).toBeUndefined();
  expect((await peer.git(["for-each-ref", "--format=%(refname)", live, history])).stdout).toBe(live);
  await peer.git(["merge-base", "--is-ancestor", proposed, live]);
  const current = new Map((await peer.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout.split("\n")
    .filter(row => row && !row.startsWith("refs/arc/tmp/")).map(row => row.split(" ") as [string, string]));
  const changed = [...new Set([...destination.keys(), ...current.keys()])].filter(ref => destination.get(ref) !== current.get(ref));
  await peer.git(["push", "--atomic", ...changed.map(ref => `--force-with-lease=${ref}:${destination.get(ref) ?? ""}`),
    "--", h.destinationDirectory, ...changed.map(ref => `${current.get(ref) ?? ""}:${ref}`)]);
  await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "merge-base", "--is-ancestor", proposed, live]);
  expect(await invokeStoreMigrate([], h.ports)).toMatchObject({ status: "ok" });
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/pending-copy/"])).stdout).toBe("");
  success(await h.store.pull({ history: [history] }));
  const restored = success(await h.store.read({ reference: cohort.reference }));
  expect(restored.content).toBe(document.content); expect(restored.placement).toBeUndefined();
}, 90_000);
