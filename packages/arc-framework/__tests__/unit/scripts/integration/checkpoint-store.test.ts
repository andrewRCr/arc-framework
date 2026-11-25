/** Integration checkpoint composition persistence behavior. */

import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import {
  persistIntegrationCheckpointComposition,
  readIntegrationCheckpointComposition,
  type IntegrationCheckpointLocation,
  type IntegrationCheckpointStoreFs,
} from "../../../../src/scripts/integration/checkpoint-store.js";
import { composeCanonicalSettlementPlan } from "../../../../src/scripts/integration/settlement-plan.js";

const workspace: IntegrationCheckpointLocation = { kind: "workspace", root: "/workspace", workUnit: "example" };
const identity: IntegrationCheckpointLocation = { kind: "identity", root: "/identity" };
const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

function composition() {
  return {
    workUnit: "example",
    approvedHead: oid("a"),
    target: {
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("a"),
    },
    lifecycleVersion: "meta-example:v1",
    settlementPlan: composeCanonicalSettlementPlan([]),
    mergeMethod: {
      schemaVersion: 1 as const,
      mode: "review-merge-method-resolve" as const,
      repository: "owner/repo",
      stackPosition: "non-delivery" as const,
      state: "validated" as const,
      nextAction: "use-method" as const,
      method: "merge" as const,
      allowedMethods: ["merge" as const],
      policyFingerprint: digest("b"),
    },
  };
}

function memoryFs(): IntegrationCheckpointStoreFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    readFile: async (path) => {
      const content = files.get(path);
      if (content === undefined) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      return content;
    },
    createFile: async (path, content) => {
      if (files.has(path)) throw Object.assign(new Error(`EEXIST: ${path}`), { code: "EEXIST" });
      files.set(path, content);
    },
    listDirectories: async (path) => {
      const prefix = `${path}${sep}`;
      const names = [...files.keys()].filter(file => file.startsWith(prefix))
        .map(file => file.slice(prefix.length).split(sep)).filter(parts => parts.length > 1).map(parts => parts[0]!);
      if (names.length === 0) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      return [...new Set(names)];
    },
  };
}

describe("integration checkpoint composition store", () => {
  it("gives two checkpoint runs at the same head distinct handles", async () => {
    const fs = memoryFs();
    const ids = [
      "019ff875-9ec9-7ce0-b108-93b0732d69a2",
      "019ff875-9ec9-7ce0-b108-93b0732d69a3",
    ];
    const first = await persistIntegrationCheckpointComposition(workspace, composition(), {
      fs,
      randomId: () => ids.shift() ?? "",
    });
    const second = await persistIntegrationCheckpointComposition(workspace, composition(), {
      fs,
      randomId: () => ids.shift() ?? "",
    });

    expect(second).not.toBe(first);
  });

  it("validates a handle only against its own persisted composition", async () => {
    const fs = memoryFs();
    const ids = [
      "019ff875-9ec9-7ce0-b108-93b0732d69a2",
      "019ff875-9ec9-7ce0-b108-93b0732d69a3",
    ];
    const first = await persistIntegrationCheckpointComposition(workspace, composition(), {
      fs,
      randomId: () => ids.shift() ?? "",
    });
    await persistIntegrationCheckpointComposition(workspace, composition(), {
      fs,
      randomId: () => ids.shift() ?? "",
    });
    const entries = [...fs.files.entries()];
    const firstEntry = entries.find(([, content]) => content.includes("69a2"));
    const secondEntry = entries.find(([, content]) => content.includes("69a3"));
    expect(firstEntry).toBeDefined();
    expect(secondEntry).toBeDefined();
    fs.files.set(firstEntry?.[0] ?? "", secondEntry?.[1] ?? "");

    await expect(readIntegrationCheckpointComposition(workspace, first, fs))
      .rejects.toThrow("does not match its handle");
  });
});

it("includes native ownership in the checkpoint digest and refuses a changed UID", async () => {
  const fs = memoryFs(), nativeOwnership = { projectId: "123e4567-e89b-42d3-a456-426614174099",
    workItemUid: "123e4567-e89b-42d3-a456-426614174001" };
  const handle = await persistIntegrationCheckpointComposition(workspace, { ...composition(), nativeOwnership },
    { fs, randomId: () => "019ff875-9ec9-7ce0-b108-93b0732d69a2" });
  expect(await readIntegrationCheckpointComposition(workspace, handle, fs)).toMatchObject({ nativeOwnership });
  const [path, content] = [...fs.files.entries()][0]!;
  fs.files.set(path, content.replace(nativeOwnership.workItemUid, "123e4567-e89b-42d3-a456-426614174002"));
  await expect(readIntegrationCheckpointComposition(workspace, handle, fs)).rejects.toThrow("does not match its handle");
});

describe("store-path checkpoint records", () => {
  const nativeOwnership = { projectId: "123e4567-e89b-42d3-a456-426614174099", workItemUid: "123e4567-e89b-42d3-a456-426614174001" };
  const persist = (fs: ReturnType<typeof memoryFs>, workUnit = "example") => persistIntegrationCheckpointComposition(identity,
    { ...composition(), workUnit, nativeOwnership }, { fs, randomId: () => "019ff875-9ec9-7ce0-b108-93b0732d69a2" });

  it("writes each record in its work item's folder under the identity's machine-local folder", async () => {
    const fs = memoryFs(), handle = await persist(fs);
    expect([...fs.files.keys()]).toEqual([join(identity.root, ".internal", "integration-checkpoints",
      nativeOwnership.workItemUid, `${handle.slice(handle.lastIndexOf(":") + 1)}.json`)]);
  });

  it("reads a record by its handle whatever its work unit is now named", async () => {
    const fs = memoryFs(), handle = await persist(fs, "former-name");
    expect(await readIntegrationCheckpointComposition(identity, handle, fs)).toMatchObject({ workUnit: "former-name", nativeOwnership });
    expect(await readIntegrationCheckpointComposition(identity, handle, memoryFs())).toBeNull();
  });

  it("refuses a record whose binding names another work item than its folder", async () => {
    const fs = memoryFs(), handle = await persist(fs);
    const [path, content] = [...fs.files.entries()][0]!;
    fs.files.delete(path);
    fs.files.set(path.replace(nativeOwnership.workItemUid, "123e4567-e89b-42d3-a456-426614174002"), content);
    await expect(readIntegrationCheckpointComposition(identity, handle, fs)).rejects.toThrow("does not match its handle");
  });

  it("refuses a write without the work item that names its folder", async () => {
    await expect(persistIntegrationCheckpointComposition(identity, composition(), { fs: memoryFs() }))
      .rejects.toThrow(/work item/iu);
  });

  it("lists the persisted work item's UID under the native checkpoint path", async () => {
    const fs = memoryFs();
    await persist(fs);
    const folder = join(identity.root, ".internal", "integration-checkpoints");
    await expect(fs.listDirectories(folder)).resolves.toEqual([nativeOwnership.workItemUid]);
  });
});
