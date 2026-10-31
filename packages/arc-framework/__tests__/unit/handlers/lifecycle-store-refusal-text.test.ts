/** Text refusals preserve every holder and apply ranked repairs only when ranking facts exist. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { refuse, refuseWithRemedy } from "../../../src/handlers/lifecycle-shared.js";
import { StoreRefusalSchema } from "../../../src/lib/store/refusal.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
const uidA = "11111111-1111-4111-8111-111111111111", uidB = "22222222-2222-4222-8222-222222222222";
const priorExitCode = process.exitCode;
let output = "";
beforeEach(() => {
  vi.resetAllMocks(); output = ""; process.exitCode = undefined;
  const capture = (chunk: unknown) => { output += String(chunk); return true; };
  vi.spyOn(process.stdout, "write").mockImplementation(capture);
  vi.spyOn(process.stderr, "write").mockImplementation(capture);
});
afterEach(() => { vi.restoreAllMocks(); process.exitCode = priorExitCode; });
it.each([false, true].flatMap(ranked => [false, true].map(wrapped => ({ ranked, wrapped }))))(
  "prints typed holders and the applicable recovery, ranked=$ranked wrapped=$wrapped", ({ ranked, wrapped }) => {
    const refusal = StoreRefusalSchema.parse({ code: "ambiguous-match", class: "recoverable",
      condition: "More than one holder matches.", remedy: { text: "Repair the recorded links.", argv: ["arc", "status", "--json"] },
      candidates: [recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid: uidA })),
        recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "example", uid: uidB }))],
      ...(ranked ? { tie: { liveness: "live", name: "current" } } : {}) });
    if (wrapped) refuseWithRemedy(refusal.condition, refusal.remedy, false, refusal);
    else refuse(refusal.condition, refusal);
    expect(process.exitCode).toBe(1);
    expect(output).toContain("work unit `example`"); expect(output).toContain("cohort `example`");
    expect(output).toContain(uidA); expect(output).toContain(uidB);
    expect(output).toContain(ranked ? `arc rename ${uidB} <new-slug>` : "Repair the recorded links.");
    if (!ranked) expect(output).not.toContain("arc rename");
  });
