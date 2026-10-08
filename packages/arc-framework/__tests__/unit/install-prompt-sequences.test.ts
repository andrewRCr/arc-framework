/** Runtime defaults through the declared installer prompt sequences. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runInitPrompts } from "../../src/prompts/init-prompts.js";
import { runReconfigurePrompts } from "../../src/prompts/reconfigure-prompts.js";
import { runJoinPrompts } from "../../src/prompts/join-prompts.js";
import { resolveRemovalsInteractive } from "../../src/prompts/removal-prompts.js";
import { resolveInteractionContext } from "../../src/lib/command-input/interaction-context.js";

const boundary = vi.hoisted(() => ({ text: vi.fn(), select: vi.fn(), confirm: vi.fn(), tools: vi.fn(),
  message: vi.fn(), info: vi.fn(), warn: vi.fn(), note: vi.fn(), cancel: vi.fn() }));
vi.mock("@clack/prompts", () => ({ text: boundary.text, select: boundary.select, confirm: boundary.confirm,
  autocompleteMultiselect: boundary.tools, log: { message: boundary.message, info: boundary.info, warn: boundary.warn },
  note: boundary.note, cancel: boundary.cancel, isCancel: (value: unknown) => typeof value === "symbol" }));
const context = resolveInteractionContext({ noInput: true, machineReadable: false, ci: false,
  promptInputIsTTY: true, promptOutputIsTTY: true, yes: "absent" });

beforeEach(() => {
  vi.resetAllMocks();
  boundary.text.mockResolvedValue("Interactive name");
  boundary.select.mockResolvedValue("external");
  boundary.confirm.mockResolvedValue(true);
  boundary.tools.mockResolvedValue(["codex"]);
});

describe("installer prompt runtime defaults", () => {
  it("answers fresh init from its declared defaults in a forbidden context", async () => {
    expect(await runInitPrompts("/tmp/example-project", context)).toEqual({
      project_name: "example-project", tools: [], pm_mode: "none", team_mode: false,
    });
    expect(boundary.note).not.toHaveBeenCalled();
  });
  it("answers reconfiguration from current settings without interactive presentation", async () => {
    expect(await runReconfigurePrompts({ project_name: "Existing", pm_mode: "arc-in-git", tools: [], team_mode: true }, context))
      .toEqual({ project_name: "Existing", pm_mode: "arc-in-git", team_mode: true });
    expect(boundary.message).not.toHaveBeenCalled();
    expect(boundary.warn).not.toHaveBeenCalled();
  });
  it("keeps current join values through the shared tools wrapper", async () => {
    expect(await runJoinPrompts(context, { currentRole: "contributor", currentTools: ["claude"] }))
      .toEqual({ role: "contributor", tools: ["claude"] });
    expect(boundary.note).not.toHaveBeenCalled();
    expect(boundary.info).not.toHaveBeenCalled();
  });
  it("uses classification defaults for a forbidden removal choice", async () => {
    const removals = [{ outputPath: "system/workflow.md", classification: "Framework" as const },
      { outputPath: "reference/project.md", classification: "Scaffolded" as const }];
    expect(await resolveRemovalsInteractive(removals, context)).toEqual([
      { ...removals[0], action: "remove" }, { ...removals[1], action: "keep" },
    ]);
    expect(boundary.message).not.toHaveBeenCalled();
  });
});

const interactive = resolveInteractionContext({ noInput: false, machineReadable: false, ci: false,
  promptInputIsTTY: true, promptOutputIsTTY: true, yes: "absent" });
describe("explicit installer tools presentation", () => {
  it.each([{ tools: [] }, { tools: ["codex"] }])("keeps init tools $tools without tools presentation", async ({ tools }) => {
    expect((await runInitPrompts("/tmp/example-project", interactive, { tools }))?.tools).toEqual(tools);
    expect(boundary.tools).not.toHaveBeenCalled();
    expect(boundary.note.mock.calls.some((call) => call[1] === "Skill installation")).toBe(false);
    expect(boundary.message.mock.calls.some((call) => String(call[0]).startsWith("Selected:"))).toBe(false);
  });
  it.each([
    { tools: [], currentTools: [] }, { tools: ["codex"], currentTools: [] },
    { tools: [], currentTools: ["claude"] }, { tools: ["codex"], currentTools: ["claude"] },
  ])("keeps explicit join tools $tools over $currentTools without tools presentation", async ({ tools, currentTools }) => {
    expect((await runJoinPrompts(interactive, { suppliedTools: tools, currentTools }))?.tools).toEqual(tools);
    expect(boundary.tools).not.toHaveBeenCalled();
    expect(boundary.note).not.toHaveBeenCalled();
    expect(boundary.message.mock.calls.some((call) => String(call[0]).startsWith("Selected:"))).toBe(false);
  });
  it("retains tools question presentation when no tools were supplied", async () => {
    expect((await runJoinPrompts(interactive))?.tools).toEqual(["codex"]);
    expect(boundary.tools).toHaveBeenCalledOnce();
    expect(boundary.note).toHaveBeenCalledWith(expect.any(String), "Skill installation");
    expect(boundary.message).toHaveBeenCalledWith("Selected: Codex");
  });
});
describe("installer prompt cancellation", () => {
  it.each([
    { name: "init", run: () => runInitPrompts("/tmp/example-project", interactive) },
    { name: "reconfigure", run: () => runReconfigurePrompts({ project_name: "Existing", pm_mode: "none", tools: [] }, interactive) },
    { name: "join", run: () => runJoinPrompts(interactive) },
    { name: "removal", run: () => resolveRemovalsInteractive([{ outputPath: "old.md", classification: "Framework" }], interactive) },
  ])("returns the existing cancellation result for $name", async ({ run }) => {
    boundary.text.mockResolvedValue(Symbol("cancel"));
    boundary.select.mockResolvedValue(Symbol("cancel"));
    expect(await run()).toBeNull();
  });
});

describe("installer declared name default", () => {
  it("uses the directory name in an interactive question as well as forbidden acquisition", async () => {
    boundary.text.mockImplementation(async (question: { defaultValue: string }) => question.defaultValue);
    const result = await runInitPrompts("/tmp/example-project", interactive);
    expect(result?.project_name).toBe("example-project");
  });
});
