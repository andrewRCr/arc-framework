import { describe, expect, it } from "vitest";

import {
  DeliveryDeliverableIdPreimageSchema,
  DeliveryPlanAuthoringInputV1Schema,
  DeliveryPlanIdSchema,
  DeliveryPlanMemberV1Schema,
  DeliveryPlanSeamV1Schema,
  DeliveryPlanV1Schema,
  DeliveryStateV1Schema,
  DeliveryTaskInventoryParentV1Schema,
  DeliveryTaskRoleV1Schema,
  resolveAuthoredSeamIncidence,
  registerDeliveryDomainSchemas,
  validateDeliveryPlanAuthoringInputV1,
} from "../../../src/lib/delivery/schema.js";
import { createKernelRegistry, SchemaError } from "../../../src/lib/kernel/index.js";
import {
  projectKernelSchemas,
  serializeKernelSchemaBundle,
} from "../../../src/lib/kernel/schema/generate.js";

const digest = `sha256:${"a".repeat(64)}`;

function validPlan(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId: "delivery-plan-record",
    planId: "123e4567-e89b-42d3-a456-426614174000",
    planRevision: 1,
    previousPlanDigest: null,
    design: {
      artifacts: [{ artifactId: "spec-delivery-plan-record.md", revisionDigest: digest }],
      elements: [],
    },
    tasks: {
      inventoryDigest: digest,
      parents: [
        { taskId: "1.1", semanticDigest: digest, role: { kind: "implementation" } },
        {
          taskId: "3.1",
          semanticDigest: null,
          role: { kind: "verification", scope: "work-unit" },
        },
      ],
    },
    entry: "from-tasks",
    projection: { kind: "wu-integration-target" },
    members: [{
      chunkKey: "record-substrate",
      deliverableId: digest,
      title: "Record substrate",
      contract: "Publish the canonical record.",
      taskIds: ["1.1"],
      designElementIds: [],
      mainlineLandability: "independently-landable",
      semanticFingerprint: digest,
    }],
    seams: [],
    planDigest: digest,
  };
}

function validAuthoringInput(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId: "delivery-plan-record",
    design: {
      artifacts: [{ artifactId: "spec-delivery-plan-record.md" }],
      elements: [{ elementId: "detailed:R1" }],
    },
    tasks: {
      parents: [
        { taskId: "1.1", role: { kind: "implementation" } },
        { taskId: "3.1", role: { kind: "verification", scope: "work-unit" } },
      ],
    },
    entry: "from-tasks",
    projection: { kind: "wu-integration-target" },
    members: [{
      chunkKey: "record-substrate",
      title: "Record substrate",
      contract: "Publish the canonical record.",
      taskIds: ["1.1"],
      designElementIds: ["detailed:R1"],
      mainlineLandability: "independently-landable",
    }],
    seams: [],
  };
}

