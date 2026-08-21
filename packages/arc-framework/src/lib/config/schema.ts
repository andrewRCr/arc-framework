/** Runtime schemas and descriptor catalog for authorable ARC configuration. */

import { z } from "zod";

/** How a quoted empty string participates in a field's authoring policy. */
export type QuotedEmptyPosture = "default" | "unset" | "invalid";

/** Stable policy family associated with one authorable configuration field. */
export type ArcConfigFieldPolicy =
  | { readonly kind: "enum"; readonly values: readonly string[] }
  | { readonly kind: "boolean-token" }
  | { readonly kind: "positive-safe-integer"; readonly minimum: number }
  | { readonly kind: "unsigned-safe-integer" }
  | { readonly kind: "registry-id-list" }
  | {
    readonly kind:
      | "pattern"
      | "branch"
      | "worktree-template"
      | "harness-directories"
      | "shell-command";
  };

/** One catalog entry for a project-level `arc-config.yml` field. */
export interface ArcConfigFieldDescriptor<
  Key extends string = string,
  Schema extends z.ZodType<string> = z.ZodType<string>,
> {
  readonly key: Key;
  readonly schema: Schema;
  readonly defaultValue: string;
  readonly quotedEmpty: QuotedEmptyPosture;
  readonly policy: ArcConfigFieldPolicy;
}

/** Non-empty branch token; lexical Git-ref policy remains at Git-facing adapters. */
export const BranchNameSchema = z.string().min(1);

/** Non-empty worktree template; token and path interpretation remain at its adapter. */
export const WorktreeTemplateSchema = z.string().min(1);

/** Optional shell command source; command interpretation remains at its execution boundary. */
export const ShellCommandSchema = z.string();

/** Optional pattern source; compiling the selected regex belongs to its policy consumer. */
export const PatternSourceSchema = z.string();

/** One normalized top-level harness directory accepted by the worktree adapter. */
export const HarnessDirectorySchema = z.string()
  .min(1)
  .regex(/^(?!(?:\.{1,2}|\.git|\.arc)$)[^/\\]+$/iu);

const HarnessDirectoryListSourceSchema = z.string();
const STRICT_META_REF_PATTERN_DEFAULT = "PRD " + "R[0-9]+|\\b[RB][0-9]+\\b|"
  + String.fromCodePoint(0xa7) + " ";

function enumField<const Key extends string, const Values extends readonly [string, ...string[]]>(
  key: Key,
  values: Values,
  defaultValue: Values[number],
) {
  return {
    key,
    schema: z.union([z.enum(values), z.literal("")]),
    defaultValue,
    quotedEmpty: "default",
    policy: { kind: "enum", values },
  } satisfies ArcConfigFieldDescriptor<Key>;
}

function booleanField<const Key extends string>(key: Key, defaultValue: "false" | "true") {
  return {
    key,
    schema: z.union([z.enum(["false", "true"]), z.literal("")]),
    defaultValue,
    quotedEmpty: "default",
    policy: { kind: "boolean-token" },
  } satisfies ArcConfigFieldDescriptor<Key>;
}

type StringFieldPolicyKind = Exclude<
  ArcConfigFieldPolicy["kind"],
  "enum" | "boolean-token" | "positive-safe-integer" | "unsigned-safe-integer" | "registry-id-list"
>;

function stringField<const Key extends string, Schema extends z.ZodType<string>>(
  key: Key,
  schema: Schema,
  defaultValue: string,
  quotedEmpty: QuotedEmptyPosture,
  kind: StringFieldPolicyKind,
) {
  return {
    key,
    schema: quotedEmpty === "default" ? z.union([schema, z.literal("")]) : schema,
    defaultValue,
    quotedEmpty,
    policy: { kind },
  } satisfies ArcConfigFieldDescriptor<Key>;
}

const MAX_SAFE_INTEGER_DECIMAL = String(Number.MAX_SAFE_INTEGER);

function decimalDigitRange(minimum: number, maximum: number): string {
  return minimum === maximum ? String(minimum) : `[${minimum}-${maximum}]`;
}

