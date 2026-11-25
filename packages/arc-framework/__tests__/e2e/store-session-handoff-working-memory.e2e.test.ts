/** A linked checkout's handoff must save an approved working-memory edit before sync. */
import { appendFile } from "node:fs/promises";
import { expect, it } from "vitest";

import type { SessionHandoffResult } from "../../src/commands/status.js";
import { lifecycleRepository } from "../helpers/store-lifecycle-fixture.js";
import {
  fixtureStore, personalRecords, SESSION_COMMAND_TIMEOUT_MS, sessionIdentity, stored,
} from "../helpers/store-session-personal-fixture.js";
import { git } from "./helpers.js";

it.each(["between-work-units", "release-work-unit"] as const)("saves working memory during a %s handoff", async kind => {
  const h = await lifecycleRepository({ protection: "partial", remote: true });
  const name = "handoff-memory";
  const checkout = h.checkoutPath(name);
  if (kind === "release-work-unit") {
    const started = await h.run(["start", name, "--new", "--yes"]);
    expect(started.exitCode, started.output).toBe(0);
  } else {
    await git(h.repo, ["worktree", "add", "-b", name, checkout]);
  }

  const status = await h.run(["status", "--session-handoff", "--json"], checkout);
  expect(status.exitCode, status.output).toBe(0);
  const { handoffLocus, pathSet } = JSON.parse(status.stdout) as SessionHandoffResult;
  if (!handoffLocus.ok || handoffLocus.value.kind !== kind) {
    throw new Error(`Expected a ${kind} handoff: ${JSON.stringify(handoffLocus)}`);
  }
  expect(handoffLocus.value.checkoutPath).toBe(checkout);
  if (!pathSet.ok || pathSet.value.workingMemory === null || pathSet.value.workingMemoryCheckout === null) {
    throw new Error(`Missing working-memory path or checkout: ${JSON.stringify(pathSet)}`);
  }
  expect(pathSet.value.workingMemoryCheckout).toBe(kind === "release-work-unit" ? checkout : h.repo);
  const entry = "**Use the staging dataset:**";
  await appendFile(pathSet.value.workingMemory,
    `\n${entry}\n_Remove when: the migration finishes._\n\nRun validation against staging.\n`);
  for (const args of [["check", "increment"], ["save"]]) {
    const result = await h.run(args, pathSet.value.workingMemoryCheckout);
    expect(result.exitCode, result.output).toBe(0);
  }

  const reference = personalRecords(sessionIdentity).memory;
  const saved = stored(await fixtureStore(checkout).read({ reference }));
  const sync = await h.run(["sync", "--json"], checkout);
  expect(sync.exitCode, sync.output).toBe(0);
  expect(JSON.parse(sync.stdout)).toMatchObject({ state: { push: { result: "success" } } });
  const pushed = await git(h.origin, ["show",
    `refs/arc/user/${sessionIdentity}/personal:${sessionIdentity}/WORKING-MEMORY.md.${sessionIdentity}`]);
  expect({ savedBeforeSync: saved.content.includes(entry), published: pushed.includes(entry) })
    .toEqual({ savedBeforeSync: true, published: true });
}, SESSION_COMMAND_TIMEOUT_MS);
