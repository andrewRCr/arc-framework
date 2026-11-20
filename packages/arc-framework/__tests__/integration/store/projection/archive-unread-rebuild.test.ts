/** A rebuild that cannot read an archived file leaves it for a later lay to rebuild, and nothing judges an edit there first. */
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { success, update } from "../../../helpers/store/suite-tools.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";

const denied = vi.hoisted(() => ({ paths: new Set<string>() }));
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual, openSync: (...args: Parameters<typeof actual.openSync>) => {
    // A read the file's permissions refuse, which no other step of the rebuild meets first.
    if (denied.paths.has(String(args[0]))) throw Object.assign(new Error("EACCES: permission denied, open"), { code: "EACCES" });
    return actual.openSync(...args);
  } };
});

afterEach(() => { denied.paths.clear(); beginProjectionCommand(); });

type Fixture = Awaited<ReturnType<typeof archiveRetirementFixture>>;
type File = "unedited" | "edited" | "stale";
type Cause = "refused read" | "nested checkout";

/** Leave the archived file as the case needs it, returning the stored content no command may replace. */
async function prepare(h: Fixture, file: File): Promise<string> {
  if (file === "edited") await h.write(h.path, `${h.primary.content}\nA hand edit made without opening the file.\n`);
  if (file !== "stale") return h.primary.content;
  // Another worktree stores a newer version; this file still holds the older bytes, without their stamp.
  const current = success(await h.f.store.read({ reference: h.primary.reference }));
  const newer = `${current.content}\nA newer stored version.\n`;
  success(await h.f.store.write(update(h.f, current, newer)));
  await chmod(join(h.checkout, h.path), 0o644);
  await writeFile(join(h.checkout, h.path), h.primary.content);
  return newer;
}

/** Rebuild a lost index while the cause keeps the rebuild from reading the file, returning its repair. */
async function rebuildUnread(h: Fixture, cause: Cause): Promise<() => Promise<void>> {
  const { location } = await h.disk();
  await rm(join(location.stateDir, "index"));
  if (cause === "refused read") denied.paths.add(join(h.checkout, h.path));
  const nested = join(h.checkout, h.folder, ".git");
  if (cause === "nested checkout") { await mkdir(nested); await writeFile(join(nested, "HEAD"), "ref: refs/heads/main\n"); }
  const synced = await projectionCommand(h.input, ["sync"]);
  expect(synced.diagnostics).toContain(cause === "refused read" ? "EACCES" : "belongs to another checkout");
  expect((await h.disk()).index.entries[h.path]).toMatchObject({ kind: "record", pending: true, stat: null });
  return async () => { denied.paths.clear(); await rm(nested, { recursive: true, force: true }); };
}

it.each(["unedited", "edited", "stale"] as const)("rebuilds an %s archived file whose rebuild read was refused at the command after the repair",
  async file => {
  const h = await archiveRetirementFixture();
  const stored = await prepare(h, file);
  const before = await readFile(join(h.checkout, h.path));
  const repair = await rebuildUnread(h, "refused read");
  await repair();
  await projectionCommand(h.input, ["status"]);
  // An edited or stale file has no trustworthy basis once read, so it is withheld; an unedited one settles.
  expect((await h.disk()).index.entries[h.path]).toMatchObject(file === "unedited"
    ? { kind: "record", pending: false, withheld: false, refused: null } : { kind: "record", withheld: true });
  expect(await readFile(join(h.checkout, h.path))).toEqual(before);
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(stored);
}, 60_000);

const firsts = (["refused read", "nested checkout"] as const).flatMap(cause => (["save", "removal check"] as const).map(first => ({ cause, first })));
it.each(firsts)("holds a stale file the rebuild did not read ($cause) at $first, the first command after the repair", async ({ cause, first }) => {
  const h = await archiveRetirementFixture();
  const stored = await prepare(h, "stale");
  const before = await readFile(join(h.checkout, h.path));
  const repair = await rebuildUnread(h, cause);
  await repair();
  if (first === "removal check") {
    expect(await checkProjectionRemoval(h.checkout, h.context)).toMatchObject({ kind: "would-refuse",
      remedy: { text: expect.stringContaining(`Then run any arc command from ${h.checkout}, whose rebuild reads the file`) } });
    await projectionCommand(h.input, ["status"]);
  } else await projectionCommand(h.input, ["save"]);
  // The lay reads the stale file and withholds it; nothing took it in as an edit of the newer stored version.
  expect((await h.disk()).index.entries[h.path]).toMatchObject({ kind: "record", withheld: true });
  expect(await readFile(join(h.checkout, h.path))).toEqual(before);
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(stored);
}, 60_000);
