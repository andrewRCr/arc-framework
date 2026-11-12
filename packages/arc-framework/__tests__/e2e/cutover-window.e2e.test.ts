/** The repository-only source command creates a restore point in the named checkout and preserves an earlier one. */
import { resolve } from "node:path";
import { execa } from "execa";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { readWindowHold } from "../../src/scripts/cutover-window/hold.js";

const repository = resolve(import.meta.dirname, "../../../..");
const entry = resolve(import.meta.dirname, "../../src/scripts/cutover-window/main.ts");

it("records through the native source entry and refuses to overwrite the completed hold", async () => {
  const h = await windowFixture();
  const args = ["--import", "tsx", entry, "check", "--repo", h.root, "--flip-branch", h.flip.branch,
    "--flip-pr", String(h.flip.pullRequest), "--pull-requests", h.listingPath, "--json"];
  const run = () => execa(process.execPath, args, { cwd: repository, reject: false,
    env: { FORCE_COLOR: undefined, NO_COLOR: "1" } });
  const result = await run();
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ operation: "check", status: "passed", findings: [] });
  const held = await readWindowHold({ repo: h.root, exec: h.git, execInput: h.ports.execInput });
  expect(held.record.flip).toEqual(h.flip);
  const refs = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const refused = await run();
  expect(refused.exitCode).toBe(1);
  expect(JSON.parse(refused.stdout)).toMatchObject({ status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: "refs/arc-window/" }),
  ]) });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(refs);
}, 60_000);
