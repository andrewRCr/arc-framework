/** The production status roster uses selected records and identity-scoped claims. */
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { readStatusCheckoutRoster } from "../../../../src/handlers/status/checkout-roster.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { createTestStatusContext } from "../../../helpers/status-context.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { worktreePorcelainZ } from "../../../helpers/worktree-porcelain.js";

it("reads a store-only work unit and corroborates grooming only for the context's identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-status-roster-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const primary = join(root, "primary"), planning = join(root, "planning"), groom = join(root, "groom");
  await Promise.all([primary, planning, groom].map(path => mkdir(path)));
  await mkdir(join(planning, ".arc/system"), { recursive: true });
  await writeFile(join(planning, ".arc/system/arc-config.yml"), "archive.cadence: manual\nbranch.base: main\n");
  const h = createLifecycleHarness(); h.store.environment.identity = "alice";
  await h.seedMeta("example", { state: "Planning", owner: "alice", currentWorkflow: "draft-design" });
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project",
    uid: "11111111-1111-4111-8111-111111111111" })), "{}");
  const claim = TransientIdentityRecordSchema.parse({ version: 3, kind: "groom", slug: "groom-alpha", claimId: "a".repeat(32),
    createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", state: "open", changeRequest: null,
    branch: "chore/groom-alpha", protection: "full", anchorStub: "alpha", members: ["alpha"], openedBaseHead: "a".repeat(40) });
  await h.seed(recordReferences["claims/groom"](OwnerIdentitySchema.parse({ type: "person", name: "alice" }), "groom-alpha"), JSON.stringify(claim));
  await writeWorktreeMarker(planning, { spawnedByArc: false, spawningIdentity: "alice", createdAt: new Date(0).toISOString(),
    createdFor: { kind: "work-unit", name: "example" } });
  await writeWorktreeMarker(groom, { spawnedByArc: true, spawningIdentity: "alice", createdAt: new Date(0).toISOString(),
    provisioning: "ready", createdFor: { kind: "groom", slug: "groom-alpha", claimId: "a".repeat(32) } });
  const { exec } = scriptGitExec([
    { match: ["worktree", "list", "--porcelain", "-z"], responses: [{ stdout: worktreePorcelainZ(
      `worktree ${primary}\nHEAD ${"a".repeat(40)}\nbranch refs/heads/main\n\nworktree ${planning}\nHEAD ${"a".repeat(40)}\ndetached\n\nworktree ${groom}\nHEAD ${"a".repeat(40)}\nbranch refs/heads/chore/groom-alpha`) }] },
    { match: ["status", "--porcelain=v1", "--untracked-files=normal"], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--abbrev-ref", "HEAD"], responses: [{ stdout: "main\n" }] },
  ]);
  const context = await createTestStatusContext({ store: h.store, cwd: planning, exec, identity: "alice" });
  if (context.identity === null) throw new Error("Expected the scripted reading identity");
  const roster = await readStatusCheckoutRoster(context, context.identity);
  expect(roster.find(row => row.checkout.path === planning)).toMatchObject({ kind: "work-unit", context: {
    owner: "alice", sessionType: "planning", stage: "draft-design" } });
  expect(roster.find(row => row.checkout.path === groom)).toMatchObject({ kind: "transient", identity: { kind: "groom", key: "groom-alpha" } });
  const other = await readStatusCheckoutRoster(context, "bob");
  expect(other.find(row => row.checkout.path === planning)?.kind).toBe("work-unit");
  expect(other.find(row => row.checkout.path === groom)?.kind).toBe("unresolved-checkout");
});
