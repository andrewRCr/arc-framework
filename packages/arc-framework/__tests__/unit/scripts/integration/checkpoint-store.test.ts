/** Integration checkpoint composition persistence behavior. */

import { describe, expect, it } from "vitest";

import {
  persistIntegrationCheckpointComposition,
  readIntegrationCheckpointComposition,
  type IntegrationCheckpointStoreFs,
} from "../../../../src/scripts/integration/checkpoint-store.js";
import { composeCanonicalSettlementPlan } from "../../../../src/scripts/integration/settlement-plan.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

function composition() {
  return {
    workUnit: "example",
    approvedHead: oid("a"),
    settlementPlan: composeCanonicalSettlementPlan([]),
    mergeMethod: {
      schemaVersion: 1 as const,
      mode: "review-merge-method-resolve" as const,
      repository: "owner/repo",
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
  };
}

describe("integration checkpoint composition store", () => {
  it("gives two checkpoint runs at the same head distinct handles", async () => {
    const fs = memoryFs();
    const ids = [
      "019ff875-9ec9-7ce0-b108-93b0732d69a2",
      "019ff875-9ec9-7ce0-b108-93b0732d69a3",
    ];
    const first = await persistIntegrationCheckpointComposition("/workspace", composition(), {
      fs,
      randomId: () => ids.shift() ?? "",
    });
    const second = await persistIntegrationCheckpointComposition("/workspace", composition(), {
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
    const first = await persistIntegrationCheckpointComposition("/workspace", composition(), {
      fs,
      randomId: () => ids.shift() ?? "",
    });
    await persistIntegrationCheckpointComposition("/workspace", composition(), {
      fs,
      randomId: () => ids.shift() ?? "",
    });
    const entries = [...fs.files.entries()];
    const firstEntry = entries.find(([, content]) => content.includes("69a2"));
    const secondEntry = entries.find(([, content]) => content.includes("69a3"));
    expect(firstEntry).toBeDefined();
    expect(secondEntry).toBeDefined();
    fs.files.set(firstEntry?.[0] ?? "", secondEntry?.[1] ?? "");

    await expect(readIntegrationCheckpointComposition("/workspace", "example", first, fs))
      .rejects.toThrow("does not match its handle");
  });
});
