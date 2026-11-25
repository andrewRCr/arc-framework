/** Explicit Errand subjects stay distinct from public inbox selectors. */
import { expect, it } from "vitest";
import { repairCliFixture, repairCli, cliRows } from "../helpers/repair-cli.js";
import { success } from "../helpers/store/suite-tools.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { addBareRemote } from "../helpers/integration.js";

it.each(["personal", "project"])("opens, resumes and abandons an Errand named %s through registered options", async slug => {
  const f = await repairCliFixture(), capture = (await cliRows(f, "project"))[0];
  if (!capture) throw new Error("Project capture required");
  await addBareRemote(f.cwd); await f.exec("git", ["push", "-u", "origin", "main"]);
  const args = ["errand", "open", slug, "--from-inbox", `project:${capture.id}`, "--json"];
  const opened = await repairCli(f, args);
  expect(opened, JSON.stringify(opened)).toMatchObject({ result: { outcome: "applied" } });
  const primary = success(await f.h.context.store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) }));
  const owner = primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Errand generation required");
  expect(await cliRows(f, owner.uid)).toMatchObject([{ id: capture.id, title: capture.title }]);
  expect(await cliRows(f, "personal")).toEqual([]);
  expect(await cliRows(f, "project")).toEqual([]);
  const repeated = await repairCli(f, args);
  expect(repeated, JSON.stringify(repeated)).toMatchObject({ result: { outcome: "refused", reason: "role-conflict" } });
  await f.exec("git", ["push", "-u", "origin", `chore/${slug}`]);
  const left = await repairCli(f, ["errand", "leave", slug, "--state", "paused", "--json"]);
  expect(left, JSON.stringify(left)).toMatchObject({ result: { outcome: "applied" } });
  const resumed = await repairCli(f, args);
  expect(resumed, JSON.stringify(resumed)).toMatchObject({ result: { outcome: "applied" } });
  expect(success(await f.h.context.store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) })).reference.owner).toEqual(owner);
  const abandoned = await repairCli(f, ["errand", "abandon", slug, "--json"]);
  expect(abandoned, JSON.stringify(abandoned)).toMatchObject({ result: { outcome: "applied" } });
  expect(await cliRows(f, "project")).toMatchObject([{ id: capture.id, title: capture.title, fields: { Created: "2026-01-01" } }]);
  expect(await cliRows(f, "personal")).toEqual([]);
  expect(await cliRows(f, owner.uid)).toEqual([]);
  expect(await readWorktreeMarker(f.cwd)).toEqual({ kind: "absent" });
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
}, 30_000);