function safeIntegerPattern(minimum: 0 | 1 | 10): RegExp {
  const minimumDigits = minimum === 10 ? 2 : 1;
  const maximumDigits = MAX_SAFE_INTEGER_DECIMAL.length;
  const alternatives = minimum === 0 ? ["0"] : [];
  alternatives.push(`[1-9]\\d{${minimumDigits - 1},${maximumDigits - 2}}`);

  let equalPrefix = "";
  for (let index = 0; index < maximumDigits; index += 1) {
    const digitToken = MAX_SAFE_INTEGER_DECIMAL.charAt(index);
    const maximumDigit = Number(digitToken);
    const minimumDigit = index === 0 ? 1 : 0;
    if (maximumDigit > minimumDigit) {
      const suffixLength = maximumDigits - index - 1;
      const suffix = suffixLength === 0 ? "" : `\\d{${suffixLength}}`;
      alternatives.push(
        `${equalPrefix}${decimalDigitRange(minimumDigit, maximumDigit - 1)}${suffix}`,
      );
    }
    equalPrefix += digitToken;
  }
  alternatives.push(MAX_SAFE_INTEGER_DECIMAL);

  return new RegExp(`^0*(?:${alternatives.join("|")})$`, "u");
}

const POSITIVE_SAFE_INTEGER_PATTERN = safeIntegerPattern(1);
const SAFE_INTEGER_AT_LEAST_TEN_PATTERN = safeIntegerPattern(10);
const UNSIGNED_SAFE_INTEGER_PATTERN = safeIntegerPattern(0);

function positiveSafeIntegerField<const Key extends string>(
  key: Key,
  defaultValue: string,
  minimum: 1 | 10,
) {
  return {
    key,
    schema: z.string().regex(
      minimum === 1 ? POSITIVE_SAFE_INTEGER_PATTERN : SAFE_INTEGER_AT_LEAST_TEN_PATTERN,
    ),
    defaultValue,
    quotedEmpty: "invalid",
    policy: { kind: "positive-safe-integer", minimum },
  } satisfies ArcConfigFieldDescriptor<Key>;
}

function unsignedSafeIntegerField<const Key extends string>(key: Key, defaultValue: string) {
  return {
    key,
    schema: z.string().regex(UNSIGNED_SAFE_INTEGER_PATTERN),
    defaultValue,
    quotedEmpty: "invalid",
    policy: { kind: "unsigned-safe-integer" },
  } satisfies ArcConfigFieldDescriptor<Key>;
}

function registryIdListField<const Key extends string, Schema extends z.ZodType<string>>(
  key: Key,
  schema: Schema,
  defaultValue: string,
  quotedEmpty: QuotedEmptyPosture,
) {
  return {
    key,
    schema,
    defaultValue,
    quotedEmpty,
    policy: { kind: "registry-id-list" },
  } satisfies ArcConfigFieldDescriptor<Key>;
}

const REGISTRY_ID_SOURCE = "[a-z][a-z0-9]*(?:-[a-z0-9]+)*";
const STANDARD_SOURCE_ID_SOURCE = "(?:coderabbit-pr|codex-pr|delegated-agent)";
const FRONTLINE_SOURCE_ID_SOURCE =
  `(?!(?:${STANDARD_SOURCE_ID_SOURCE})(?=\\s*(?:,|\\]|$)))${REGISTRY_ID_SOURCE}`;
const FRONTLINE_SOURCE_SEGMENT = `\\s*(?:${FRONTLINE_SOURCE_ID_SOURCE})?\\s*`;
const STANDARD_SOURCE_SEGMENT = `\\s*(?:${STANDARD_SOURCE_ID_SOURCE})?\\s*`;
const FrontlineSourceListSchema = z.string().regex(new RegExp(
  `^(?:${FRONTLINE_SOURCE_SEGMENT}(?:,${FRONTLINE_SOURCE_SEGMENT})*`
    + `|\\[${FRONTLINE_SOURCE_SEGMENT}(?:,${FRONTLINE_SOURCE_SEGMENT})*\\])$`,
  "u",
));
const StandardSourceListSchema = z.string().regex(new RegExp(
  `^\\[${STANDARD_SOURCE_SEGMENT}(?:,${STANDARD_SOURCE_SEGMENT})*\\]$`,
  "u",
));

