import { describe, expect, it } from "vitest";

import {
  bindDesignInventory,
  DELIVERY_DESIGN_INVENTORY_INPUT_SCHEMA_ID,
  registerDeliveryAuthoringSchemas,
  validateDesignElementCoverage,
} from "../../../src/lib/delivery/design-inventory.js";
import { createKernelRegistry, SchemaError } from "../../../src/lib/kernel/index.js";

const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    artifactId: "spec-example.md",
    revisionDigest: digestA,
    form: "detailed",
    elements: [{ elementId: "R1", semanticDigest: digestA }],
    ...overrides,
  };
}

describe("bindDesignInventory", () => {
  it("registers the strict authoring input once with stable metadata", () => {
    const registry = registerDeliveryAuthoringSchemas(createKernelRegistry());
    expect(registry.meta(DELIVERY_DESIGN_INVENTORY_INPUT_SCHEMA_ID)).toEqual({
      id: DELIVERY_DESIGN_INVENTORY_INPUT_SCHEMA_ID,
      version: 1,
      migrationPosture: "strict-current",
      authored: "request",
    });
    expect(() => registerDeliveryAuthoringSchemas(registry)).toThrowError(SchemaError);
  });

  it.each([
    {},
    { artifacts: [] },
    { artifacts: [artifact(), artifact()] },
    {
      artifacts: [
        artifact(),
        artifact({ artifactId: "design-example.md", elements: [] }),
      ],
    },
    {
      artifacts: [artifact({
        elements: [
          { elementId: "R1", semanticDigest: digestA },
          { elementId: "R1", semanticDigest: digestA },
        ],
      })],
    },
    { artifacts: [artifact({ artifactId: "../spec.md" })] },
    { artifacts: [artifact({ revisionDigest: "not-a-digest" })] },
    { artifacts: [artifact({ unknown: true })] },
  ])("refuses missing, duplicate, or malformed artifact inventory %#", (input) => {
    expect(bindDesignInventory(input)).toEqual({
      status: "refused",
      reason: "invalid-design-inventory",
    });
  });

  it("binds each artifact to its own exact revision digest", () => {
    const result = bindDesignInventory({
      artifacts: [
        artifact({ elements: [] }),
        artifact({
          artifactId: "design-example.md",
          revisionDigest: digestB,
          form: "rfc",
          elements: [],
        }),
      ],
    });

    expect(result).toMatchObject({
      status: "bound",
      inventory: {
        artifacts: [
          { artifactId: "spec-example.md", revisionDigest: digestA },
          { artifactId: "design-example.md", revisionDigest: digestB },
        ],
      },
    });
  });

  it("form-qualifies paired element namespaces", () => {
    const result = bindDesignInventory({
      artifacts: [
        artifact(),
        artifact({
          artifactId: "design-example.md",
          form: "rfc",
        }),
      ],
    });

    expect(result).toMatchObject({
      status: "bound",
      inventory: {
        elements: [
          { elementId: "detailed:R1", semanticDigest: digestA },
          { elementId: "rfc:R1", semanticDigest: digestA },
        ],
      },
    });
  });
});

describe("validateDesignElementCoverage", () => {
  it.each(["member", "seam"] as const)(
    "refuses a %s element reference absent from the inventory",
    (owner) => {
      const bound = bindDesignInventory({ artifacts: [artifact()] });
      expect(bound.status).toBe("bound");
      if (bound.status !== "bound") return;

      const result = validateDesignElementCoverage({
        inventory: bound.inventory,
        memberDesignElementIds: owner === "member" ? [["detailed:R1", "detailed:R2"]] : [],
        seamDesignElementIds: owner === "seam" ? [["detailed:R1", "detailed:R2"]] : [],
      });

      expect(result).toEqual({
        status: "refused",
        issues: [{ kind: "unknown-design-element-reference", elementId: "detailed:R2" }],
      });
    },
  );

  it("refuses a declared element covered by no member or seam", () => {
    const bound = bindDesignInventory({ artifacts: [artifact()] });
    expect(bound.status).toBe("bound");
    if (bound.status !== "bound") return;

    expect(validateDesignElementCoverage({
      inventory: bound.inventory,
      memberDesignElementIds: [],
      seamDesignElementIds: [],
    })).toEqual({
      status: "refused",
      issues: [{ kind: "uncovered-design-element", elementId: "detailed:R1" }],
    });
  });

  it("binds an empty form inventory with vacuous design coverage", () => {
    const bound = bindDesignInventory({
      artifacts: [artifact({ elements: [] })],
    });
    expect(bound).toMatchObject({
      status: "bound",
      inventory: { elements: [] },
    });
    if (bound.status !== "bound") return;

    expect(validateDesignElementCoverage({
      inventory: bound.inventory,
      memberDesignElementIds: [],
      seamDesignElementIds: [],
    })).toEqual({ status: "valid" });
  });
});
