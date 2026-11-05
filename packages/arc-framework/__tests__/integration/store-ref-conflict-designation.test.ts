/** Retained conflict history reports an unanswered remote role before returning its original missing-object refusal. */
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { RecordReferenceSchema, runStoreConflict } from "../../src/lib/store/index.js";
import { handleStoreConflict } from "../../src/commands/store-conflict.js";
import { retainedConflictFixture } from "../helpers/store/retained-conflicts.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["default", "separate"] as const)("shows the designation question with the retained conflict refusal in %s", async layout => {
  const h = await retainedConflictFixture(layout, "abandon"), reference = h.conflicts[0]!;
  if (reference.owner.type !== "work-item" || !reference.owner.uid) throw new Error("Expected retained work owner");
  const uid = reference.owner.uid, key = String(reference.key), scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
  const path = `${reference.kind.startsWith("review/") ? "review/" : ""}conflicts/${key}.json`;
  const oid = (await h.a.git(["rev-parse", `${h.history}:${path}`])).stdout.trim();
  const bytes = (await h.a.ports.rawExec([...scope, "cat-file", "blob", oid])).stdout;
  if (layout === "default") {
    const empty = join(h.a.root, "empty-origin.git");
    await h.a.exec("git", ["init", "--bare", empty]);
    await h.a.exec("git", ["remote", "set-url", "origin", empty]);
  }
  await h.a.git(["config", "--unset", `remote.${h.remoteName}.arc-state`]);
  await removeLooseObject(h.a.root, oid, h.a.gitDir);
  const operand = RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, name: uid } });
  const original = await h.a.store.history({ reference: operand });
  expect(original).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", historyRefs: [h.history] } });
  const written: string[] = [];
  const output = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { written.push(String(chunk)); return true; });
  try {
    const result = await handleStoreConflict(uid, reference.kind, key, {}, { cwd: h.a.root, ports: h.a.ports,
      write: line => written.push(line), setExitCode: () => {} });
    expect(result).toEqual(original);
  } finally { output.mockRestore(); }
  const rendered = written.join(" ");
  expect(rendered).toContain(`Remote ${h.remoteName} needs a store designation.`);
  expect(rendered.split(`arc store remote ${h.remoteName} push`)).toHaveLength(2);
  const restored = await h.a.ports.rawExec([...scope, "hash-object", "-w", "-t", "blob", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
  if (layout === "default") await h.a.exec("git", ["remote", "set-url", "origin", h.origin]);
  await h.a.git(["config", `remote.${h.remoteName}.arc-state`, "push"]);
  expect(success(await runStoreConflict(h.a.ports, { uid, kind: reference.kind, id: key })))
    .toMatchObject({ status: "present", reference });
}, 60_000);
