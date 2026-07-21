/** Runtime schemas and descriptor catalog for authorable ARC configuration. */

import { z } from "zod";

/** How a quoted empty string participates in a field's authoring policy. */
export type QuotedEmptyPosture = "default" | "unset" | "invalid";

/** Stable policy family associated with one authorable configuration field. */
export type ArcConfigFieldPolicy =
  | { readonly kind: "enum"; readonly values: readonly string[] }
  | { readonly kind: "boolean-token" }
  | { readonly kind: "positive-safe-integer"; readonly minimum: number }
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
const STRICT_META_REF_PATTERN_DEFAULT = "PRD " + "R[0-9]+|\\b[RB][0-9]+\\b|" + "§" + " ";

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
  "enum" | "boolean-token" | "positive-safe-integer"
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

const POSITIVE_SAFE_INTEGER_PATTERN = /^0*(?:[1-9]\d{0,14}|[1-8]\d{15}|900719925474099[01])$/u;
const SAFE_INTEGER_AT_LEAST_TEN_PATTERN = /^0*(?:[1-9]\d{1,14}|[1-8]\d{15}|900719925474099[01])$/u;

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
  enumField("review.pre_merge", ["enabled", "disabled"], "enabled"),
  enumField(
    "platform.type",
    ["github", "gitlab", "bitbucket", "azure-devops"],
    "github",
  ),
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
