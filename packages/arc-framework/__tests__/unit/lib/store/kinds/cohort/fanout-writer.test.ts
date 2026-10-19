import { describe, expect, it } from "vitest";
import { writeCohortFanout } from "../../../../../../src/lib/store/kinds/cohort/index.js";
import { planV3DecomposeTopology } from "../../../../../../src/lib/work-unit/decompose-v3-topology.js";

const block = "<!-- arc:decompose-fanout:origin:start -->\n### `origin` decomposition fan-out\n\n- `alpha`\n- `beta`\n<!-- arc:decompose-fanout:origin:end -->";

describe("cohort fan-out writing", () => {
  it("renders the exact bytes of the existing at-cap topology append", () => {
    const document = "# Cohort: `nested`\n\n**Parent:** `group`\n\n---\n";
    const result = planV3DecomposeTopology({
      origin: "origin", placement: { kind: "at-cap", parent: "group/nested" },
      destinations: [
        { kind: "new-member", destinationId: "b", slug: "beta", workClass: "Light" },
        { kind: "new-member", destinationId: "a", slug: "alpha", workClass: "Light" },
      ],
      baseTree: { ".arc/backlog/planned/group/nested/cohort-nested.md": {
        kind: "object", objectKind: "blob", mode: "100644", bytes: new TextEncoder().encode(document),
      } }, cohortTemplate: new Uint8Array(),
    });
    if (result.status !== "planned") throw new Error(JSON.stringify(result));
    const action = result.plan.actions[0];
    if (action?.kind !== "append" || action.after.kind !== "object") throw new Error("Expected the existing planner's append");
    expect(writeCohortFanout(document, "origin", ["beta", "alpha"]))
      .toEqual({ status: "appended", content: new TextDecoder().decode(action.after.bytes) });
  });
  it.each([
    { document: "# Cohort\n\nBody.\n\n---\n\n", expected: `# Cohort\n\nBody.\n\n${block}\n\n---\n` },
    { document: "# Cohort\n\nBody.\n\n", expected: `# Cohort\n\nBody.\n\n${block}\n` },
    { document: "# Cohort\n\n---\n\nBody.\n\n---\n", expected: `# Cohort\n\n---\n\nBody.\n\n${block}\n\n---\n` },
  ])("splices at the last rule or the document's end", ({ document, expected }) => {
    expect(writeCohortFanout(document, "origin", ["beta", "alpha"])).toEqual({ status: "appended", content: expected });
  });
  it("orders members by UTF-8 bytes", () => {
    const result = writeCohortFanout("Document", "origin", ["aa", "a0", "a-a"]);
    if (result.status === "refused") throw new Error(result.reason);
    expect(result.content).toContain("- `a-a`\n- `a0`\n- `aa`");
  });
  it("reuses an exact block without changing surrounding bytes", () => {
    const document = `# Cohort\n\n${block}\n\n---\n`;
    expect(writeCohortFanout(document, "origin", ["beta", "alpha"])).toEqual({ status: "reused", content: document });
  });

  it.each([
    "<!-- arc:decompose-fanout:origin:start -->",
    "<!-- arc:decompose-fanout:origin:end -->",
    block.replace("- `alpha`", "- `changed`"),
  ])("refuses conflicting same-origin provenance", marker => {
    expect(writeCohortFanout(`# Cohort\n\n${marker}\n`, "origin", ["alpha", "beta"]))
      .toEqual({ status: "refused", reason: "conflicting-provenance" });
  });

});
