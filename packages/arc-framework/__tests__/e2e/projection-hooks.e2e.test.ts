/** Built CLI commands retain whole JSON and leave projected state untouched over the in-repo backend. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createTempRepo, cleanupTempDir, runArc } from "./helpers.js";

it("leaves projection disabled while a nested config command emits whole JSON", async () => {
  const checkout = await createTempRepo("arc-projection-hooks-");
  try {
    const state = join(checkout, ".git", "arc-projection");
    const file = join(checkout, ".arc", "user", "andrew", "document.md");
    const nested = join(checkout, "nested");
    await mkdir(state, { recursive: true });
    await mkdir(join(checkout, ".arc", "user", "andrew"), { recursive: true });
    await mkdir(nested);
    await writeFile(join(state, "index"), "unreadable projection index");
    await writeFile(file, "hand edit awaiting the off-branch store\n");
    const result = await runArc(["config", "status", "--json"], nested);
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: "full" });
    expect(result.stderr).not.toContain("projection:");
    expect(await readFile(file, "utf8")).toBe("hand edit awaiting the off-branch store\n");
    expect(await readFile(join(state, "index"), "utf8")).toBe("unreadable projection index");
    expect(await readdir(state)).toEqual(["index"]);
  } finally { await cleanupTempDir(checkout); }
});
