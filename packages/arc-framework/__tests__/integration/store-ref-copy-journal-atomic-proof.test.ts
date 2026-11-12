/** A copied lifecycle counterpart proves only its own update in the retained atomic attempt. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { switchFixture, createRemoteMover } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";

it.each(["unrelated live tip", "partial atomic outcome"] as const)("retains interrupted copy evidence for %s and resumes after exact repair", async damage => {
  const h = await switchFixture(), provenance = { verb: "archive", lifecycleAction: "archive" };
  const made = success(await h.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "atomic-copy-owner" } }),
    content: makeMetaFixture("atomic-copy-owner"), placement: { kind: "active" }, provenance }));
  const before = success(await h.store.read({ reference: made.reference }));
  success(await h.store.write({ action: "put", reference: before.reference, expected: before.version, content: before.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance }));
  success(await h.store.push());
  const oldRegistry = (await h.a.git(["rev-parse", "refs/arc/project/registry"])).stdout.trim();
  let published = false, interrupt = true;
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports,
    exec: async (command, args, options) => {
      const result = await h.ports.exec(command, args, options);
      if (args.includes("push") && args.includes(h.destinationDirectory)) published = true;
      return result;
    },
    execInput: (args, input, options) => {
      if (published && interrupt && args.includes("update-ref")) { interrupt = false; throw new Error("Atomic copy accepted before confirmation"); }
      return h.ports.execInput(args, input, options);
    },
  })).rejects.toThrow("Atomic copy accepted before confirmation");
  const owner = made.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("The copied item needs a UID");
  const live = `refs/arc/work/${owner.uid}`, history = HistoryRefSchema.parse(live.replace("refs/arc/", "refs/arc/history/"));
  const peer = await createRemoteMover(h, h.destinationDirectory, "atomic-proof-reopener");
  success(await peer.store.pull({ history: [history] }));
  const archived = success(await peer.store.read({ reference: made.reference }));
  success(await peer.store.write({ action: "put", reference: archived.reference, expected: archived.version, content: archived.content,
    placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
  success(await peer.store.push());
  const ref = damage === "unrelated live tip" ? live : "refs/arc/project/registry";
  const repaired = (await peer.git(["rev-parse", ref])).stdout.trim();
  let invalid = oldRegistry;
  if (damage === "unrelated live tip") {
    const entries = await capturedEntries({ root: peer.root, ports: peer.ports }, repaired);
    invalid = (await plantRef(peer.root, "refs/test/unrelated-copy-live", entries, { parents: [] })).tip;
    await expect(peer.git(["merge-base", "--is-ancestor", repaired, invalid])).rejects.toMatchObject({ exitCode: 1 });
  }
  await peer.git(["push", `--force-with-lease=${ref}:${repaired}`, h.destinationDirectory, `${invalid}:${ref}`]);
  const journal = "refs/arc/tmp/migrate/pending-copy/record";
  const retained = (await h.a.exec("git", ["rev-parse", journal])).stdout.trim();
  expect(await invokeStoreMigrate([], h.ports)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished",
    condition: expect.stringContaining("landed report cannot yet be established") } });
  expect((await h.a.exec("git", ["rev-parse", journal])).stdout.trim()).toBe(retained);
  expect((await peer.exec("git", [`--git-dir=${h.destinationDirectory}`, "rev-parse", ref])).stdout.trim()).toBe(invalid);
  await peer.git(["push", `--force-with-lease=${ref}:${invalid}`, h.destinationDirectory, `${repaired}:${ref}`]);
  expect(await invokeStoreMigrate([], h.ports)).toMatchObject({ status: "ok" });
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", journal])).stdout).toBe("");
  success(await h.store.pull({ history: [history] }));
  expect(success(await h.store.read({ reference: made.reference })).placement?.kind).toBe("active");
}, 90_000);
