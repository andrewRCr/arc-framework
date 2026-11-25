/** Literal branch operands remain data throughout recovery planning. */
import { describe, expect, it } from "vitest";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import type { CascadeResolution } from "../../../src/lib/session-init/branch-gone-cascade.js";
import { createRecoveryAgendaFixture } from "../../helpers/agenda-recovery-fixtures.js";

async function compile(input: AgendaCompileInput) {
  const result = await compileSessionInitAgenda(input);
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  assertSessionInitAgenda(result.agenda);
  return result.agenda;
}
const alias = { branch: "-", proposedAction: "switch" } as const;
const soleCases: { raw: CascadeResolution; dirty: boolean }[] = [
  { raw: { kind: "resolved", remoteEvidence: "exact", candidate: alias }, dirty: false },
  { raw: { kind: "resolved", remoteEvidence: "exact", candidate: alias }, dirty: true },
  { raw: { kind: "main-fallback", remoteEvidence: "exact", baseBranch: "-" }, dirty: false },
  { raw: { kind: "resolved", remoteEvidence: "exact", candidate: { ...alias, worktreePath: "/wt/alias" } }, dirty: true },
];

describe("recovery literal branch operands", () => {
  it.each(soleCases)("holds a sole alias with manual guidance: $raw.kind dirty=$dirty", async ({ raw, dirty }) => {
    const input = await createRecoveryAgendaFixture(raw, dirty);
    const agenda = await compile(input);
    expect(agenda.steps.filter(step => step.type === "exec" || step.type === "offer")).toEqual([]);
    const rendered = agenda.steps.find(step => step.type === "render" && step.surface === "branch-gone");
    expect(rendered).toMatchObject({ type: "render", text: expect.stringContaining(
      "Git treats `-` as checkout history; recover the literal branch `-` manually.",
    ) });
    if (!input.envelope.recovery?.ok) throw new Error("Expected valid recovery fixture");
    expect(rendered).toMatchObject({ text: expect.stringContaining(input.envelope.recovery.value.recommendedPromptText) });
    if (raw.kind === "resolved" && raw.candidate.worktreePath !== undefined) {
      expect(rendered).toMatchObject({ text: expect.stringContaining("Continue recovery in checkout `/wt/alias`.") });
    }
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "stop", autoProceed: false });
  });

  it("retains a manual alias choice beside executable ordinary candidates", async () => {
    const input = await createRecoveryAgendaFixture({ kind: "surface", remoteEvidence: "exact", candidates: [
      alias, { branch: "--dry-run", proposedAction: "switch" },
    ] });
    const agenda = await compile(input);
    expect(agenda.steps.find(step => step.type === "offer")).toMatchObject({ type: "offer", choices: [
      { kind: "bare", label: "Recover the literal branch - manually" },
      { kind: "actions", label: "Switch to --dry-run", actions: [
        { argv: ["git", "switch", "--", "--dry-run"], text: "git switch -- --dry-run" },
      ] },
      { kind: "bare", label: "Stay here", decline: true },
    ] });
  });
});
