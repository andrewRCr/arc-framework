/** Ref lookup follows ordinary Errand authority across admitted branch types. */
import { expect, it, onTestFinished } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { createStore } from "../../src/lib/store/create.js";
import { hashBlob, writeTreeCommit } from "../../src/lib/errand/ref-tree.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";

it.each(["fix", "refactor", "hotfix"])("resolves a recorded %s branch as its Errand", async (type) => {
  const root = await createTempRepo();
  onTestFinished(() => cleanupTempDir(root));
  const exec = makeGitExec(root), execInput = makeGitExecInput(root);
  await exec("git", ["config", "arc.identity", "andrew"]);
  await exec("git", ["commit", "--allow-empty", "-m", "Initialize lookup fixture"]);
  const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair-output",
    branch: `${type}/repair-output`, claimId: "a".repeat(32), intent: "Repair output", origin: "description", originEntry: null,
    state: "open", savedHead: null, changeRequest: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });
  if (record.kind !== "errand" || record.purpose !== "errand") throw new Error("Expected ordinary Errand authority");
  const blob = await hashBlob(execInput, serializeTransientIdentityRecord(record));
  await writeTreeCommit({ exec, execInput, identity: "andrew" }, new Map([[record.slug, blob]]), "Create authority", [], null);
  await exec("git", ["branch", record.branch]);
  const store = createStore(createDefaultStorePorts({ checkoutRoot: root }));
  expect(await store.lookup({ kind: "ref", repository: root, ref: `refs/heads/${record.branch}` })).toMatchObject({
    status: "ok", result: { reference: { kind: "work-item/record", owner: { type: "work-item", name: record.slug } } },
  });
});
