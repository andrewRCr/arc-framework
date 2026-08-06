/** Real-Git promotion across primary and spawned transient locus frames. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseMetaRecord, renderMetaFile } from "../../src/lib/active/meta-reader.js";
import {
  ensureWorktreeMarkerIgnored,
  nodeWorktreeMarkerIgnoreFs,
  readWorktreeMarker,
  writeWorktreeMarker,
} from "../../src/lib/git/worktree-marker.js";
import { TransientIdentityRecordV3Schema } from "../../src/lib/errand/identity-record.js";
import { ordinaryErrandTransform, type OrdinaryErrandRecord } from "../../src/lib/errand/identity-transitions.js";
import { transactTransientIdentities } from "../../src/lib/errand/identity-transaction.js";
import { promoteOrdinaryErrandAtRuntime } from "../../src/lib/errand/promote-runtime.js";
import { runDerivedLocusStateProbe } from "../../src/handlers/derived-locus-state-probe.js";
import { deriveLocusRecordId } from "../../src/lib/locus/path-identity.js";
import { createPlatformProcessInspector } from "../../src/lib/locus/platform-inspectors.js";
import { mintLocusRecord } from "../../src/lib/locus/record-store.js";
import { locusRecordPath, resolveLocusRoot, type LocusRoot } from "../../src/lib/locus/root.js";
import type { LocusProcessAnchor, LocusRecordV1 } from "../../src/lib/locus/schema/index.js";
import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
  makeGitExecInput,
} from "../helpers/integration.js";

const IDENTITY = "andrew";
const CREATED_AT = "2026-07-21T00:00:00.000Z";
const UPDATED_AT = "2026-07-21T00:01:00.000Z";
const ORIGIN_DIGEST = `sha256:${"a".repeat(64)}` as const;

describe("promoteOrdinaryErrandAtRuntime", () => {
  let primary: string;
  let spawned: string | null;

  beforeEach(async () => {
    primary = await createTempRepo();
    spawned = null;
    await makeCommit(primary, "init");
    await writeFile(join(primary, ".gitignore"), ".arc/user/\n");
    await execFileAsync("git", ["add", ".gitignore"], { cwd: primary });
    await makeCommit(primary, "ignore local user state");
  });

  afterEach(async () => {
    if (spawned !== null) {
      await execFileAsync("git", ["worktree", "remove", "--force", spawned], { cwd: primary }).catch(() => undefined);
    }
    await cleanupTempDir(primary);
  });

  it("keeps identity through meta commit and retries retirement without converting occupancy early", async () => {
    const exec = makeGitExec(primary);
    const execInput = makeGitExecInput(primary);
    const anchor = await currentAnchor();
    await exec("git", ["switch", "-c", "chore/growing"]);
    await makeCommit(primary, "errand work");
    const identity = ordinaryRecord();
    await writeIdentity(exec, execInput, identity);
    await writeTransientMarker(primary, identity, false);
    const root = await requireRoot(exec);
    await writeRecord(root, primary, errandLocusRecord(primary, identity, anchor, null));

    const options = runtimeOptions(primary, exec, execInput, root, anchor);
    const prepared = await promoteOrdinaryErrandAtRuntime(options);

    expect(prepared).toMatchObject({
      outcome: "applied",
      operation: "errand-promote",
      subject: { kind: "errand", slug: identity.slug, claimId: identity.claimId },
      generation: `errand-v1/${identity.slug}/${identity.claimId}`,
      branch: "feat/growth",
      metaPath: ".arc/active/meta-growth.md",
      checkoutPath: primary,
      settlement: {
        state: "commit-required",
        identity: "retained",
        originEntry: "Grow this concern",
        originEntrySourceDigest: ORIGIN_DIGEST,
      },
    });
    expect(prepared).not.toHaveProperty("recordId");
    expect(prepared).not.toHaveProperty("leaseId");
    expect(prepared).not.toHaveProperty("activeLocusPath");
    expect(prepared).not.toHaveProperty("sessionHomePath");
    expect((await exec("git", ["branch", "--show-current"])).stdout).toBe("feat/growth");
    const promotedMeta = await readFile(join(primary, ".arc/active/meta-growth.md"), "utf8");
    expect(promotedMeta).toContain("# Metadata: growth");
    expect(parseMetaRecord(promotedMeta).promotionReceipt)
      .toBe(`errand-v1/${identity.slug}/${identity.claimId}`);
    expect(await readIdentity(exec, execInput)).toMatchObject({ slug: "growing", state: "open" });
    expect(await readMarkerSubject(primary)).toEqual({
      kind: "errand", slug: identity.slug, claimId: identity.claimId,
    });

    await exec("git", ["add", ".arc/active/meta-growth.md"]);
    await makeCommit(primary, "promote errand");

    const failingExec: typeof exec = (command, args, commandOptions) => args[0] === "commit-tree"
      ? Promise.reject(new Error("injected identity retirement failure"))
      : exec(command, args, commandOptions);
    const failed = await promoteOrdinaryErrandAtRuntime({ ...options, exec: failingExec });
    expect(failed).toMatchObject({ outcome: "error", operation: "errand-promote" });
    expect(await readIdentity(exec, execInput)).toMatchObject({ slug: "growing", state: "open" });
    expect(await readMarkerSubject(primary)).toEqual({
      kind: "errand", slug: identity.slug, claimId: identity.claimId,
    });

    const recovered = await promoteOrdinaryErrandAtRuntime(options);
    expect(recovered).toMatchObject({
      outcome: "applied",
      operation: "errand-promote",
      allocation: "primary",
      checkoutPath: primary,
      settlement: { state: "settled", identity: "retired", originEntry: null },
    });
    expect(await readIdentity(exec, execInput)).toBeNull();
    expect(await readMarkerSubject(primary)).toBeNull();

    const replay = await promoteOrdinaryErrandAtRuntime(runtimeOptions(primary, exec, execInput, root, anchor));
    expect(replay).toMatchObject({
      outcome: "idempotent",
      operation: "errand-promote",
      settlement: { state: "settled", identity: "retired", originEntry: null },
    });
  });

  it("binds identity-absent replay to the originating Errand slug", async () => {
    const exec = makeGitExec(primary);
    const execInput = makeGitExecInput(primary);
    const anchor = await currentAnchor();
    await exec("git", ["switch", "-c", "chore/growing"]);
    await makeCommit(primary, "errand work");
    const identity = ordinaryRecord();
    await writeIdentity(exec, execInput, identity);
    await writeTransientMarker(primary, identity, false);
    const root = await requireRoot(exec);
    await writeRecord(root, primary, errandLocusRecord(primary, identity, anchor, null));

    const promoted = await promoteOrdinaryErrandAtRuntime(runtimeOptions(primary, exec, execInput, root, anchor));
    expect(promoted).toMatchObject({ outcome: "applied", operation: "errand-promote" });
    await exec("git", ["add", ".arc/active/meta-growth.md"]);
    await makeCommit(primary, "promote errand");
    await promoteOrdinaryErrandAtRuntime(runtimeOptions(primary, exec, execInput, root, anchor));
    expect(await readIdentity(exec, execInput)).toBeNull();

    const wrongSlugReplay = await promoteOrdinaryErrandAtRuntime({
      ...runtimeOptions(primary, exec, execInput, root, anchor),
      slug: "different-errand",
    });

    expect(wrongSlugReplay).toMatchObject({
      outcome: "refused",
      operation: "errand-promote",
      reason: "promotion-source-invalid",
    });
    expect(parseMetaRecord(await readFile(join(primary, ".arc/active/meta-growth.md"), "utf8")).promotionReceipt)
      .toBe(`errand-v1/${identity.slug}/${identity.claimId}`);
  });

  it("recovers a lost response after identity retirement but before primary marker removal", async () => {
    const exec = makeGitExec(primary);
    const execInput = makeGitExecInput(primary);
    const anchor = await currentAnchor();
    await exec("git", ["switch", "-c", "chore/growing"]);
    await makeCommit(primary, "errand work");
    const identity = ordinaryRecord("description");
    await writeIdentity(exec, execInput, identity);
    await writeTransientMarker(primary, identity, false);
    const root = await requireRoot(exec);
    await writeRecord(root, primary, errandLocusRecord(primary, identity, anchor, null));
    const options = runtimeOptions(primary, exec, execInput, root, anchor);

    expect(await promoteOrdinaryErrandAtRuntime(options)).toMatchObject({ outcome: "applied" });
    await exec("git", ["add", ".arc/active/meta-growth.md"]);
    await makeCommit(primary, "promote errand");
    await retireIdentity(exec, execInput, identity);

    const interrupted = await runDerivedLocusStateProbe({
      cwd: primary,
      identity: IDENTITY,
      baseBranch: "main",
      exec,
    });
    expect(interrupted.entering).toMatchObject({
      kind: "selected",
      row: { kind: "unresolved-checkout", checkout: { path: primary } },
    });

    const recovered = await promoteOrdinaryErrandAtRuntime(options);
    expect(recovered).toMatchObject({ outcome: "applied", operation: "errand-promote" });
    expect(await readMarkerSubject(primary)).toBeNull();
  });

  it.each([
    ["missing", (content: string) => content.replace(/^- \*\*Promotion Receipt:\*\*.*\n/mu, "")],
    ["mismatched", (content: string) => content.replace("c".repeat(32), "d".repeat(32))],
  ] as const)("refuses an identity-backed replay with a %s promotion receipt", async (_case, tamper) => {
    const exec = makeGitExec(primary);
    const execInput = makeGitExecInput(primary);
    const anchor = await currentAnchor();
    await exec("git", ["switch", "-c", "chore/growing"]);
    await makeCommit(primary, "errand work");
    const identity = ordinaryRecord();
    await writeIdentity(exec, execInput, identity);
    await writeTransientMarker(primary, identity, false);
    const root = await requireRoot(exec);
    await writeRecord(root, primary, errandLocusRecord(primary, identity, anchor, null));
    const options = runtimeOptions(primary, exec, execInput, root, anchor);

    expect(await promoteOrdinaryErrandAtRuntime(options)).toMatchObject({ outcome: "applied" });
    const metaPath = join(primary, ".arc/active/meta-growth.md");
    await writeFile(metaPath, tamper(await readFile(metaPath, "utf8")));

    const replay = await promoteOrdinaryErrandAtRuntime(options);

    expect(replay).toMatchObject({
      outcome: "refused",
      operation: "errand-promote",
      reason: "promotion-source-invalid",
    });
    expect(await readIdentity(exec, execInput)).toMatchObject({ slug: identity.slug, claimId: identity.claimId });
  });

  it("settles the retained capture only after the promoted meta is committed", async () => {
    const exec = makeGitExec(primary);
    const execInput = makeGitExecInput(primary);
    const anchor = await currentAnchor();
    await exec("git", ["switch", "-c", "chore/growing"]);
    await makeCommit(primary, "errand work");
    const identity = ordinaryRecord();
    await writeIdentity(exec, execInput, identity);
    await writeTransientMarker(primary, identity, false);
    const root = await requireRoot(exec);
    await writeRecord(root, primary, errandLocusRecord(primary, identity, anchor, null));
    const settled: Array<{ originEntry: string; originEntrySourceDigest: string }> = [];
    const options = {
      ...runtimeOptions(primary, exec, execInput, root, anchor),
      settleInbox: async (binding: { originEntry: string; originEntrySourceDigest: string }) => {
        settled.push(binding);
        return { kind: "applied" as const };
      },
    };

    const promoted = await promoteOrdinaryErrandAtRuntime(options);

    expect(promoted).toMatchObject({
      outcome: "applied",
      settlement: {
        state: "commit-required",
        identity: "retained",
        originEntry: "Grow this concern",
        originEntrySourceDigest: ORIGIN_DIGEST,
      },
    });
    expect(settled).toEqual([]);

    await exec("git", ["add", ".arc/active/meta-growth.md"]);
    await makeCommit(primary, "promote errand");

    const readForeignFrame = async () => {
      const frame = await runDerivedLocusStateProbe({
        cwd: primary,
        identity: IDENTITY,
        baseBranch: "main",
        exec,
      });
      return {
        ...frame,
        entering: {
          kind: "unresolved" as const,
          checkoutPath: primary,
          diagnostics: [{ code: "foreign-session", message: "Another checkout entered the operation." }],
        },
      };
    };
    const foreignReplay = await promoteOrdinaryErrandAtRuntime({
      ...options,
      readFrame: readForeignFrame,
    });
    expect(foreignReplay).toMatchObject({
      outcome: "confirmation-required",
      recommendedPromptText: expect.stringContaining(`errand-v1/growing/${"c".repeat(32)}`),
    });
    expect(settled).toEqual([]);

    const replay = await promoteOrdinaryErrandAtRuntime({
      ...options,
      readFrame: readForeignFrame,
      confirmForeignGeneration: `errand-v1/growing/${"c".repeat(32)}`,
    });

    expect(replay).toMatchObject({
      outcome: "applied",
      operation: "errand-promote",
      settlement: { state: "settled", identity: "retired", originEntry: null },
    });
    expect(settled).toEqual([{
      originEntry: "Grow this concern",
      originEntrySourceDigest: ORIGIN_DIGEST,
    }]);
    expect(await readIdentity(exec, execInput)).toBeNull();
    expect(await readMarkerSubject(primary)).toBeNull();

    const settledReplay = await promoteOrdinaryErrandAtRuntime(options);
    expect(settledReplay).toMatchObject({
      outcome: "idempotent",
      settlement: { state: "settled", identity: "retired", originEntry: null },
    });
    expect(settled).toHaveLength(1);
  });

  it("routes a derivation-floor promotion through planning and replays the exact frame", async () => {
    const exec = makeGitExec(primary);
    const execInput = makeGitExecInput(primary);
    const anchor = await currentAnchor();
    await exec("git", ["switch", "-c", "chore/growing"]);
    await makeCommit(primary, "errand work");
    const preservedHead = (await exec("git", ["rev-parse", "HEAD"])).stdout;
    const identity = ordinaryRecord();
    await writeIdentity(exec, execInput, identity);
    await writeTransientMarker(primary, identity, false);
    const root = await requireRoot(exec);
    await writeRecord(root, primary, errandLocusRecord(primary, identity, anchor, null));
    const options = {
      ...runtimeOptions(primary, exec, execInput, root, anchor),
      name: "growth-plan",
      floor: "derivation" as const,
    };

    const result = await promoteOrdinaryErrandAtRuntime(options);

    expect(result).toMatchObject({
      outcome: "applied",
      operation: "errand-promote",
      allocation: "primary",
      checkoutPath: primary,
    });
    expect((await exec("git", ["branch", "--show-current"])).stdout).toBe("plan/growth-plan");
    expect((await exec("git", ["rev-parse", "HEAD"])).stdout).toBe(preservedHead);
    const meta = await readFile(join(primary, ".arc/active/meta-growth-plan.md"), "utf8");
    expect(meta).toContain("# Metadata: growth-plan");
    expect(meta).toContain("`Planning`");
    expect(meta).toContain("`plan/growth-plan`");
    expect(meta).toContain("draft-design");
    expect(await readIdentity(exec, execInput)).toMatchObject({ slug: identity.slug, claimId: identity.claimId });

    await exec("git", ["add", ".arc/active/meta-growth-plan.md"]);
    await makeCommit(primary, "promote errand");
    const settled = await promoteOrdinaryErrandAtRuntime(options);
    expect(settled).toMatchObject({ outcome: "applied", operation: "errand-promote" });
    expect(await readIdentity(exec, execInput)).toBeNull();
    expect(await readMarkerSubject(primary)).toBeNull();

    const replay = await promoteOrdinaryErrandAtRuntime(options);
    expect(replay).toMatchObject({
      outcome: "idempotent",
      operation: "errand-promote",
      checkoutPath: primary,
      settlement: { state: "settled", identity: "retired" },
    });
  });

  it("converts a warm spawned marker and role while releasing the parent lease", async () => {
    const exec = makeGitExec(primary);
    const execInput = makeGitExecInput(primary);
    const anchor = await currentAnchor();
    await mkdir(join(primary, ".arc/active"), { recursive: true });
    await writeFile(join(primary, ".arc/active/meta-parent.md"), renderMetaFile("parent", {
      state: "Active", owner: IDENTITY, branch: "main",
    }));
    await exec("git", ["add", ".arc/active/meta-parent.md"]);
    await makeCommit(primary, "parent meta");
    spawned = `${primary}-spawned`;
    await exec("git", ["worktree", "add", "-b", "chore/growing", spawned, "main"]);
    await makeCommit(spawned, "errand work");
    const identity = ordinaryRecord();
    await writeIdentity(exec, execInput, identity);
    const root = await requireRoot(exec);
    await ensureWorktreeMarkerIgnored(spawned, exec, nodeWorktreeMarkerIgnoreFs);
    await writeWorktreeMarker(spawned, {
      spawnedByArc: true,
      createdFor: { kind: "errand", slug: identity.slug, claimId: identity.claimId },
      provisioning: "ready",
      spawningIdentity: IDENTITY,
      createdAt: CREATED_AT,
    });
    await writeRecord(root, primary, workUnitLocusRecord(primary, "parent", anchor));
    await writeRecord(root, spawned, errandLocusRecord(spawned, identity, anchor, primary));

    const result = await promoteOrdinaryErrandAtRuntime(
      runtimeOptions(primary, exec, execInput, root, anchor, spawned),
    );

    expect(result, JSON.stringify(result)).toMatchObject({
      outcome: "applied",
      allocation: "spawned",
      checkoutPath: spawned,
    });
    expect(await readMarkerSubject(spawned)).toEqual({
      kind: "errand", slug: identity.slug, claimId: identity.claimId,
    });

    await exec("git", ["add", ".arc/active/meta-growth.md"], { cwd: spawned });
    await makeCommit(spawned, "promote errand");
    const settled = await promoteOrdinaryErrandAtRuntime(
      runtimeOptions(primary, exec, execInput, root, anchor, spawned),
    );
    expect(settled).toMatchObject({ outcome: "applied", operation: "errand-promote" });
    expect(JSON.parse(await readFile(join(spawned, ".arc/system/.internal/worktree-marker.json"), "utf8")))
      .toEqual({
        spawnedByArc: true,
        wuName: "growth",
        createdFor: { kind: "work-unit", name: "growth" },
        spawningIdentity: IDENTITY,
        createdAt: CREATED_AT,
      });
  });

  it("refuses recovery when the meta carries index state the promotion never produced", async () => {
    const exec = makeGitExec(primary);
    const execInput = makeGitExecInput(primary);
    const anchor = await currentAnchor();
    await exec("git", ["switch", "-c", "chore/growing"]);
    await makeCommit(primary, "errand work");
    const identity = ordinaryRecord();
    await writeIdentity(exec, execInput, identity);
    await writeTransientMarker(primary, identity, false);
    const root = await requireRoot(exec);
    await writeRecord(root, primary, errandLocusRecord(primary, identity, anchor, null));

    const prepared = await promoteOrdinaryErrandAtRuntime(runtimeOptions(primary, exec, execInput, root, anchor));
    expect(prepared).toMatchObject({ outcome: "applied" });

    // The promotion leaves its meta untracked; staging it is the user's own index state.
    await exec("git", ["add", ".arc/active/meta-growth.md"]);
    const result = await promoteOrdinaryErrandAtRuntime(runtimeOptions(primary, exec, execInput, root, anchor));

    expect(result).toMatchObject({ outcome: "refused", reason: "promotion-source-invalid" });
    expect(await readIdentity(exec, execInput)).toMatchObject({ slug: "growing", state: "open" });
  });

  it("refuses an unrelated work unit that merely shares the requested name", async () => {
    const exec = makeGitExec(primary);
    const execInput = makeGitExecInput(primary);
    const anchor = await currentAnchor();
    // The requested name belongs to a work unit this session already holds, and the Errand's own
    // locus record is absent locally — so the work-unit row is the only candidate the target search sees.
    await exec("git", ["switch", "-c", "feat/growth"]);
    await makeCommit(primary, "unrelated work-unit work");
    const identity = ordinaryRecord();
    await writeIdentity(exec, execInput, identity);
    const root = await requireRoot(exec);
    await writeRecord(root, primary, workUnitLocusRecord(primary, "growth", anchor));

    const result = await promoteOrdinaryErrandAtRuntime(runtimeOptions(primary, exec, execInput, root, anchor));

    expect(result).toMatchObject({ outcome: "confirmation-required" });
    await expect(readFile(join(primary, ".arc/active/meta-growth.md"), "utf8")).rejects.toThrow();
    expect(await readIdentity(exec, execInput)).toMatchObject({ slug: "growing", state: "open" });
  });

  it("refuses a dirty source without renaming the branch or retiring identity", async () => {
    const exec = makeGitExec(primary);
    const execInput = makeGitExecInput(primary);
    const anchor = await currentAnchor();
    await exec("git", ["switch", "-c", "chore/growing"]);
    const identity = ordinaryRecord();
    await writeIdentity(exec, execInput, identity);
    await writeTransientMarker(primary, identity, false);
    const root = await requireRoot(exec);
    await writeRecord(root, primary, errandLocusRecord(primary, identity, anchor, null));
    await writeFile(join(primary, "dirty.txt"), "uncommitted\n");

    const result = await promoteOrdinaryErrandAtRuntime(runtimeOptions(primary, exec, execInput, root, anchor));

    expect(result).toMatchObject({ outcome: "refused", reason: "promotion-source-invalid" });
    expect((await exec("git", ["branch", "--show-current"])).stdout).toBe("chore/growing");
    expect(await readIdentity(exec, execInput)).toMatchObject({ slug: "growing" });
  });

  it.each([
    ["priority", { priority: "urgent" }],
    ["class", { class: "Huge" }],
  ] as const)("rejects an invalid %s before any rename (no half-applied promotion)", async (_field, override) => {
    const exec = makeGitExec(primary);
    const execInput = makeGitExecInput(primary);
    const anchor = await currentAnchor();
    await exec("git", ["switch", "-c", "chore/growing"]);
    await makeCommit(primary, "errand work");
    const identity = ordinaryRecord();
    await writeIdentity(exec, execInput, identity);
    await writeTransientMarker(primary, identity, false);
    const root = await requireRoot(exec);
    await writeRecord(root, primary, errandLocusRecord(primary, identity, anchor, null));

    const result = await promoteOrdinaryErrandAtRuntime({
      ...runtimeOptions(primary, exec, execInput, root, anchor),
      ...override,
    });

    expect(result).toMatchObject({ outcome: "error", operation: "errand-promote" });
    expect((await exec("git", ["branch", "--show-current"])).stdout).toBe("chore/growing");
    expect(await readIdentity(exec, execInput)).toMatchObject({ slug: "growing" });
  });
});

function ordinaryRecord(origin: "inbox" | "description" = "inbox"): OrdinaryErrandRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    slug: "growing",
    claimId: "c".repeat(32),
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    kind: "errand",
    purpose: "errand",
    intent: "growing",
    branch: "chore/growing",
    origin,
    originEntry: origin === "inbox" ? "Grow this concern" : null,
    ...(origin === "inbox" ? { originEntrySourceDigest: ORIGIN_DIGEST } : {}),
    state: "open",
    savedHead: null,
    changeRequest: null,
  }) as OrdinaryErrandRecord;
}

async function currentAnchor(): Promise<LocusProcessAnchor> {
  const inspector = createPlatformProcessInspector();
  const inspected = await inspector.inspect(process.pid);
  if (inspected.kind !== "present") throw new Error("Current test process is not inspectable");
  return {
    kind: "process",
    pid: process.pid,
    startToken: inspected.startToken,
    inspector: inspector.kind,
    selector: "integration-test",
  };
}

async function requireRoot(exec: ReturnType<typeof makeGitExec>): Promise<LocusRoot> {
  const root = await resolveLocusRoot({ identity: IDENTITY, exec });
  if (!root.ok) throw new Error(root.message);
  return root;
}

function lease(sessionHomePath: string, anchor: LocusProcessAnchor) {
  return {
    leaseId: "e".repeat(32),
    sessionHomePath,
    anchor,
    attachedAt: UPDATED_AT,
    heartbeatAt: UPDATED_AT,
  };
}

function errandLocusRecord(
  checkoutPath: string,
  identity: OrdinaryErrandRecord,
  anchor: LocusProcessAnchor,
  parentCheckoutPath: string | null,
): LocusRecordV1 {
  const derived = deriveLocusRecordId(checkoutPath, "posix");
  return {
    schemaVersion: 1,
    recordId: derived.recordId,
    checkoutPath,
    role: {
      kind: "errand",
      subject: { kind: "errand", key: identity.slug, claimId: identity.claimId },
      establishedAt: UPDATED_AT,
      parentCheckoutPath,
      originEntry: null,
    },
    lease: lease(parentCheckoutPath ?? checkoutPath, anchor),
  };
}

function workUnitLocusRecord(
  checkoutPath: string,
  name: string,
  anchor: LocusProcessAnchor,
): LocusRecordV1 {
  const derived = deriveLocusRecordId(checkoutPath, "posix");
  return {
    schemaVersion: 1,
    recordId: derived.recordId,
    checkoutPath,
    role: {
      kind: "work-unit",
      subject: { kind: "work-unit", key: name, claimId: null },
      establishedAt: UPDATED_AT,
      parentCheckoutPath: null,
      originEntry: null,
    },
    lease: lease(checkoutPath, anchor),
  };
}

async function writeRecord(root: LocusRoot, checkoutPath: string, record: LocusRecordV1): Promise<void> {
  const digest = deriveLocusRecordId(checkoutPath, "posix").digest;
  const result = await mintLocusRecord({ path: locusRecordPath(root, digest), record });
  if (result.kind !== "created") throw new Error("Locus record already exists");
}

async function writeIdentity(
  exec: ReturnType<typeof makeGitExec>,
  execInput: ReturnType<typeof makeGitExecInput>,
  record: OrdinaryErrandRecord,
): Promise<void> {
  const result = await transactTransientIdentities({ exec, execInput, identity: IDENTITY }, {
    remote: null,
    message: "seed identity",
    transform: ordinaryErrandTransform({ kind: "create", record }),
  });
  if (result.kind !== "applied") throw new Error(`Identity seed is ${result.kind}`);
}

async function writeTransientMarker(
  checkoutPath: string,
  record: OrdinaryErrandRecord,
  spawnedByArc: boolean,
): Promise<void> {
  const exec = makeGitExec(checkoutPath);
  await ensureWorktreeMarkerIgnored(checkoutPath, exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(checkoutPath, {
    spawnedByArc,
    createdFor: { kind: "errand", slug: record.slug, claimId: record.claimId },
    provisioning: "ready",
    spawningIdentity: IDENTITY,
    createdAt: CREATED_AT,
  });
}

async function retireIdentity(
  exec: ReturnType<typeof makeGitExec>,
  execInput: ReturnType<typeof makeGitExecInput>,
  record: OrdinaryErrandRecord,
): Promise<void> {
  const result = await transactTransientIdentities({ exec, execInput, identity: IDENTITY }, {
    remote: null,
    message: "retire identity",
    transform: ordinaryErrandTransform({ kind: "retire", previous: record, reason: "promotion", authorization: "local" }),
  });
  if (result.kind !== "applied") throw new Error(`Identity retirement is ${result.kind}`);
}

async function readMarkerSubject(checkoutPath: string): Promise<unknown | null> {
  const marker = await readWorktreeMarker(checkoutPath);
  if (marker.kind === "absent") return null;
  if (marker.kind === "malformed") throw new Error(marker.message);
  return marker.marker.createdFor ?? null;
}

async function readIdentity(
  exec: ReturnType<typeof makeGitExec>,
  execInput: ReturnType<typeof makeGitExecInput>,
): Promise<OrdinaryErrandRecord | null> {
  const result = await transactTransientIdentities({ exec, execInput, identity: IDENTITY }, {
    remote: null,
    message: "read identity",
    transform: (records) => ({ kind: "idempotent", value: records.get("growing") ?? null }),
  });
  if (result.kind !== "idempotent") throw new Error(`Identity read is ${result.kind}`);
  return result.value as OrdinaryErrandRecord | null;
}

function runtimeOptions(
  cwd: string,
  exec: ReturnType<typeof makeGitExec>,
  execInput: ReturnType<typeof makeGitExecInput>,
  _root: LocusRoot,
  _anchor: LocusProcessAnchor,
  checkoutPath = cwd,
) {
  return {
    slug: "growing",
    name: "growth",
    type: "feat",
    floor: "scale" as const,
    owner: IDENTITY,
    protection: "full" as const,
    base: "main",
    identity: IDENTITY,
    exec,
    execInput,
    readFrame: () => runDerivedLocusStateProbe({
      cwd: checkoutPath,
      identity: IDENTITY,
      baseBranch: "main",
      exec,
    }),
    settleInbox: async () => ({ kind: "idempotent" as const }),
  };
}
