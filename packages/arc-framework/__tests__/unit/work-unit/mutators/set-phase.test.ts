import { describe, it, expect } from "vitest";

import {
  setPhase,
  type SetPhaseContext,
} from "../../../../src/lib/work-unit/mutators/set-phase.js";
import { parseMetaRecord } from "../../../../src/lib/active/meta-reader.js";

const META = `# Metadata: demo-wu

| **State** | **Owner** | **Branch**     | **Class** | **Priority** |
|-----------|-----------|----------------|-----------|--------------|
| \`Active\`  | \`andrew\`  | \`feat/demo-wu\` | \`Novel\`   | \`P1\`         |

- **Cohort:** \`demo-cohort\`
- **Depends On:** \`upstream-wu\`

- **Origin:** [internal]
- **Design:** \`spec-demo-wu.md\`
- **Task List:** \`tasks-demo-wu.md\`

- **Last Completed:** Phase 1 — the transition table.
- **Next Task:** \`Task 2.4 — set-phase (line ~125)\`
- **Blockers:** [none]

- **Next Action:** Wire the set-phase mutator next.

---
`;

const META_PATH = ".arc/active/meta-demo-wu.md";

/** Build a {@link SetPhaseContext} over an in-memory file, recording writes. */
function buildCtx(content: string): {
  ctx: SetPhaseContext;
  reads: string[];
  writes: { path: string; content: string }[];
} {
  const reads: string[] = [];
  const writes: { path: string; content: string }[] = [];
  const ctx: SetPhaseContext = {
    readFile: async (path) => {
      reads.push(path);
      return content;
    },
    writeFile: async (path, c) => {
      writes.push({ path, content: c });
    },
  };
  return { ctx, reads, writes };
}

describe("setPhase", () => {
  it("writes the meta State to the target phase, preserving every other field and the prose below", async () => {
    const { ctx, reads, writes } = buildCtx(META);

    const result = await setPhase(ctx, { metaPath: META_PATH, phase: "Integrating" });

    expect(result).toEqual({ phase: "Integrating" });
    expect(reads).toEqual([META_PATH]);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toBe(META_PATH);

    const written = writes[0]!.content;
    const before = parseMetaRecord(META);
    const after = parseMetaRecord(written);

    // Only State moved; every other core + bullet field is byte-stable on parse.
    expect(after.State).toBe("Integrating");
    for (const field of Object.keys(before) as (keyof typeof before)[]) {
      if (field === "State") continue;
      expect(after[field]).toBe(before[field]);
    }

    // The whole document below the core table is preserved verbatim.
    const tail = (s: string): string => s.slice(s.indexOf("- **Cohort:**"));
    expect(tail(written)).toBe(tail(META));
    // The old state value is gone from the rewritten table.
    expect(written).not.toContain("`Active`");
  });

  it("rejects an unknown phase and never writes", async () => {
    const { ctx, reads, writes } = buildCtx(META);

    await expect(
      setPhase(ctx, { metaPath: META_PATH, phase: "Bogus" }),
    ).rejects.toThrow(/unknown phase|Bogus/i);

    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("throws when the meta carries no core-block table to move", async () => {
    const { ctx, writes } = buildCtx("# Metadata: demo-wu\n\n- **Owner:** `andrew`\n\n---\n");

    await expect(
      setPhase(ctx, { metaPath: META_PATH, phase: "Active" }),
    ).rejects.toThrow(/core-block table/i);

    expect(writes).toEqual([]);
  });
});
