/** Identity reads use existing authority without creating first-use state. */
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readRepositoryIdentity, resolveRepositoryIdentity } from "../../../../../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../../src/lib/git-common-state.js";
import { scriptGitExec } from "../../../../../helpers/git-exec-fake.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it("reads the published identity without creating first-use state", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-identity-read-")); roots.push(root);
  const exec = scriptGitExec([{ match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: root }] }]).exec;
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  expect(await readRepositoryIdentity(publisher)).toBeNull();
  expect(await readdir(root)).toEqual([]);
  const id = await resolveRepositoryIdentity(publisher);
  const before = await publisher.snapshot({ root: "review-gate", namespace: "identity" });
  expect(await readRepositoryIdentity(publisher)).toBe(id);
  expect(await publisher.snapshot({ root: "review-gate", namespace: "identity" })).toEqual(before);
});

it("resolves the stored project ID in two clones without reading or minting clone-local identities", async () => {
  const { createReviewHarness } = await import("../../../../../helpers/store/review-harness.js");
  const { createReviewCheckout } = await import("../../../../../helpers/store/review-checkout.js");
  const harness = createReviewHarness();
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  await harness.seedProject(projectId);
  const first = await createReviewCheckout(harness), second = await createReviewCheckout(harness);
  try {
    const a = new RepositoryGitCommonStatePublisher(first.exec, first.cwd);
    const b = new RepositoryGitCommonStatePublisher(second.exec, second.cwd);
    const oldId = "123e4567-e89b-42d3-a456-426614174001";
    expect(await resolveRepositoryIdentity(a, () => oldId)).toBe(oldId);
    const before = await a.snapshot({ root: "review-gate", namespace: "identity" });
    expect.soft(await resolveRepositoryIdentity(a, undefined, first)).toBe(projectId);
    expect.soft(await resolveRepositoryIdentity(b, undefined, second)).toBe(projectId);
    expect.soft(await readRepositoryIdentity(b, second)).toBe(projectId);
    expect.soft(await a.snapshot({ root: "review-gate", namespace: "identity" })).toEqual(before);
    expect.soft(await readdir(second.commonDir)).toEqual([]);
  } finally { await Promise.all([first.cleanup(), second.cleanup()]); }
});

it("preserves the typed missing-project remedy and succeeds in a fresh invocation after repair", async () => {
  const { createReviewHarness } = await import("../../../../../helpers/store/review-harness.js");
  const { createReviewCheckout } = await import("../../../../../helpers/store/review-checkout.js");
  const { resolveReviewInvocation } = await import("../../../../../../src/scripts/review-gate/runtime/invocation.js");
  const { ProjectIdentityError } = await import("../../../../../../src/lib/store/project-identity.js");
  const harness = createReviewHarness(), checkout = await createReviewCheckout(harness);
  try {
    const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
    const initial = resolveReviewInvocation(checkout);
    await expect.soft(resolveRepositoryIdentity(publisher, undefined, initial)).rejects.toBeInstanceOf(ProjectIdentityError);
    await expect.soft(readRepositoryIdentity(publisher, initial)).rejects.toMatchObject({ failure: {
      reason: "Project identity record is missing.", remedy: { text: expect.stringContaining("Restore the project's unique, valid identity record") },
    } });
    const projectId = "123e4567-e89b-42d3-a456-426614174099";
    await harness.seedProject(projectId);
    const repaired = resolveReviewInvocation({ ...checkout, projectId: undefined });
    expect.soft(await resolveRepositoryIdentity(publisher, undefined, repaired)).toBe(projectId);
    expect.soft(await readRepositoryIdentity(publisher, repaired)).toBe(projectId);
    expect.soft(await readdir(checkout.commonDir)).toEqual([]);
  } finally { await checkout.cleanup(); }
});

it("uses the supplied project reader without opening another identity source", async () => {
  const { createReviewHarness } = await import("../../../../../helpers/store/review-harness.js");
  const { createReviewCheckout } = await import("../../../../../helpers/store/review-checkout.js");
  const checkout = await createReviewCheckout(createReviewHarness());
  try {
    const projectId = "123e4567-e89b-42d3-a456-426614174099";
    const invocation = { ...checkout, projectId: async () => projectId };
    const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
    expect.soft(await resolveRepositoryIdentity(publisher, undefined, invocation)).toBe(projectId);
    expect.soft(await readRepositoryIdentity(publisher, invocation)).toBe(projectId);
    expect.soft(await readdir(checkout.commonDir)).toEqual([]);
  } finally { await checkout.cleanup(); }
});
