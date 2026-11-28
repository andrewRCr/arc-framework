/** Start a work unit and save its draft from the checkout ARC creates under default protection. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { parseStampedFile } from "../../src/lib/store/projection/stamp.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { cleanupTempDir, commitAll, createTempRepo, git, runArcNoTty } from "./helpers.js";

const SEQUENCE_TIMEOUT_MS = 90_000;

async function runSuccessfully(cwd: string, ...args: string[]): Promise<string> {
  const result = await runArcNoTty(args, cwd, { env: { FORCE_COLOR: undefined } });
  expect(result.exitCode, `arc ${args.join(" ")}\n${result.stdout}${result.stderr}`).toBe(0);
  return result.stdout;
}

it("starts a work unit under partial protection and saves its draft from the spawned checkout", async () => {
  const slug = SlugSchema.parse("search-filters");
  const identity = SlugSchema.parse("test-user");
  const repo = await createTempRepo("arc-store-partial-protection-");
  const checkout = `${repo}.${slug}`;
  try {
    await runSuccessfully(repo, "init", "--yes", "--name", "test-project");
    await writeFile(join(repo, ".arc", "system", "arc-checks.yml"), JSON.stringify({
      checks: {
        draft: {
          command: [process.execPath, "-e", "console.log(JSON.stringify(process.argv.slice(1)))", "--"],
          mode: "selection",
          inputs: [".arc/active/current/draft-*.md"],
        },
      },
    }));
    await commitAll(repo, "chore: initialize ARC");
    const base = await git(repo, ["rev-parse", "refs/heads/main"]);
    const branchRefs = ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/"];
    const branches = await git(repo, branchRefs);
    await runSuccessfully(repo, "start", slug, "--new");

    const owner = OwnerIdentitySchema.parse({ type: "work-item", name: slug });
    const meta = await readStoreRecord(repo, identity, recordReferences["work-item/meta"](owner));
    expect(meta).toMatchObject({ placement: { kind: "active" }, fields: { state: "Planning", owner: identity } });
    const createdOwner = meta.reference.owner;
    if (createdOwner.type !== "work-item" || createdOwner.uid === undefined) {
      throw new Error(`Expected a stored work-unit UID for ${slug}`);
    }
    expect(createdOwner.name).toBe(slug);
    expect(await readWorktreeMarker(checkout)).toMatchObject({
      kind: "present",
      marker: {
        spawnedByArc: true,
        wuName: slug,
        createdFor: { kind: "work-unit", name: slug, uid: createdOwner.uid },
      },
    });
    expect(await git(checkout, ["branch", "--show-current"])).toBe("");
    expect(await git(checkout, ["rev-parse", "HEAD"])).toBe(base);
    expect(await git(repo, branchRefs)).toBe(branches);
    const current = join(checkout, ".arc", "active", "current");
    const projectedMeta = parseStampedFile(await readFile(join(current, `meta-${slug}.md`), "utf8"));
    expect(projectedMeta.content).toBe(meta.content);

    const preflight = await runSuccessfully(checkout, "plan", "check", "--name", slug, "--json");
    expect(JSON.parse(preflight)).toEqual({ route: "proceed", currentBranch: null, protection: "partial" });

    const draftName = `draft-${slug}.md`;
    const draft = "# Draft: Search filters\n\n## Problem / Motivation\n\nLimit results to the selected project.\n\n"
      + "## Alternatives\n\nReuse the existing project selector and apply its value to the search query.\n";
    await writeFile(join(current, draftName), draft, "utf8");
    const increment = await runSuccessfully(checkout, "check", "increment", "--json");
    expect(JSON.parse(increment).result, `Check ${draftName} before save`).toMatchObject({
      status: "completed",
      checks: [{
        id: "draft",
        kind: "feedback",
        outcome: "passed",
        output: JSON.stringify([`.arc/active/current/${draftName}`]),
      }],
    });
    await runSuccessfully(checkout, "save");
    const savedDraft = await readStoreRecord(repo, identity, recordReferences["work-item/draft"](createdOwner));
    expect(savedDraft.content).toBe(draft);

    await runSuccessfully(checkout, "set-class", "Heavy", slug);
    await runSuccessfully(checkout, "repoint-design", "draft-created");
    const captured = await readStoreRecord(repo, identity, meta.reference);
    expect(captured.fields).toMatchObject({ workClass: "Heavy", design: [draftName] });
    expect(await git(repo, branchRefs)).toBe(branches);
    expect(await git(checkout, ["branch", "--show-current"])).toBe("");
    expect(await git(checkout, ["rev-parse", "HEAD"])).toBe(base);
  } finally {
    await cleanupTempDir(checkout);
    await cleanupTempDir(repo);
  }
}, SEQUENCE_TIMEOUT_MS);
