/** The personal workspace README's read commands list the developer's captures. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { identity, invoke, repository } from "../helpers/store-locus-inbox-fixture.js";
import { runArcNoTty } from "./helpers.js";

it("reads a personal capture using the workspace tree and read-contract table", async () => {
  const root = await repository();
  const readme = await readFile(join(root, ".arc/user/README.md"), "utf8");
  const tree = readme.split("```text")[1]?.split("```")[0] ?? "";
  const contract = readme.split("## Framework Read Contract")[1]?.split("## Personal Content")[0] ?? "";
  const title = "Check the personal capture";
  await invoke(root, ["route", "--to", "personal", "--section", "Errand"], 0, { stdin: `### **${title}**\n\nDetails\n` });

  for (const example of [tree, contract]) {
    const command = example.match(/`arc (inbox\b[^`\r\n]*)`/u)?.[1];
    expect(command, "Each location should show a personal inbox command").toBeDefined();
    const result = await runArcNoTty(command?.split(/\s+/u) ?? [], root);
    expect.soft(result.exitCode, `arc ${command}\n${result.stderr}`).toBe(0);
    if (result.exitCode === 0) expect.soft(result.stdout).toContain(title);
  }
  const path = tree.match(/──\s+([^#\r\n]+)\s+#.*`arc inbox\b/u)?.[1]?.trim();
  expect(path, "The workspace tree should name the projected inbox file").toMatch(/^[\w.-]+\.md$/u);
  expect(await readFile(join(root, ".arc/user", identity, path ?? ""), "utf8")).toContain(title);
});
