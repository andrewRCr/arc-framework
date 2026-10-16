/** Handoff replacement and boundary repair use registered CLI and real Store/Git outcomes. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { success } from "../helpers/store/suite-tools.js";
import { ParsedMetaRecordSchema } from "../../src/lib/active/meta-schema.js";
import { writeWorktreeMarker, ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs } from "../../src/lib/git/worktree-marker.js";

it("overwrites handoff context, refuses a boundary without writing, then accepts repaired stdin", async () => {
  const f = await repairCliFixture(), meta = await f.h.workUnit();
  await ensureWorktreeMarkerIgnored(f.cwd, f.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(f.cwd, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: new Date(0).toISOString(), createdFor: { kind: "work-unit", name: meta.reference.owner.name } });
  const file = join(f.cwd, ".git/handoff.json");
  await writeFile(file, JSON.stringify({ schemaVersion: 1, sessionContext: "Prior session context", nextAction: "Continue", sessionType: "execution" }));
  expect(await repairCli(f, ["handoff", "write", file])).toMatchObject({ result: { status: "written" } });
  const prior = success(await f.h.context.store.read({ reference: meta.reference }));
  expect(ParsedMetaRecordSchema.parse(prior.fields)).toMatchObject({ sessionContext: "Prior session context", sessionType: "execution" });
  const version = success(await f.h.context.store.version());
  const invalid = { schemaVersion: 1, sessionContext: "Keep\n## Escaped section", nextAction: "Continue" };
  const refused = await repairCli(f, ["handoff", "write", "-"], { stdin: JSON.stringify(invalid) });
  expect(refused).toMatchObject({ exitCode: 1, result: { status: "refused", refusal: { condition: expect.stringContaining("## Escaped section"), remedy: { text: expect.stringContaining("Rewrite") } } } });
  expect(success(await f.h.context.store.version())).toBe(version);
  expect(success(await f.h.context.store.read({ reference: meta.reference }))).toEqual(prior);
  expect(await repairCli(f, ["handoff", "write", "-"], { stdin: JSON.stringify({ ...invalid, sessionContext: "Repaired replacement context" }) })).toMatchObject({ result: { status: "written", stateAtHandoff: version, commitAtHandoff: f.head.trim() } });
  const after = success(await f.h.context.store.read({ reference: meta.reference }));
  expect(ParsedMetaRecordSchema.parse(after.fields)).toMatchObject({ sessionContext: "Repaired replacement context", sessionType: null, stateAtHandoff: version, commitAtHandoff: f.head.trim() });
  expect(after.content).not.toContain("Prior session context");
  expect(success(await f.h.context.store.history({ reference: meta.reference }))).toHaveLength(3);
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
}, 30000);
