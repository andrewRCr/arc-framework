/** Post-join orientation describes how the selected backend carries state. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { useInRepoStore } from "../helpers/in-repo-store-override.js";
import { expectExit, scratchRepo } from "../helpers/store-session-personal-fixture.js";
import { runArcNoTty } from "./helpers.js";

async function joinAsContributor(): Promise<string> {
  const root = await scratchRepo();
  await mkdir(join(root, ".arc/system"), { recursive: true });
  await writeFile(join(root, ".arc/system/arc-config.yml"), "pm.mode: none\n");
  const args = ["--no-input", "join", "--contributor", "--tools", "", "--identity", "alice"];
  const result = await runArcNoTty(args, root);
  expectExit(args, result);
  expect(result.stdout).toContain("Joined as contributor.");
  return result.stdout.slice(result.stdout.indexOf("Joined as contributor."));
}

it("explains store sync and work-unit recovery after a ref-backed join", async () => {
  const message = await joinAsContributor();
  expect(message).not.toMatch(/git notes|user notes/iu);
  expect(message).toMatch(/\bstore\b/iu);
  expect(message).toContain("arc sync");
  expect(message).toContain("session-init");
  expect(message).toMatch(/\bmeta\b/iu);
});

it("keeps Git notes sync guidance for an in-repo join", async () => {
  useInRepoStore();
  const message = await joinAsContributor();
  expect(message).toMatch(/git notes/iu);
  expect(message).toContain("arc sync");
});
