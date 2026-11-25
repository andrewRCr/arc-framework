import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { expect, it } from "vitest";
import { lifecycleRepository, LIFECYCLE_TIMEOUT_MS } from "../helpers/store-lifecycle-fixture.js";

it.each([
  { workflow: "create-spec", startOtherUnit: false },
  { workflow: "draft-design", startOtherUnit: false },
  { workflow: "generate-tasks", startOtherUnit: true },
])("$workflow locates a named backlog stub (another unit started here: $startOtherUnit)", async ({ workflow, startOtherUnit }) => {
  const { repo, run } = await lifecycleRepository();
  const slug = "upcoming";
  const stub = await run(["stub", slug, "--commitment", "planned", "--priority", "P2", "--class", "Light"]);
  expect(stub.exitCode, stub.output).toBe(0);
  if (startOtherUnit) {
    const start = await run(["start", "other", "--new", "--here", "--yes"]);
    expect(start.exitCode, start.output).toBe(0);
  }

  const control = await run(["view", "meta", "--for", slug, "--path"]);
  expect(control.exitCode, control.output).toBe(0);
  const expected = join(".arc", "backlog", "planned", slug, `meta-${slug}.md`);
  expect(relative(repo, control.stdout.trim())).toBe(expected);

  const instructions = await readFile(join(repo, ".arc/system/workflows/arc", `${workflow}.md`), "utf8");
  const lookup = instructions.match(/`arc (view meta\b[^`]+)`/u)?.[1];
  if (!lookup) throw new Error(`Missing meta lookup in ${workflow}`);
  const result = await run(lookup.replace(/<[^>]+>|\{[^}]+\}/gu, slug).trim().split(/\s+/u));
  expect(result.exitCode, result.stderr).toBe(0);
  expect(relative(repo, result.stdout.trim())).toBe(expected);
}, LIFECYCLE_TIMEOUT_MS);

it("locates a newly started unit's draft beside its meta in the spawned checkout", async () => {
  const h = await lifecycleRepository({ remote: true });
  const slug = "fresh";
  const checkout = h.checkoutPath(slug);
  const started = await h.run(["start", slug, "--new", "--yes"]);
  expect(started.exitCode, started.output).toBe(0);
  const guide = await readFile(join(checkout, ".arc/system/workflows/arc/draft-design.md"), "utf8");
  const lookup = guide.match(/`arc (view meta\b[^`]+)`/u)?.[1];
  if (!lookup) throw new Error("Draft-design gives no projected destination");
  const result = await h.run(lookup.replace(/<[^>]+>|\{[^}]+\}/gu, slug).split(/\s+/u), checkout);
  expect(result.exitCode, result.output).toBe(0);
  expect(relative(checkout, result.stdout.trim())).toBe(join(".arc", "active", "current", `meta-${slug}.md`));
}, LIFECYCLE_TIMEOUT_MS);
