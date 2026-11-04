/** A real CLI trial admits a large personal namespace within one bounded invocation. */
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { MigrateReportSchema } from "../../src/lib/store/index.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { assertCliBuilt, CLI_PATH } from "../helpers/cli-spawn.js";
import { CALL_LIMIT } from "../helpers/call-limit.js";
import { recordCliInvocationForCurrentTest } from "../helpers/test-cost-timeout.js";

it("checks 20,000 distinct personal paths before reporting a known admission refusal", async () => {
  const h = await importFixture(), personal = join(h.root, ".arc/user/andrew");
  await mkdir(join(personal, "scratch"), { recursive: true });
  for (let offset = 0; offset < 20_000; offset += 100) {
    await Promise.all(Array.from({ length: 100 }, (_, index) => writeFile(join(personal, `scratch/item-${offset + index}.txt`), "Personal bytes.\n")));
  }
  await writeFile(join(personal, "private.env"), "API_TOKEN=example\n");
  assertCliBuilt();
  recordCliInvocationForCurrentTest(CALL_LIMIT);
  const { stdout } = await promisify(execFile)(process.execPath, [CLI_PATH, "store", "migrate", "--import", "--trial", "--json"], {
    cwd: h.root, timeout: CALL_LIMIT, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ARC_DISABLE_UPDATE_CHECKS: "1", NO_COLOR: "1", FORCE_COLOR: undefined },
  });
  const result = JSON.parse(stdout);
  expect(result.status).toBe("ok");
  const report = MigrateReportSchema.parse(result.result);
  expect(report.refused).toEqual([{ reference: { kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/private.env" }, rule: "store.env-file" }]);
  expect(report.differingNotes.filter(row => row.person === "andrew" && row.path.startsWith("scratch/item-") && row.kind === "disk-only")).toHaveLength(20_000);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
}, 2 * CALL_LIMIT);