/** Complete field catalog; later consumers derive keys, defaults, and schemas from this tuple. */
export const ARC_CONFIG_FIELDS = [
  stringField("branch.base", BranchNameSchema, "main", "default", "branch"),
  enumField("branch.protection", ["partial", "full"], "partial"),
  stringField(
    "worktree.location_template",
    WorktreeTemplateSchema,
    "../{repo}.{name}",
    "invalid",
    "worktree-template",
  ),
  stringField("worktree.post_create", ShellCommandSchema, "", "unset", "shell-command"),
  stringField(
    "worktree.harness_dirs",
    HarnessDirectoryListSourceSchema,
    ".claude,.codex,.gemini,.opencode",
    "unset",
    "harness-directories",
  ),
  enumField("commit.format", ["conventional", "custom", "any"], "conventional"),
  enumField(
    "commit.context_footer",
    ["required", "recommended", "custom", "disabled"],
    "required",
  ),
  stringField("commit.custom_pattern", PatternSourceSchema, "", "unset", "pattern"),
  stringField("commit.context_pattern", PatternSourceSchema, "", "unset", "pattern"),
  enumField("merge.strategy", ["merge", "rebase", "squash"], "merge"),
  enumField("merge.lock", ["draft", "none"], "none"),
  enumField("hooks.pre_commit", ["enabled", "disabled"], "enabled"),
  enumField("hooks.commit_msg", ["enabled", "disabled"], "enabled"),
  enumField("hooks.pre_push", ["enabled", "disabled"], "enabled"),
  enumField("hooks.task_numbering", ["error", "warning", "off"], "error"),
  stringField(
    "hooks.skip_extensions",
    PatternSourceSchema,
    "md|yml|yaml|json|toml|txt|csv|lock|conf|cfg|ini|env|license|makefile",
    "unset",
    "pattern",
  ),
  stringField(
    "hooks.test_patterns",
    PatternSourceSchema,
    "__tests__/|\\.test\\.|\\.spec\\.|/test/|/tests/",
    "unset",
    "pattern",
  ),
  stringField(
    "hooks.strict_meta_ref_patterns",
    PatternSourceSchema,
    STRICT_META_REF_PATTERN_DEFAULT,
    "unset",
    "pattern",
  ),
  stringField(
    "hooks.meta_ref_patterns",
    PatternSourceSchema,
    "[Tt]ask [0-9]+\\.[0-9]+|[Pp]hase [0-9]+|\\.arc/|"
      + "(tasks|plan|prd|status|notes|atomic)-[a-z][a-z0-9-]+\\.md",
    "unset",
    "pattern",
  ),
  positiveSafeIntegerField("hooks.subject_max_length", "72", 10),
  positiveSafeIntegerField("hooks.body_max_lines", "100", 1),
  positiveSafeIntegerField("hooks.body_max_line_length", "100", 1),
  stringField(
    "hooks.contributor_protected_paths",
    PatternSourceSchema,
    "active/|backlog/",
    "unset",
    "pattern",
  ),
  enumField(
    "platform.type",
    ["github", "gitlab", "bitbucket", "azure-devops"],
    "github",
  ),
  registryIdListField("review.frontline_sources", FrontlineSourceListSchema, "[]", "default"),
  registryIdListField("review.standard_sources", StandardSourceListSchema, "[]", "invalid"),
  positiveSafeIntegerField("review.frontline_max_passes", "2", 1),
  positiveSafeIntegerField("review.standard_max_passes", "2", 1),
  unsignedSafeIntegerField("changeset.advisory_threshold_lines", "0"),
  unsignedSafeIntegerField("changeset.advisory_threshold_files", "0"),
  enumField("pm.mode", ["none", "arc-in-git", "external"], "none"),
  booleanField("team.mode", "false"),
  enumField("session.remote_sync", ["enabled", "disabled"], "enabled"),
  enumField("session.init_pull.worktree", ["manual", "prompt"], "prompt"),
  enumField("session.init_pull.notes", ["manual", "prompt", "always"], "prompt"),
  enumField("session.init_pull.base", ["manual", "prompt", "always"], "prompt"),
  enumField("session.init_load.notes", ["manual", "prompt", "always"], "prompt"),
  enumField("user.notes_push", ["manual", "prompt", "on-sync"], "on-sync"),
  booleanField("sync.auto_pull", "false"),
  enumField("archive.cadence", ["with-integration", "manual"], "with-integration"),
  positiveSafeIntegerField("inbox.remind_after_days", "1", 1),
  positiveSafeIntegerField("integration.stale_after_days", "2", 1),
] as const satisfies readonly ArcConfigFieldDescriptor[];

