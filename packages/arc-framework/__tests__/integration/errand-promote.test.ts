/** Real-Git promotion across primary and spawned transient locus frames. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import {
  ensureWorktreeMarkerIgnored,
  nodeWorktreeMarkerIgnoreFs,
  writeWorktreeOwnershipMarker,
} from "../../src/lib/git/worktree-marker.js";
import { TransientIdentityRecordV3Schema } from "../../src/lib/errand/identity-record.js";
import { ordinaryErrandTransform, type OrdinaryErrandRecord } from "../../src/lib/errand/identity-transitions.js";
import { transactTransientIdentities } from "../../src/lib/errand/identity-transaction.js";
import { promoteOrdinaryErrandAtRuntime } from "../../src/lib/errand/promote-runtime.js";
import { deriveLocusRecordId } from "../../src/lib/locus/path-identity.js";
import { createPlatformProcessInspector } from "../../src/lib/locus/platform-inspectors.js";
import { mintLocusRecord, readLocusRecord } from "../../src/lib/locus/record-store.js";
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

  it("recovers a cold primary promotion when identity retirement fails after frame replacement", async () => {
    const exec = makeGitExec(primary);
    const execInput = makeGitExecInput(primary);
    const anchor = await currentAnchor();
    await exec("git", ["switch", "-c", "chore/growing"]);
    await makeCommit(primary, "errand work");
    const identity = ordinaryRecord();
    await writeIdentity(exec, execInput, identity);
    const root = await requireRoot(exec);
    await writeRecord(root, primary, errandLocusRecord(primary, identity, anchor, null));

    const failingExec: typeof exec = (command, args, options) => args[0] === "commit-tree"
      ? Promise.reject(new Error("injected identity retirement failure"))
      : exec(command, args, options);
    const failed = await promoteOrdinaryErrandAtRuntime(runtimeOptions(primary, failingExec, execInput, root, anchor));

    expect(failed).toMatchObject({ outcome: "error", operation: "errand-promote" });
    expect((await exec("git", ["branch", "--show-current"])).stdout).toBe("feat/growth");
    expect(await readFile(join(primary, ".arc/active/meta-growth.md"), "utf8")).toContain("# Metadata: growth");
    const promoted = await readRecord(root, primary);
    expect(promoted.role).toMatchObject({
      kind: "work-unit",
      subject: { kind: "work-unit", key: "growth", claimId: null },
      parentCheckoutPath: null,
    });
    expect(await readIdentity(exec, execInput)).toMatchObject({ slug: "growing", state: "open" });

    const recovered = await promoteOrdinaryErrandAtRuntime(runtimeOptions(primary, exec, execInput, root, anchor));
    expect(recovered).toMatchObject({
      outcome: "applied",
      operation: "errand-promote",
      allocation: { kind: "primary", checkoutPath: primary },
      originEntry: "Grow this concern",
      sessionHomePath: primary,
    });
    expect(await readIdentity(exec, execInput)).toBeNull();

    const replay = await promoteOrdinaryErrandAtRuntime(runtimeOptions(primary, exec, execInput, root, anchor));
    expect(replay).toMatchObject({ outcome: "idempotent", operation: "errand-promote" });
  });

  it("converts a warm spawned marker and role while releasing the parent lease", async () => {
    const exec = makeGitExec(primary);
    const execInput = makeGitExecInput(primary);
    const anchor = await currentAnchor();
    await mkdir(join(primary, ".arc/active"), { recursive: true });
    await writeFile(join(primary, ".arc/active/meta-parent.md"), renderMetaFile("parent", {
      State: "Active", Owner: IDENTITY, Branch: "main",
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
    await writeWorktreeOwnershipMarker(spawned, {
      createdByArc: true,
      createdFor: { kind: "errand", slug: identity.slug, claimId: identity.claimId },
      provisioning: "ready",
      spawningIdentity: IDENTITY,
      now: Date.parse(CREATED_AT),
    });
    await writeRecord(root, primary, workUnitLocusRecord(primary, "parent", anchor));
    await writeRecord(root, spawned, errandLocusRecord(spawned, identity, anchor, primary));

    const result = await promoteOrdinaryErrandAtRuntime(runtimeOptions(primary, exec, execInput, root, anchor));

    expect(result, JSON.stringify(result)).toMatchObject({
      outcome: "applied",
      allocation: { kind: "spawned", checkoutPath: spawned },
      sessionHomePath: spawned,
    });
    const target = await readRecord(root, spawned);
    expect(target.role).toMatchObject({ kind: "work-unit", subject: { key: "growth" }, parentCheckoutPath: null });
    expect(target.lease?.sessionHomePath).toBe(spawned);
    expect((await readRecord(root, primary)).lease).toBeNull();
    expect(JSON.parse(await readFile(join(spawned, ".arc/system/.internal/worktree-marker.json"), "utf8")))
      .toMatchObject({ wuName: "growth", createdFor: { kind: "work-unit", name: "growth" } });
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

    expect(result).toMatchObject({ outcome: "refused", reason: "promotion-source-invalid" });
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
    const root = await requireRoot(exec);
    await writeRecord(root, primary, errandLocusRecord(primary, identity, anchor, null));
    await writeFile(join(primary, "dirty.txt"), "uncommitted\n");

    const result = await promoteOrdinaryErrandAtRuntime(runtimeOptions(primary, exec, execInput, root, anchor));

    expect(result).toMatchObject({ outcome: "refused", reason: "promotion-source-invalid" });
    expect((await exec("git", ["branch", "--show-current"])).stdout).toBe("chore/growing");
    expect(await readIdentity(exec, execInput)).toMatchObject({ slug: "growing" });
  });
});

function ordinaryRecord(): OrdinaryErrandRecord {
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
    origin: "inbox",
    originEntry: "Grow this concern",
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

async function readRecord(root: LocusRoot, checkoutPath: string): Promise<LocusRecordV1> {
  const digest = deriveLocusRecordId(checkoutPath, "posix").digest;
  const result = await readLocusRecord({ path: locusRecordPath(root, digest), expectedDigest: digest, pathFlavor: "posix" });
  if (result.kind !== "valid") throw new Error(`Locus record is ${result.kind}`);
  return result.record;
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
  root: LocusRoot,
  anchor: LocusProcessAnchor,
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
    identityGlobalUserDir: root.userRoot,
    activeExtensions: [],
    postCreateScript: "",
    registeredHarnessDirs: "",
    exec,
    execInput,
    anchor,
  };
}
