/** Native ref-store port binding through the public store boundary. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { GitExec, GitExecInput } from "../../src/lib/git/exec.js";
import { createExecaGitExec, createExecaGitExecInput } from "../../src/lib/git/process-executor.js";
import { createGitFloorGate } from "../../src/lib/git/version-floor.js";
import { createDefaultRefStorePorts, createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

it("mints the shared machine actor only on a write and reuses it after reopening", async () => {
  const h = await refSyncFixture();
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "native.md", owner: { type: "person", name: "andrew" } });
  const input = { checkoutRoot: h.a.root, backingRepository: async () => null };
  const first = createRefStore(createDefaultRefStorePorts(input));
  const file = join(h.a.root, ".git", "arc", "user", "andrew", ".internal", ".machine-id");
  success(await first.version());
  await expect(readFile(file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  const made = success(await first.write({ action: "put", reference, expected: null, content: "Native.\n",
    provenance: { verb: "edit", lifecycleAction: "save" } }));
  const machine = (await readFile(file, "utf8")).trim();
  expect(machine).toMatch(/^[0-9a-f-]{36}$/u);
  expect((await h.a.git(["log", "-1", "--format=%B", "refs/arc/user/andrew/personal"])).stdout).toContain(`Arc-Actor: andrew@${machine}`);
  const second = createRefStore(createDefaultRefStorePorts(input));
  success(await second.write({ action: "put", reference: made.reference, expected: success(await second.read({ reference: made.reference })).version, content: "Reopened.\n",
    provenance: { verb: "edit", lifecycleAction: "save" } }));
  expect((await readFile(file, "utf8")).trim()).toBe(machine);
  expect((await h.a.git(["log", "-1", "--format=%B", "refs/arc/user/andrew/personal"])).stdout).toContain(`Arc-Actor: andrew@${machine}`);
  expect(success(await second.read({ reference })).content).toBe("Reopened.\n");
});

it("refuses an injected Git below the floor before its first store call, and writes once it answers a supported one", async () => {
  const h = await refSyncFixture();
  const native = { exec: createExecaGitExec(), execInput: createExecaGitExecInput() };
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "floor.md", owner: { type: "person", name: "andrew" } });
  const attempt = (version: string, calls: string[]) => {
    const answer = `git version ${version}\n`;
    const exec: GitExec = async (command, args, options) => {
      calls.push(`plain ${args[0] ?? ""}`);
      return args[0] === "--version" ? { stdout: answer, stderr: "" } : native.exec(command, args, options);
    };
    const execInput: GitExecInput = async (args, content, options) => {
      calls.push(`stdin ${args[0] ?? ""}`);
      return args[0] === "--version" ? answer : native.execInput(args, content, options);
    };
    const store = createRefStore(createDefaultRefStorePorts({ checkoutRoot: h.a.root, exec, execInput,
      backingRepository: async () => null, gitFloor: createGitFloorGate() }));
    return store.write({ action: "put", reference, expected: null, content: "Floor.\n", provenance: { verb: "edit", lifecycleAction: "save" } });
  };
  const old: string[] = [];
  await expect(attempt("2.52.0", old)).rejects.toThrow("Git 2.52.0 is below the required Git 2.53. Upgrade Git and retry.");
  expect(old.filter(call => !call.endsWith("--version"))).toEqual([]);
  const upgraded: string[] = [];
  success(await attempt("2.53.0", upgraded));
  expect(upgraded.filter(call => call.endsWith("--version")).sort()).toEqual(["plain --version", "stdin --version"]);
  expect(upgraded.length).toBeGreaterThan(2);
});