describe("DeliveryPlanV1Schema", () => {
  it("canonicalizes UUID plan identities to lowercase", () => {
    expect(DeliveryPlanIdSchema.parse("8DDF6705-7E3B-4A5B-9DB2-EF3AEF8B1A25"))
      .toBe("8ddf6705-7e3b-4a5b-9db2-ef3aef8b1a25");
  });

  it("refuses unknown delivery and execution fields instead of dropping them", () => {
    for (const forbidden of [
      "providerBinding",
      "branch",
      "pullRequest",
      "reviewTarget",
      "taskCompletionState",
      "workflowSteps",
    ]) {
      const plan = validPlan();
      plan[forbidden] = "not plan intent";
      expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);
    }

    const plan = validPlan();
    const [member] = plan.members as Array<Record<string, unknown>>;
    member!.providerBinding = { provider: "github" };
    expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);
  });

  it("refuses removed provider-position and assurance-subject fields", () => {
    expect(DeliveryPlanV1Schema.safeParse(validPlan()).success).toBe(true);

    for (const [target, field] of [
      ["member", "status"],
      ["member", "assuranceSubjectId"],
      ["seam", "assuranceSubjectId"],
    ] as const) {
      const plan = validPlan();
      if (target === "member") {
        const [member] = plan.members as Array<Record<string, unknown>>;
        member![field] = field === "status" ? "landed" : digest;
      } else {
        plan.seams = [{
          seamKey: "schema-publication",
          title: "Schema publication",
          acceptance: "The production artifact exposes the delivery family.",
          incidentDeliverableIds: [digest, `sha256:${"b".repeat(64)}`],
          ownerDeliverableId: `sha256:${"b".repeat(64)}`,
          designElementIds: [],
          semanticFingerprint: digest,
          [field]: digest,
        }];
      }
      expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);
    }

    const input = validAuthoringInput();
    const [member] = input.members as Array<Record<string, unknown>>;
    member!.status = "live";
    expect(DeliveryPlanAuthoringInputV1Schema.safeParse(input).success).toBe(false);
  });

  it("requires every seam to name at least two distinct incident deliverables", () => {
    const plan = validPlan();
    plan.seams = [{
      seamKey: "schema-publication",
      title: "Schema publication",
      acceptance: "The production artifact exposes the delivery family.",
      incidentDeliverableIds: [digest, digest],
      ownerDeliverableId: digest,
      designElementIds: [],
      semanticFingerprint: digest,
    }];
    expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);

    const [seam] = plan.seams as Array<Record<string, unknown>>;
    seam!.incidentDeliverableIds = [digest];
    expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);
  });

  it("accepts an omitted project identity and refuses an empty one", () => {
    expect(DeliveryPlanV1Schema.safeParse(validPlan()).success).toBe(true);

    const plan = validPlan();
    plan.projectId = "";
    expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);
  });

  it("requires every member to carry its mainline landability assertion", () => {
    const plan = validPlan();
    const [member] = plan.members as Array<Record<string, unknown>>;
    delete member!.mainlineLandability;
    expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);
  });

  it("requires one or two design artifacts in persisted plans and their JSON Schema", () => {
    for (const count of [0, 3]) {
      const plan = validPlan();
      const [artifact] = (plan.design as { artifacts: Array<Record<string, unknown>> }).artifacts;
      (plan.design as { artifacts: Array<Record<string, unknown>> }).artifacts = Array.from(
        { length: count },
        (_, index) => ({ ...artifact, artifactId: `spec-${String(index)}.md` }),
      );
      expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);
    }

    const projection = projectKernelSchemas(registerDeliveryDomainSchemas(createKernelRegistry()));
    const deliveryPlan = projection.schemas["delivery-plan"] as {
      properties?: { design?: { properties?: { artifacts?: unknown } } };
    };
    expect(deliveryPlan.properties?.design?.properties?.artifacts).toMatchObject({
      minItems: 1,
      maxItems: 2,
    });
  });

  it("requires at least one member across persisted, authored, and projected schemas", () => {
    const plan = validPlan();
    plan.members = [];
    expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);

    const input = validAuthoringInput();
    input.members = [];
    expect(DeliveryPlanAuthoringInputV1Schema.safeParse(input).success).toBe(false);

    const projection = projectKernelSchemas(registerDeliveryDomainSchemas(createKernelRegistry()));
    for (const schemaId of ["delivery-plan", "delivery-plan-authoring-input"]) {
      const schema = projection.schemas[schemaId] as { properties?: { members?: unknown } };
      expect(schema.properties?.members).toMatchObject({ minItems: 1 });
    }
  });
});

