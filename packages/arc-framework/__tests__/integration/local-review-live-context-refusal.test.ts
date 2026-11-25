/** Review context corruption refuses with repair guidance and resumes after the fixture is repaired. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { handleReviewResolve, handleReviewFrontlineResolve } from "../../src/handlers/review.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordV3Schema } from "../../src/lib/errand/identity-record.js";
import { readLiveErrandClaimId, readLocalReviewLiveContext } from "../../src/scripts/review-gate/hosts/local/live-context.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../src/scripts/review-gate/policy/standard-review.js";
import { execFileAsync, makeGitExec } from "../helpers/integration.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const roots: string[] = [];
const branch = "chore/context-refusal";
const claimId = "0123456789abcdef0123456789abcdef";
const identityRef = "refs/arc/user/andrew/errands";
const projectRoot = resolve(import.meta.dirname, "../../../..");
afterEach(async () => { await Promise.all(roots.splice(0).map(root => removeGitBackedDir(root))); });

async function git(root: string, args: string[]): Promise<string> {
  return (await execFileAsync("git", args, { cwd: root })).stdout.trim();
}

async function fixture(): Promise<{ root: string; head: string }> {
  const root = await createTempRepoCore({ prefix: "arc-live-context-refusal-", identity: "andrew" });
  roots.push(root);
  await mkdir(join(root, ".arc", "system"), { recursive: true });
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await writeFile(join(root, ".arc", "system", "arc-config.yml"),
    await readFile(join(projectRoot, ".arc", "system", "arc-config.yml"), "utf8"));
  await git(root, ["add", "."]);
  await git(root, ["commit", "-qm", "fixture base"]);
  const head = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["switch", "-c", branch]);
  return { root, head };
}

async function identity(root: string, malformed = false): Promise<void> {
  const content = malformed ? "{}\n" : serializeTransientIdentityRecord(TransientIdentityRecordV3Schema.parse({
    version: 3, kind: "errand", slug: "context-refusal", claimId, purpose: "errand", origin: "description", originEntry: null,
    intent: "Review context", branch, state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-11-10T00:00:00Z", updatedAt: "2026-11-10T00:00:00Z",
  }));
  const file = join(root, "identity-record.json");
  await writeFile(file, content);
  const oid = await git(root, ["hash-object", "-w", file]);
  const index = join(root, "identity-index");
  const run = async (args: string[]) => (await execFileAsync("git", args,
    { cwd: root, env: { ...process.env, GIT_INDEX_FILE: index } })).stdout.trim();
  await run(["read-tree", "--empty"]);
  await run(["update-index", "--add", "--cacheinfo", "100644", oid, "context-refusal"]);
  const tree = await run(["write-tree"]);
  const tip = await git(root, ["commit-tree", tree, "-m", "identity snapshot"]);
  await git(root, ["update-ref", identityRef, tip]);
  await Promise.all([rm(index), rm(file)]);
}

async function policy(root: string, head: string, mode: "policy" | "frontline" = "policy"): Promise<{ exitCode: number; output: unknown }> {
  const output: string[] = [];
  let exitCode = 0;
  const request = mode === "frontline" ? { schemaVersion: 1,
    changeSet: { schemaVersion: 1, changeSetState: "known", contentKind: "documentation", reviewRisk: "routine",
      changeDeterminacy: "atomic", ownership: "self", surfaceAuthority: "ordinary",
      assurance: { workContext: "errand", workClass: "none" }, activity: { selfReview: true, frontlineReview: true } },
    invocation: { mode: "force", sourceId: "coderabbit-cli" },
    target: { kind: "change-set", baseRef: "main", diffBaseSha: head, headSha: head } }
    : { schemaVersion: 1, lane: "frontline", frontlineActive: true,
      target: { repository: "owner/repository", pullRequest: null, headSha: head },
      standardReview: { obligation: "required", reasons: ["sensitive-change-set"],
        rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version, rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
        retrigger: "full-final", count: 1 }, completedPasses: 0, attempts: [] };
  const boundary = {
    resolveRoot: () => root, readText: async () => JSON.stringify(request),
    write: (text: string) => { output.push(text); }, setExitCode: (code: number) => { exitCode = code; },
  };
  const handler = mode === "frontline" ? handleReviewFrontlineResolve : handleReviewResolve;
  await handler("-", boundary, undefined, { exec: makeGitExec(root) });
  expect(output).toHaveLength(1);
  return { exitCode, output: JSON.parse(output[0] ?? "null") as unknown };
}

it.each([
  { kind: "ambiguous-meta", condition: /multiple active work units/u, repair: /Branch fields/u },
  { kind: "incomplete-meta", condition: /metadata is incomplete/u, repair: /Complete the required fields/u },
  { kind: "incomplete-identity", condition: /Transient identity dropped/u, repair: /transient identity ref for andrew/u },
] as const)(
  "reports $kind through the shared read and policy handler, then continues after repair", async ({ kind, condition, repair }) => {
    const { root, head } = await fixture();
    const metaPath = join(root, ".arc", "active", "meta-example.md");
    const validMeta = makeMetaFixture("example", { branch, owner: "andrew", workClass: "Light" });
    if (kind === "ambiguous-meta") {
      await writeFile(metaPath, validMeta);
      await writeFile(join(root, ".arc", "active", "meta-other.md"),
        makeMetaFixture("other", { branch, owner: "andrew", workClass: "Light" }));
    } else if (kind === "incomplete-meta") {
      await writeFile(metaPath, validMeta.replace(/`andrew`/u, "—"));
    } else {
      await identity(root, true);
    }
    const input = { cwd: root, exec: makeGitExec(root) };
    const failure: unknown = await readLocalReviewLiveContext(input).catch((error: unknown) => error);
    expect.soft(failure).toMatchObject({ code: "corrupt-state", condition: expect.stringMatching(condition), remedy: { text: expect.stringMatching(repair) } });
    await expect.soft(readLiveErrandClaimId(input, claimId)).rejects.toMatchObject({ code: "corrupt-state" });
    const refused = await policy(root, head);
    expect.soft(refused).toMatchObject({ exitCode: 1, output: { mode: "review-resolve", error: { code: "corrupt-state" },
      remedy: { argv: ["arc", "review", "resolve", "-"], stdin: { completedPasses: 0, attempts: [] } } } });

    if (kind === "incomplete-identity") {
      expect.soft(await policy(root, head, "frontline")).toMatchObject({ exitCode: 1,
        output: { mode: "review-frontline-resolve", error: { code: "corrupt-state" },
          remedy: { argv: ["arc", "review", "frontline", "resolve", "-"] } } });
    }

    if (kind === "ambiguous-meta") await rm(join(root, ".arc", "active", "meta-other.md"));
    else if (kind === "incomplete-meta") await writeFile(metaPath, validMeta);
    else await identity(root);
    expect(await readLocalReviewLiveContext(input)).toMatchObject({ context: { activeIdentity: "andrew" } });
    const repaired = await policy(root, head);
    expect(repaired).toMatchObject({ exitCode: 0, output: { state: "ready", nextAction: "run-frontline" } });
    if (kind === "incomplete-identity") expect(await policy(root, head, "frontline"))
      .toMatchObject({ exitCode: 0, output: { state: "ready", nextAction: "run-frontline" } });
  },
);
