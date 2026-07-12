/** Validated plain-data policy for this repository's review gate. */

import {
  parseReviewPolicy,
  type ReviewRequirementTemplate,
  type SourceKind,
} from "../../core/contracts.js";
import {
  arrayAt,
  enumAt,
  exactKeys,
  integerAt,
  objectAt,
  schemaOneAt,
  stringAt,
} from "../../core/validation.js";

/** Capability declaration used to qualify a review source. */
export interface SourceQualificationDeclaration {
  sourceKind: SourceKind;
  qualifier: string;
  sourceIdentity: string;
  rubricVersion: string;
  enabled: boolean;
  exactCoverage: boolean;
  durableResults: boolean;
  distinctOutcomes: boolean;
  durableFindings: boolean;
  closureCapability: boolean;
  transport: "durable-record" | "authenticated-attestation";
  liveProbeRequired: boolean;
}

/** Closed self-hosting policy document. */
export interface SelfHostingPolicy {
  schemaVersion: 1;
  semanticsVersion: string;
  lanePredicate: {
    id: "artifact-owner/v1";
    artifactRoots: string[];
    artifactKinds: string[];
  };
  riskPredicate: {
    id: "sensitive-paths/v1";
    sensitivePrefixes: string[];
    sensitiveFiles: string[];
  };
  lifecycleTailPredicate: { id: "lifecycle-bookkeeping-tail/v1" };
  authorMap: Record<string, string>;
  requirementTemplates: ReviewRequirementTemplate[];
  rubricBindings: Array<{ requirementKind: string; rubricVersion: string }>;
  timeouts: { reservationMinutes: number; analysisMinutes: number };
  providerIdentities: { coderabbitBotUserId: string; appBotUserId: string };
  attestationEnforcement: {
    acceptedRuntimeKinds: Record<string, string>;
    maxRunAgeMinutes: number;
  };
  qualifications: SourceQualificationDeclaration[];
}

/** Initial reviewed-lane policy, including disabled shadow qualifications. */
export const SELF_HOSTING_POLICY: SelfHostingPolicy = {
  schemaVersion: 1,
  semanticsVersion: "self-hosting-review/v1",
  lanePredicate: {
    id: "artifact-owner/v1",
    artifactRoots: [".arc/active/", ".arc/backlog/"],
    artifactKinds: ["draft", "tasks", "meta", "notes"],
  },
  riskPredicate: {
    id: "sensitive-paths/v1",
    sensitivePrefixes: [
      ".github/",
      ".arc/system/",
      ".arc/reference/strategies/",
      ".arc/reference/adr/",
      ".arc/reference/briefs/",
    ],
    sensitiveFiles: [
      ".arc/reference/PROJECT-PRD.md",
      ".arc/reference/TECHNICAL-OVERVIEW.md",
      "AGENTS.md",
      "CLAUDE.md",
    ],
  },
  lifecycleTailPredicate: { id: "lifecycle-bookkeeping-tail/v1" },
  authorMap: { andrewRCr: "andrew" },
  requirementTemplates: [{
    id: "independent-analysis",
    kind: "independent-analysis",
    obligation: "required",
    acceptableSources: [
      { sourceKind: "agent", qualifier: "independent-analysis/v1" },
      { sourceKind: "human", qualifier: "independent-analysis/v1" },
    ],
    count: 1,
    initialAdmission: "automatic",
    rubricVersion: "independent-analysis/v1",
  }],
  rubricBindings: [{ requirementKind: "independent-analysis", rubricVersion: "independent-analysis/v1" }],
  timeouts: { reservationMinutes: 10, analysisMinutes: 60 },
  providerIdentities: { coderabbitBotUserId: "136622811", appBotUserId: "302312524" },
  attestationEnforcement: {
    acceptedRuntimeKinds: {
      "codex-cli": "codex",
      "claude-code": "claude-code",
      "coderabbit-cli": "coderabbit",
    },
    maxRunAgeMinutes: 60,
  },
  qualifications: [
    {
      sourceKind: "agent",
      qualifier: "independent-analysis/v1",
      sourceIdentity: "coderabbit-pr",
      rubricVersion: "independent-analysis/v1",
      enabled: false,
      exactCoverage: false,
      durableResults: false,
      distinctOutcomes: false,
      durableFindings: true,
      closureCapability: false,
      transport: "durable-record",
      liveProbeRequired: true,
    },
    ...["codex-cli", "claude-code", "coderabbit-cli"].map((sourceIdentity) => ({
      sourceKind: "agent" as const,
      qualifier: "independent-analysis/v1",
      sourceIdentity,
      rubricVersion: "independent-analysis/v1",
      enabled: true,
      exactCoverage: true,
      durableResults: true,
      distinctOutcomes: true,
      durableFindings: true,
      closureCapability: true,
      transport: "authenticated-attestation" as const,
      liveProbeRequired: false,
    })),
    {
      sourceKind: "human",
      qualifier: "independent-analysis/v1",
      sourceIdentity: "qualified-non-author-human",
      rubricVersion: "independent-analysis/v1",
      enabled: true,
      exactCoverage: true,
      durableResults: true,
      distinctOutcomes: true,
      durableFindings: true,
      closureCapability: true,
      transport: "authenticated-attestation",
      liveProbeRequired: false,
    },
  ],
};