/** One field from the authoritative project-configuration catalog. */
export type ArcConfigField = (typeof ARC_CONFIG_FIELDS)[number];

/** Every active project-level configuration key. */
export type ArcConfigKey = ArcConfigField["key"];

/** Enum-domain value registered for one enum-backed configuration key. */
export type ArcConfigEnumValue<Key extends ArcConfigKey> = Extract<
  Extract<ArcConfigField, { key: Key }>["policy"],
  { kind: "enum" }
>["values"][number];

/**
 * Resolve one catalog descriptor while preserving its key-specific type.
 *
 * @param key - Registered project-configuration key
 * @returns The descriptor registered for that key
 */
export function getArcConfigField<Key extends ArcConfigKey>(
  key: Key,
): Extract<ArcConfigField, { key: Key }> {
  const field = ARC_CONFIG_FIELDS.find((candidate) => candidate.key === key);
  if (field === undefined) {
    throw new Error(`Unknown ARC config field: ${key}`);
  }
  return field as Extract<ArcConfigField, { key: Key }>;
}

/** Complete catalog projection consumed by full configuration validation. */
export const CONFIG_VALIDATION_FIELDS = ARC_CONFIG_FIELDS;

/** Project fields consumed by worktree creation and provisioning. */
export const WORKTREE_CONFIG_FIELDS = [
  getArcConfigField("worktree.location_template"),
  getArcConfigField("worktree.post_create"),
  getArcConfigField("worktree.harness_dirs"),
] as const;

/** Ordered project fields consumed by commit-message validation. */
export const COMMIT_CHECK_CONFIG_FIELDS = [
  getArcConfigField("hooks.commit_msg"),
  getArcConfigField("commit.format"),
  getArcConfigField("commit.context_footer"),
  getArcConfigField("commit.custom_pattern"),
  getArcConfigField("commit.context_pattern"),
  getArcConfigField("hooks.subject_max_length"),
  getArcConfigField("hooks.body_max_lines"),
  getArcConfigField("hooks.body_max_line_length"),
] as const;

/** Project-configuration key consumed by commit-message validation. */
export type CommitCheckConfigKey = (typeof COMMIT_CHECK_CONFIG_FIELDS)[number]["key"];

type KnownConfigShape = {
  [Key in ArcConfigKey]: Extract<ArcConfigField, { key: Key }>["schema"];
};

const knownConfigShape = Object.fromEntries(
  ARC_CONFIG_FIELDS.map(({ key, schema }) => [key, schema]),
) as KnownConfigShape;

/** Open tokenizer output before authoring-key and known-domain validation. */
export const RawArcConfigSchema = z.record(z.string(), z.string());

const AuthorableConfigRecordSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_.]+$/u),
  z.string(),
);

/** Authorable project configuration with strict known domains and forward-compatible matching keys. */
export const ArcConfigSchema = z.intersection(
  AuthorableConfigRecordSchema,
  z.looseObject(knownConfigShape).partial(),
);

/** Project keys surfaced to agents rather than consumed only by hooks. */
export type AgentConsumableConfigKey = Exclude<ArcConfigKey, `hooks.${string}`>;

/** One descriptor from the agent-consumable catalog projection. */
export type AgentConsumableConfigField = Extract<
  ArcConfigField,
  { key: AgentConsumableConfigKey }
>;

/** Ordered catalog projection surfaced by status and lifecycle adapters. */
export const AGENT_CONSUMABLE_CONFIG_FIELDS = ARC_CONFIG_FIELDS.filter(
  ({ key }) => !key.startsWith("hooks."),
) as readonly AgentConsumableConfigField[];

type ConfigSettingsShape = { [Key in AgentConsumableConfigKey]: z.ZodString };

const configSettingsShape = Object.fromEntries(
  AGENT_CONSUMABLE_CONFIG_FIELDS.map(({ key }) => [key, z.string()]),
) as ConfigSettingsShape;

/** Complete, raw-string projection consumed by agent-facing status and lifecycle adapters. */
export const ConfigSettingsSchema = z.strictObject(configSettingsShape);

export type RawArcConfig = z.infer<typeof RawArcConfigSchema>;
export type ArcConfig = z.infer<typeof ArcConfigSchema>;
export type ConfigSettings = z.infer<typeof ConfigSettingsSchema>;
