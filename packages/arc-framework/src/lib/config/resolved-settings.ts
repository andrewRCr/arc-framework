/**
 * Three-tier resolver wrapper for the release-mode keys.
 *
 * Composes {@link readConfigSettings} (yaml-only) with per-key
 * {@link resolveGitConfigOverride} calls so callers needing the resolved
 * surface read a single function. Each release-mode key returns a
 * `{ value, source }` pair so diagnostic surfaces (orchestrator `--json`
 * envelope, audit logs) carry provenance alongside the value.
 *
 * **Key surface.** Five keys with `git config arc.* → arc-config.yml → default`
 * precedence:
 *
 * - `arc.commitInterlock` / `session.commit_interlock`
 * - `arc.pushInterlock` / `session.push_interlock`
 * - `arc.syncInterlock` / `session.sync_interlock`
 * - `arc.notesPush` / `user.notes_push`
 * - `arc.releaseEnabled` / `release.enabled`
 *
 * **Validator source-of-truth.** Per-key validators live here (passed once
 * into the generic helper). `status-reader.ts` deliberately omits these
 * five keys from its `ENUM_VALIDATORS` map — yaml values flow through the
 * reader as raw strings, and validation lands once in this wrapper. Callers
 * that bypass the wrapper (`arc config status` reads the reader directly)
 * see raw yaml values without warnings; the operational read paths
 * (handlers, orchestrator) validate via the wrapper.
 *
 * **Spawn cost.** Five `git config --get` calls fire concurrently via
 * `Promise.all`, alongside the yaml read — roughly one round-trip latency.
 * Add caching only if profiling shows it.
 *
 * **Direct primitive access.** Constants and type guards are exported so
 * downstream consumers (planned interlock-release wrappers per
 * `plan-interlock-release-wrappers.md`) can call
 * {@link resolveGitConfigOverride} per key without going through the
 * composite wrapper.
 *
 * @module
 */

import {
  resolveGitConfigOverride,
  type ResolvedConfigOverride,
} from "./resolve-override.js";
import { readConfigSettings } from "./status-reader.js";
import type { ConfigSettings } from "../../commands/config/types.js";
import type { GitExec } from "../git/index.js";

// --- Per-key constants and type guards ---

/**
 * Valid commit-interlock policy values. Permissiveness ladder (ascending):
 * `manual` (no agent autofire) < `on-task-approval` (agent fires on approved
 * task work) < `on-workflow` (agent fires on any workflow-mediated event,
 * including ceremony commits).
 */
export type CommitInterlock = "manual" | "on-task-approval" | "on-workflow";

export const COMMIT_INTERLOCK_GIT_CONFIG_KEY = "arc.commitInterlock";
export const COMMIT_INTERLOCK_YAML_KEY = "session.commit_interlock";
export const DEFAULT_COMMIT_INTERLOCK: CommitInterlock = "manual";
const COMMIT_INTERLOCK_VALUES: readonly CommitInterlock[] = [
  "manual",
  "on-task-approval",
  "on-workflow",
];

function isCommitInterlock(value: string): value is CommitInterlock {
  return (COMMIT_INTERLOCK_VALUES as readonly string[]).includes(value);
}

/**
 * Valid push-interlock policy values. Permissiveness ladder (ascending):
 * `manual` (no agent autofire) < `on-sync` (agent fires push leg from sync) <
 * `on-workflow` (agent fires push from any workflow-mediated path, including
 * ceremony pushes via `arc release push`).
 */
export type PushInterlock = "manual" | "on-sync" | "on-workflow";

export const PUSH_INTERLOCK_GIT_CONFIG_KEY = "arc.pushInterlock";
export const PUSH_INTERLOCK_YAML_KEY = "session.push_interlock";
export const DEFAULT_PUSH_INTERLOCK: PushInterlock = "manual";
const PUSH_INTERLOCK_VALUES: readonly PushInterlock[] = [
  "manual",
  "on-sync",
  "on-workflow",
];

function isPushInterlock(value: string): value is PushInterlock {
  return (PUSH_INTERLOCK_VALUES as readonly string[]).includes(value);
}

/**
 * Valid sync-interlock policy values. Permissiveness ladder (ascending):
 * `manual` (no agent autofire) < `on-handoff` (agent fires sync at handoff) <
 * `on-workflow` (agent fires sync at handoff or any other workflow-mediated
 * event). Today `on-workflow` is behaviorally equivalent to `on-handoff` (no
 * other workflow fires sync); reserved for forward-compatibility with future
 * workflows that need to fire sync.
 */
export type SyncInterlock = "manual" | "on-handoff" | "on-workflow";