/** Derive the reviewer claims accepted by attestation validation from the versioned policy. */
export function deriveAcceptedReviewerClaims(policy: SelfHostingPolicy): string[] {
  return policy.qualifications
    .filter((qualification) => qualification.enabled
      && qualification.transport === "authenticated-attestation")
    .map((qualification) => qualification.sourceIdentity);
}

function exactStringArray(value: unknown, expected: readonly string[], path: string): string[] {
  const actual = arrayAt(value, path, stringAt);
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    throw new Error(`${path}: parameters do not match the closed predicate`);
  }
  return actual;
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path}: expected a boolean`);
  return value;
}

function parseQualification(input: unknown, path: string): SourceQualificationDeclaration {
  const record = objectAt(input, path);
  exactKeys(record, [
    "sourceKind", "qualifier", "sourceIdentity", "rubricVersion", "enabled", "exactCoverage", "durableResults",
    "distinctOutcomes", "durableFindings", "closureCapability", "transport", "liveProbeRequired",
  ], path);
  return {
    sourceKind: enumAt(record.sourceKind, ["human", "agent", "deterministic-tool"], `${path}.sourceKind`),
    qualifier: enumAt(record.qualifier, ["independent-analysis/v1"], `${path}.qualifier`),
    sourceIdentity: stringAt(record.sourceIdentity, `${path}.sourceIdentity`),
    rubricVersion: stringAt(record.rubricVersion, `${path}.rubricVersion`),
    enabled: booleanAt(record.enabled, `${path}.enabled`),
    exactCoverage: booleanAt(record.exactCoverage, `${path}.exactCoverage`),
    durableResults: booleanAt(record.durableResults, `${path}.durableResults`),
    distinctOutcomes: booleanAt(record.distinctOutcomes, `${path}.distinctOutcomes`),
    durableFindings: booleanAt(record.durableFindings, `${path}.durableFindings`),
    closureCapability: booleanAt(record.closureCapability, `${path}.closureCapability`),
    transport: enumAt(
      record.transport,
      ["durable-record", "authenticated-attestation"],
      `${path}.transport`,
    ),
    liveProbeRequired: booleanAt(record.liveProbeRequired, `${path}.liveProbeRequired`),
  };
}

/** Validate the closed self-hosting policy document. */
export function parseSelfHostingPolicy(input: unknown): SelfHostingPolicy {
  const path = "selfHostingPolicy";
  const record = objectAt(input, path);
  exactKeys(record, [
    "schemaVersion", "semanticsVersion", "lanePredicate", "riskPredicate", "lifecycleTailPredicate", "authorMap",
    "requirementTemplates", "rubricBindings", "timeouts", "providerIdentities", "attestationEnforcement",
    "qualifications",
  ], path);

  const lane = objectAt(record.lanePredicate, `${path}.lanePredicate`);
  exactKeys(lane, ["id", "artifactRoots", "artifactKinds"], `${path}.lanePredicate`);
  const laneId = enumAt(lane.id, ["artifact-owner/v1"], `${path}.lanePredicate.id`);
  const risk = objectAt(record.riskPredicate, `${path}.riskPredicate`);
  exactKeys(risk, ["id", "sensitivePrefixes", "sensitiveFiles"], `${path}.riskPredicate`);
  const riskId = enumAt(risk.id, ["sensitive-paths/v1"], `${path}.riskPredicate.id`);
  const lifecycleTail = objectAt(record.lifecycleTailPredicate, `${path}.lifecycleTailPredicate`);
  exactKeys(lifecycleTail, ["id"], `${path}.lifecycleTailPredicate`);
  const lifecycleTailId = enumAt(
    lifecycleTail.id,
    ["lifecycle-bookkeeping-tail/v1"],
    `${path}.lifecycleTailPredicate.id`,
  );

  const authorMapRecord = objectAt(record.authorMap, `${path}.authorMap`);
  const authorMap = Object.fromEntries(Object.entries(authorMapRecord).map(([author, owner]) => [
    stringAt(author, `${path}.authorMap key`),
    stringAt(owner, `${path}.authorMap.${author}`),
  ]));
  const templatePolicy = parseReviewPolicy({
    schemaVersion: 1,
    semanticsVersion: stringAt(record.semanticsVersion, `${path}.semanticsVersion`),
    requirements: record.requirementTemplates,
  });
  const bindings = arrayAt(record.rubricBindings, `${path}.rubricBindings`, (value, itemPath) => {
    const binding = objectAt(value, itemPath);
    exactKeys(binding, ["requirementKind", "rubricVersion"], itemPath);
    return {
      requirementKind: stringAt(binding.requirementKind, `${itemPath}.requirementKind`),
      rubricVersion: stringAt(binding.rubricVersion, `${itemPath}.rubricVersion`),
    };
  });
  const timeouts = objectAt(record.timeouts, `${path}.timeouts`);
  exactKeys(timeouts, ["reservationMinutes", "analysisMinutes"], `${path}.timeouts`);
  const providerIdentities = objectAt(record.providerIdentities, `${path}.providerIdentities`);
  exactKeys(providerIdentities, ["coderabbitBotUserId", "appBotUserId"], `${path}.providerIdentities`);
  const coderabbitBotUserId = stringAt(
    providerIdentities.coderabbitBotUserId,
    `${path}.providerIdentities.coderabbitBotUserId`,
  );
  if (!/^[1-9][0-9]*$/u.test(coderabbitBotUserId)) throw new Error("invalid CodeRabbit bot user id");
  const appBotUserId = stringAt(
    providerIdentities.appBotUserId,
    `${path}.providerIdentities.appBotUserId`,
  );
  if (!/^[1-9][0-9]*$/u.test(appBotUserId)) throw new Error("invalid App bot user id");
  const qualifications = arrayAt(record.qualifications, `${path}.qualifications`, parseQualification);
  const enforcement = objectAt(record.attestationEnforcement, `${path}.attestationEnforcement`);
  exactKeys(
    enforcement,
    ["acceptedRuntimeKinds", "maxRunAgeMinutes"],
    `${path}.attestationEnforcement`,
  );
  const acceptedRuntimeKindRecord = objectAt(
    enforcement.acceptedRuntimeKinds,
    `${path}.attestationEnforcement.acceptedRuntimeKinds`,
  );
  const acceptedRuntimeSources = new Set(qualifications
    .filter((qualification) => qualification.enabled
      && qualification.sourceKind === "agent"
      && qualification.transport === "authenticated-attestation")
    .map((qualification) => qualification.sourceIdentity));
  const missingRuntimeKind = [...acceptedRuntimeSources]
    .find((sourceIdentity) => !(sourceIdentity in acceptedRuntimeKindRecord));
  if (missingRuntimeKind !== undefined) {
    throw new Error(`enabled agent qualification is missing an accepted runtime kind: ${missingRuntimeKind}`);
  }
  const acceptedRuntimeKinds = Object.fromEntries(Object.entries(acceptedRuntimeKindRecord).map(
    ([sourceIdentity, runtimeKind]) => {
      if (!acceptedRuntimeSources.has(sourceIdentity)) {
        throw new Error(`accepted runtime source is not an enabled agent qualification: ${sourceIdentity}`);
      }
      return [
        sourceIdentity,
        stringAt(runtimeKind, `${path}.attestationEnforcement.acceptedRuntimeKinds.${sourceIdentity}`),
      ];
    },
  ));

  return {
    schemaVersion: schemaOneAt(record.schemaVersion, `${path}.schemaVersion`),
    semanticsVersion: templatePolicy.semanticsVersion,
    lanePredicate: {
      id: laneId,
      artifactRoots: exactStringArray(lane.artifactRoots, SELF_HOSTING_POLICY.lanePredicate.artifactRoots, `${path}.lanePredicate.artifactRoots`),
      artifactKinds: exactStringArray(lane.artifactKinds, SELF_HOSTING_POLICY.lanePredicate.artifactKinds, `${path}.lanePredicate.artifactKinds`),
    },
    riskPredicate: {
      id: riskId,
      sensitivePrefixes: exactStringArray(risk.sensitivePrefixes, SELF_HOSTING_POLICY.riskPredicate.sensitivePrefixes, `${path}.riskPredicate.sensitivePrefixes`),
      sensitiveFiles: exactStringArray(risk.sensitiveFiles, SELF_HOSTING_POLICY.riskPredicate.sensitiveFiles, `${path}.riskPredicate.sensitiveFiles`),
    },
    lifecycleTailPredicate: { id: lifecycleTailId },
    authorMap,
    requirementTemplates: templatePolicy.requirements,
    rubricBindings: bindings,
    timeouts: {
      reservationMinutes: integerAt(timeouts.reservationMinutes, `${path}.timeouts.reservationMinutes`, 1),
      analysisMinutes: integerAt(timeouts.analysisMinutes, `${path}.timeouts.analysisMinutes`, 1),
    },
    providerIdentities: { coderabbitBotUserId, appBotUserId },
    attestationEnforcement: {
      acceptedRuntimeKinds,
      maxRunAgeMinutes: integerAt(
        enforcement.maxRunAgeMinutes,
        `${path}.attestationEnforcement.maxRunAgeMinutes`,
        1,
      ),
    },
    qualifications,
  };
}