describe("DeliveryPlanAuthoringInputV1Schema", () => {
  it("refuses every derived identity, owner, fingerprint, and digest", () => {
    const derivedFields: Array<readonly [readonly (string | number)[], unknown]> = [
      [["planId"], "123e4567-e89b-42d3-a456-426614174000"],
      [["planRevision"], 1],
      [["previousPlanDigest"], null],
      [["planDigest"], digest],
      [["design", "artifacts", 0, "revisionDigest"], digest],
      [["design", "elements", 0, "semanticDigest"], digest],
      [["tasks", "inventoryDigest"], digest],
      [["tasks", "parents", 0, "semanticDigest"], digest],
      [["members", 0, "deliverableId"], digest],
      [["members", 0, "semanticFingerprint"], digest],
    ];

    for (const [path, value] of derivedFields) {
      const input = validAuthoringInput();
      let target: Record<string | number, unknown> = input;
      for (const segment of path.slice(0, -1)) {
        target = target[segment] as Record<string | number, unknown>;
      }
      target[path.at(-1)!] = value;

      const result = DeliveryPlanAuthoringInputV1Schema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.message).toContain(String(path.at(-1)));
    }
  });

  it.each(["segment", "member", "work-unit"])("accepts the verification scope %s", (scope) => {
    expect(DeliveryTaskRoleV1Schema.parse({ kind: "verification", scope })).toEqual({
      kind: "verification",
      scope,
    });
  });

  it("refuses an unrecognized verification scope in authoring input", () => {
    const input = validAuthoringInput();
    const parents = (input.tasks as { parents: Array<Record<string, unknown>> }).parents;
    parents.splice(1, 0, {
      taskId: "1.2",
      role: { kind: "verification", scope: "future-boundary" },
    });
    expect(DeliveryPlanAuthoringInputV1Schema.safeParse(input).success).toBe(false);
  });

  it("protects semantic digests by verification role", () => {
    const plan = validPlan();
    const planParents = (plan.tasks as { parents: Array<Record<string, unknown>> }).parents;
    planParents[0]!.semanticDigest = null;
    expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);

    planParents[0]!.semanticDigest = digest;
    planParents[1]!.semanticDigest = digest;
    expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);
  });

  it.each([
    [{ kind: "implementation" }, digest, null],
    [{ kind: "verification", scope: "segment" }, digest, null],
    [{ kind: "verification", scope: "member" }, digest, null],
    [{ kind: "verification", scope: "work-unit" }, null, digest],
  ] as const)("binds semantic digest presence for role $0", (role, acceptedDigest, refusedDigest) => {
    expect(DeliveryTaskInventoryParentV1Schema.safeParse({
      taskId: "1.1",
      semanticDigest: acceptedDigest,
      role,
    }).success).toBe(true);
    expect(DeliveryTaskInventoryParentV1Schema.safeParse({
      taskId: "1.1",
      semanticDigest: refusedDigest,
      role,
    }).success).toBe(false);
  });

  it("refuses derived seam incidence, ownership, identity, and fingerprints", () => {
    const input = validAuthoringInput();
    const members = input.members as Array<Record<string, unknown>>;
    members.push({ ...members[0]!, chunkKey: "authoring", title: "Authoring" });
    input.seams = [{
      seamKey: "schema-publication",
      title: "Schema publication",
      acceptance: "The authoring surface consumes the published schema.",
      incidentChunkKeys: ["record-substrate", "authoring"],
      designElementIds: [],
      incidentDeliverableIds: [digest, `sha256:${"b".repeat(64)}`],
      ownerDeliverableId: digest,
      semanticFingerprint: digest,
    }];

    const result = DeliveryPlanAuthoringInputV1Schema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      for (const field of [
        "incidentDeliverableIds",
        "ownerDeliverableId",
        "semanticFingerprint",
      ]) {
        expect(result.error.message).toContain(field);
      }
    }
  });

  it("uses the same intent-only member shape for first and successor authoring", () => {
    const input = validAuthoringInput();
    expect(validateDeliveryPlanAuthoringInputV1(input, null).success).toBe(true);

    const priorRevision = DeliveryPlanV1Schema.parse(validPlan());
    expect(validateDeliveryPlanAuthoringInputV1(input, priorRevision).success).toBe(true);
  });

  it("resolves authored seam chunk keys and refuses unknown members", () => {
    const input = validAuthoringInput();
    const members = input.members as Array<Record<string, unknown>>;
    members.push({ ...members[0]!, chunkKey: "authoring", title: "Authoring" });
    input.seams = [{
      seamKey: "schema-publication",
      title: "Schema publication",
      acceptance: "The authoring surface consumes the published schema.",
      incidentChunkKeys: ["record-substrate", "authoring"],
      designElementIds: [],
    }];

    const parsed = DeliveryPlanAuthoringInputV1Schema.parse(input);
    const secondDigest = `sha256:${"b".repeat(64)}`;
    expect(resolveAuthoredSeamIncidence(
      parsed,
      (chunkKey) => chunkKey === "record-substrate" ? digest : secondDigest,
    )).toEqual([{
      seamKey: "schema-publication",
      incidentDeliverableIds: [digest, secondDigest],
    }]);

    const [seam] = input.seams as Array<Record<string, unknown>>;
    seam!.incidentChunkKeys = ["record-substrate", "missing-member"];
    expect(DeliveryPlanAuthoringInputV1Schema.safeParse(input).success).toBe(false);
  });
});

describe("delivery schema registration", () => {
  it("pins the exact domain-separated identity preimages", () => {
    const planId = "123e4567-e89b-42d3-a456-426614174000";
    expect(DeliveryDeliverableIdPreimageSchema.safeParse({
      domain: "arc.delivery.deliverable-id/v1",
      schemaVersion: 1,
      semanticsVersion: "delivery-plan/v1",
      planId,
      chunkKey: "record-substrate",
    }).success).toBe(true);
    expect(DeliveryDeliverableIdPreimageSchema.safeParse({
      domain: "arc.delivery.deliverable/v1",
      schemaVersion: 1,
      semanticsVersion: "delivery-plan/v1",
      planId,
      chunkKey: "record-substrate",
    }).success).toBe(false);

  });

  it("registers every record and identity preimage once under stable identities", () => {
    const registry = createKernelRegistry();
    expect(registerDeliveryDomainSchemas(registry)).toBe(registry);

    const expected = [
      ["delivery-plan", DeliveryPlanV1Schema],
      ["delivery-plan-member", DeliveryPlanMemberV1Schema],
      ["delivery-plan-seam", DeliveryPlanSeamV1Schema],
      ["delivery-plan-authoring-input", DeliveryPlanAuthoringInputV1Schema],
      ["delivery-state", DeliveryStateV1Schema],
      ["delivery-deliverable-id-preimage", DeliveryDeliverableIdPreimageSchema],
    ] as const;
    for (const [id, schema] of expected) {
      expect(registry.get(id)).toBe(schema);
      expect(registry.meta(id)).toEqual({ id, version: 1, migrationPosture: "strict-current" });
    }
    expect(() => registerDeliveryDomainSchemas(registry)).toThrowError(SchemaError);
  });

  it("projects byte-identical JSON Schema across repeated composition", () => {
    const first = registerDeliveryDomainSchemas(createKernelRegistry());
    const second = registerDeliveryDomainSchemas(createKernelRegistry());
    expect(serializeKernelSchemaBundle(projectKernelSchemas(first)))
      .toBe(serializeKernelSchemaBundle(projectKernelSchemas(second)));
  });
});