export const SYNC_INTERLOCK_GIT_CONFIG_KEY = "arc.syncInterlock";
export const SYNC_INTERLOCK_YAML_KEY = "session.sync_interlock";
export const DEFAULT_SYNC_INTERLOCK: SyncInterlock = "on-handoff";
const SYNC_INTERLOCK_VALUES: readonly SyncInterlock[] = [
  "manual",
  "on-handoff",
  "on-workflow",
];

function isSyncInterlock(value: string): value is SyncInterlock {
  return (SYNC_INTERLOCK_VALUES as readonly string[]).includes(value);
}

/** Valid notes-push policy values. */
export type NotesPushPolicy = "manual" | "prompt" | "on-sync";

export const NOTES_PUSH_GIT_CONFIG_KEY = "arc.notesPush";
export const NOTES_PUSH_YAML_KEY = "user.notes_push";
export const DEFAULT_NOTES_PUSH_POLICY: NotesPushPolicy = "on-sync";
const NOTES_PUSH_VALUES: readonly NotesPushPolicy[] = ["manual", "prompt", "on-sync"];

function isNotesPushPolicy(value: string): value is NotesPushPolicy {
  return (NOTES_PUSH_VALUES as readonly string[]).includes(value);
}

/**
 * Valid release-enabled opt-in flag values. String-typed for resolver
 * consistency with the other release-mode keys; consumers convert to
 * boolean (`value === "true"`) at the application boundary.
 */
export type ReleaseEnabled = "true" | "false";

export const RELEASE_ENABLED_GIT_CONFIG_KEY = "arc.releaseEnabled";
export const RELEASE_ENABLED_YAML_KEY = "release.enabled";
export const DEFAULT_RELEASE_ENABLED: ReleaseEnabled = "false";
const RELEASE_ENABLED_VALUES: readonly ReleaseEnabled[] = ["true", "false"];

function isReleaseEnabled(value: string): value is ReleaseEnabled {
  return (RELEASE_ENABLED_VALUES as readonly string[]).includes(value);
}

// --- Per-key resolver helpers ---

/**
 * Shared options for the per-key resolver helpers — covers the I/O surface
 * each helper threads into `resolveGitConfigOverride`.
 */
export interface ResolveSingleKeyOptions {
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
  cwd: string;
  warn?: (message: string) => void;
}

/** Resolve `arc.commitInterlock` → `session.commit_interlock` → default. */
export async function resolveCommitInterlock(
  opts: ResolveSingleKeyOptions,
): Promise<ResolvedConfigOverride<CommitInterlock>> {
  return resolveGitConfigOverride<CommitInterlock>({
    ...opts,
    gitConfigKey: COMMIT_INTERLOCK_GIT_CONFIG_KEY,
    yamlKey: COMMIT_INTERLOCK_YAML_KEY,
    defaultValue: DEFAULT_COMMIT_INTERLOCK,
    isValidValue: isCommitInterlock,
    validValues: COMMIT_INTERLOCK_VALUES,
  });
}

/** Resolve `arc.pushInterlock` → `session.push_interlock` → default. */
export async function resolvePushInterlock(
  opts: ResolveSingleKeyOptions,
): Promise<ResolvedConfigOverride<PushInterlock>> {
  return resolveGitConfigOverride<PushInterlock>({
    ...opts,
    gitConfigKey: PUSH_INTERLOCK_GIT_CONFIG_KEY,
    yamlKey: PUSH_INTERLOCK_YAML_KEY,
    defaultValue: DEFAULT_PUSH_INTERLOCK,
    isValidValue: isPushInterlock,
    validValues: PUSH_INTERLOCK_VALUES,
  });
}

/** Resolve `arc.syncInterlock` → `session.sync_interlock` → default. */
export async function resolveSyncInterlock(
  opts: ResolveSingleKeyOptions,
): Promise<ResolvedConfigOverride<SyncInterlock>> {
  return resolveGitConfigOverride<SyncInterlock>({
    ...opts,
    gitConfigKey: SYNC_INTERLOCK_GIT_CONFIG_KEY,
    yamlKey: SYNC_INTERLOCK_YAML_KEY,
    defaultValue: DEFAULT_SYNC_INTERLOCK,
    isValidValue: isSyncInterlock,
    validValues: SYNC_INTERLOCK_VALUES,
  });
}

/** Resolve `arc.notesPush` → `user.notes_push` → default. */
export async function resolveNotesPushPolicy(
  opts: ResolveSingleKeyOptions,
): Promise<ResolvedConfigOverride<NotesPushPolicy>> {
  return resolveGitConfigOverride<NotesPushPolicy>({
    ...opts,
    gitConfigKey: NOTES_PUSH_GIT_CONFIG_KEY,
    yamlKey: NOTES_PUSH_YAML_KEY,
    defaultValue: DEFAULT_NOTES_PUSH_POLICY,
    isValidValue: isNotesPushPolicy,
    validValues: NOTES_PUSH_VALUES,
  });
}

