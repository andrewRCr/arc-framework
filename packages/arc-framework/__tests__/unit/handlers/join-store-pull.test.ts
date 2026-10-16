/** Join's designation UI obeys invocation capability and executes the chosen literal argv. */
import { expect, it, vi } from "vitest";
import { pullJoinStore } from "../../../src/handlers/join.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { createStoreSyncPort } from "../../../src/lib/store/operational-sync.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { resolveInteractionContext } from "../../../src/lib/command-input/interaction-context.js";
import type { PromptRenderer } from "../../../src/lib/command-input/prompter.js";

function context(interactive: boolean) {
  return resolveInteractionContext({ noInput: !interactive, machineReadable: false, ci: false,
    promptInputIsTTY: interactive, promptOutputIsTTY: interactive, yes: "absent" });
}
const designation = { status: "designation-needed" as const, remote: "upstream", choices: ["state", "code"],
  remedy: { text: "arc store remote upstream state", argv: ["arc", "store", "remote", "upstream", "state"] } };
it("reports designation without selecting or executing in a non-interactive join", async () => {
  const lines: string[] = [];
  const output = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { lines.push(String(chunk)); return true; });
  try {
    const result = await pullJoinStore({ cwd: "/project", exec: async () => { throw new Error("Unbound Git"); }, identity: SlugSchema.parse("alice"), context: context(false) }, {
      openStore: () => createLifecycleHarness().store, sync: () => createStoreSyncPort({ pull: async () => designation }),
      execute: async () => { throw new Error("Guessed a designation"); },
    });
    expect(result).toMatchObject({ status: "designation-needed", actions: [designation.remedy] });
    expect(lines.join("")).toContain("arc store remote upstream state");
  } finally { output.mockRestore(); }
});
it("runs the explicit alternate answer while marking the remedy as the recommended option", async () => {
  const remoteRoles = new Map<string, string>();
  const renderer: PromptRenderer = {
    confirm: async () => ({ kind: "cancelled" }), text: async () => ({ kind: "cancelled" }), multiselect: async () => ({ kind: "cancelled" }),
    select: async (_context, question) => {
      expect(question.initialValue).toBe("state");
      expect(question.options.find(option => option.value === "state")?.hint).toBe("arc store remote upstream state");
      return { kind: "answered", value: question.options[1]!.value };
    },
  };
  await pullJoinStore({ cwd: "/project", exec: async () => { throw new Error("Unbound Git"); }, identity: SlugSchema.parse("alice"), context: context(true) }, {
    openStore: () => createLifecycleHarness().store, sync: () => createStoreSyncPort({ pull: async () => designation }), renderer,
    execute: async ([command, family, verb, remote, role]) => {
      if (command !== "arc" || family !== "store" || verb !== "remote" || remote === undefined || role === undefined) throw new Error("Invalid designation command");
      remoteRoles.set(remote, role);
    },
  });
  expect(remoteRoles.get("upstream")).toBe("code");
});
