/** A returned alias is unlinked in the same turn its identity is tested, so no other step of the command runs between. */
import { link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { removeReturnedAsideFile } from "../../../../src/lib/store/projection/aside-cleanup.js";

const observed = vi.hoisted(() => ({ onStat: null as null | ((path: string) => void) }));
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual, lstatSync: ((...args: Parameters<typeof actual.lstatSync>) => {
    const stat = actual.lstatSync(...args);
    observed.onStat?.(String(args[0]));
    return stat;
  }) as typeof actual.lstatSync };
});

let checkout: string;
beforeEach(async () => { checkout = await mkdtemp(join(tmpdir(), "arc-returned-alias-")); });
afterEach(async () => { observed.onStat = null; await rm(checkout, { recursive: true, force: true }); });

it("lets nothing run between the identity test and the unlink", async () => {
  const { existsSync, renameSync, writeFileSync } = await import("node:fs");
  const path = ".arc/user/andrew/scratch/note.txt";
  const location = nameAsideFile({ path, base: "a".repeat(40), role: "aside",
    writer: { pid: 1, processInstance: "alias-test", processScope: "alias-scope" } });
  const at = { alias: join(checkout, location), path: join(checkout, path) };
  await Promise.all([dirname(at.alias), dirname(at.path)].map(folder => mkdir(folder, { recursive: true })));
  await writeFile(at.alias, "first\n");
  await link(at.alias, at.path);
  const aliasAtReplacement: boolean[] = [];
  observed.onStat = path => {
    if (path !== at.path) return;
    observed.onStat = null;
    queueMicrotask(() => {
      aliasAtReplacement.push(existsSync(at.alias));
      writeFileSync(`${at.path}.editor`, "second\n");
      renameSync(`${at.path}.editor`, at.path);
    });
  };
  expect(await removeReturnedAsideFile(checkout, location, path)).toBe("removed");
  expect(aliasAtReplacement).toEqual([false]);
  expect(await readFile(at.path, "utf8")).toBe("second\n");
});