/** Resolve `arc.releaseEnabled` → `release.enabled` → default. */
export async function resolveReleaseEnabled(
  opts: ResolveSingleKeyOptions,
): Promise<ResolvedConfigOverride<ReleaseEnabled>> {
  return resolveGitConfigOverride<ReleaseEnabled>({
    ...opts,
    gitConfigKey: RELEASE_ENABLED_GIT_CONFIG_KEY,
    yamlKey: RELEASE_ENABLED_YAML_KEY,
    defaultValue: DEFAULT_RELEASE_ENABLED,
    isValidValue: isReleaseEnabled,
    validValues: RELEASE_ENABLED_VALUES,
  });
}

// --- Composite wrapper ---

/** Per-key `{value, source}` pairs for the release-mode keys. */
export interface ResolvedReleaseModeSettings {
  commitInterlock: ResolvedConfigOverride<CommitInterlock>;
  pushInterlock: ResolvedConfigOverride<PushInterlock>;
  syncInterlock: ResolvedConfigOverride<SyncInterlock>;
  notesPush: ResolvedConfigOverride<NotesPushPolicy>;
  releaseEnabled: ResolvedConfigOverride<ReleaseEnabled>;
}

export interface ResolvedSettingsResult {
  /**
   * Full agent-consumable settings — release-mode keys reflect the resolved
   * value (git-config override → yaml → default). Other keys carry raw yaml
   * values per `readConfigSettings`.
   */
  settings: ConfigSettings;
  /** Per-key `{value, source}` provenance for the release-mode keys. */
  resolved: ResolvedReleaseModeSettings;
  /**
   * Keys absent from `arc-config.yml` that received documented defaults.
   * Matches `readConfigSettings` semantics (yaml absence, not override-tier
   * fallback) — a release-mode key may appear here while
   * `resolved.<key>.source === "git-config"`.
   */
  defaultsApplied: string[];
  /**
   * Combined non-fatal diagnostics: yaml-read failures from
   * `readConfigSettings` plus invalid-value warnings from each per-key
   * resolver (git-config tier and yaml tier).
   */
  warnings: string[];
}

export interface ResolveAllSettingsOptions {
  cwd: string;
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
  /**
   * Invoked once per accumulated warning after resolution completes. Fires
   * for every entry in the returned `warnings` array; callers wanting only
   * the array can omit this.
   */
  warn?: (message: string) => void;
}

/**
 * Resolve the full release-mode key surface plus other agent-consumable
 * settings.
 *
 * Yaml read and five git-config-override resolutions fire concurrently. The
 * returned `settings` map mirrors `readConfigSettings`, with the release-mode
 * keys substituted by their resolved values; `resolved` carries the typed
 * `{value, source}` pairs for callers that need provenance.
 */
export async function resolveAllSettings(
  opts: ResolveAllSettingsOptions,
): Promise<ResolvedSettingsResult> {
  const overrideWarnings: string[] = [];
  const collectOverrideWarning = (message: string): void => {
    overrideWarnings.push(message);
  };

  const sharedOpts: ResolveSingleKeyOptions = {
    exec: opts.exec,
    readFile: opts.readFile,
    cwd: opts.cwd,
    warn: collectOverrideWarning,
  };

  const [base, commit, push, sync, notes, releaseEnabled] = await Promise.all([
    readConfigSettings(opts.cwd),
    resolveCommitInterlock(sharedOpts),
    resolvePushInterlock(sharedOpts),
    resolveSyncInterlock(sharedOpts),
    resolveNotesPushPolicy(sharedOpts),
    resolveReleaseEnabled(sharedOpts),
  ]);

  const warnings = [...base.warnings, ...overrideWarnings];
  if (opts.warn) {
    for (const message of warnings) {
      opts.warn(message);
    }
  }

  const settings: ConfigSettings = {
    ...base.settings,
    "session.commit_interlock": commit.value,
    "session.push_interlock": push.value,
    "session.sync_interlock": sync.value,
    "user.notes_push": notes.value,
    "release.enabled": releaseEnabled.value,
  };

  return {
    settings,
    resolved: {
      commitInterlock: commit,
      pushInterlock: push,
      syncInterlock: sync,
      notesPush: notes,
      releaseEnabled,
    },
    defaultsApplied: base.defaultsApplied,
    warnings,
  };
}
