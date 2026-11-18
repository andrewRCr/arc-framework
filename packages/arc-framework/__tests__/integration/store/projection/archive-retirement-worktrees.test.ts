/** Real worktree removal preserves reported archive corrections and persists explicitly opened edits. */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { createProjectionRemovalSlots } from "../../../../src/lib/store/projection/removal-slots.js";
import { removeWorktreeCheckout } from "../../../../src/lib/git/worktree-removal.js";

afterEach(() => { beginProjectionCommand(); });

async function fixture() {
  const h = await archiveRetirementFixture();
  const remove = () => removeWorktreeCheckout({ checkoutPath: h.checkout, primaryWorktreePath: h.f.root,
    exec: (command, args, options) => h.f.ports.exec(command, args, { cwd: h.f.root, ...options }),
    slots: createProjectionRemovalSlots({ store: h.f.store, identity: "andrew" }),
  });
  return { ...h, remove };
}

it.each(["forced", "new"] as const)("reports an unopened %s archive file and refuses removal until edit and save", async kind => {
  const h = await fixture(), path = kind === "forced" ? h.path : `${h.folder}/retirement-correction.md`;
  const reference = kind === "forced" ? h.primary.reference : recordReferences["work-item/companion"](h.primary.reference.owner, "retirement-correction.md");
  const before = await h.f.store.read({ reference });
  const content = kind === "forced" ? h.primary.content + "\nA correction kept through removal.\n" : "A new correction kept through removal.\n";
  await h.write(path, content);
  const bytes = await readFile(join(h.checkout, path), "utf8");
  const sync = await projectionCommand(h.input, ["sync"]);
  expect(sync.diagnostics).toContain(path);
  expect(sync.diagnostics).toContain(`arc edit ${path}`);
  expect(sync.diagnostics).toContain("arc save");
  expect(await h.f.store.read({ reference })).toEqual(before);
  const refused = await h.remove();
  expect(refused).toMatchObject({ kind: "refused", check: { reason: "persist-would-refuse", remedy: {
    text: expect.stringContaining(`arc edit ${path}`),
  } } });
  if (refused.kind !== "refused" || refused.check.reason !== "persist-would-refuse") throw new Error("No correction remedy");
  expect(refused.check.remedy.text).toContain("arc save");
  expect(await readFile(join(h.checkout, path), "utf8")).toBe(bytes);
  await h.openAndSave(path);
  expect(await h.remove()).toEqual({ kind: "removed" });
  await expect(stat(h.checkout)).rejects.toMatchObject({ code: "ENOENT" });
  expect(success(await h.f.store.read({ reference })).content).toBe(content);
}, 30_000);

it("persists an opened archived edit while physically removing its linked checkout", async () => {
  const h = await fixture();
  expect((await projectionCommand(h.input, ["edit", join(h.checkout, h.path)])).result).toMatchObject({ status: "ok" });
  const before = success(await h.f.store.read({ reference: h.primary.reference }));
  const content = before.content + "\nPersisted by physical retirement.\n";
  await h.write(h.path, content);
  expect(success(await h.f.store.read({ reference: h.primary.reference })).version).toBe(before.version);
  expect(await h.remove()).toEqual({ kind: "removed" });
  await expect(stat(h.checkout)).rejects.toMatchObject({ code: "ENOENT" });
  const stored = success(await h.f.store.read({ reference: h.primary.reference }));
  expect(stored.content).toBe(content);
  expect(stored.version).not.toBe(before.version);
}, 30_000);
