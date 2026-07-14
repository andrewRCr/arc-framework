/**
 * Public contracts for commit-message validation.
 *
 * The grammar and policy implementations remain private to this module. Consumers
 * receive stable findings and outcomes and inject repository facts through the
 * interfaces below.
 *
 * @module
 */

/** Commit-message formats supported by ARC policy. */
export type CommitMessageFormat = "conventional" | "custom" | "any";

/** Context-footer modes supported by ARC policy. */
export type ContextFooterMode = "required" | "recommended" | "custom" | "disabled";

/** Role used only for author-facing commit-footer advisories. */
export type CommitCheckRole = "maintainer" | "contributor";

/** Stable finding identifiers intended for tests and future automation. */
export type CommitCheckFindingCode =
  | "config.invalid-value"
  | "config.invalid-number"
  | "config.empty-pattern"
  | "config.invalid-pattern"
  | "config.unsupported-pattern-dialect"
  | "subject.invalid-format"
  | "subject.custom-mismatch"
  | "subject.too-short"
  | "subject.too-long"
  | "footer.missing"
  | "footer.invalid"
  | "footer.custom-mismatch"
  | "footer.artifact-not-found"
  | "footer.artifact-unresolvable"
  | "footer.contributor-advisory"
  | "body.too-many-lines"
  | "body.line-too-long"
  | "message.dotted-phase";

/** Finding severity. Errors reject a message; warnings preserve acceptance. */
export type CommitCheckSeverity = "error" | "warning";

/** A location tied to one logical message line. Lines are one-based. */
export interface CommitCheckMessageLineLocation {
  kind: "message-line";
  line: number;
}

/** A location applying to the message as a whole. */
export interface CommitCheckWholeMessageLocation {
  kind: "whole-message";
}

/** A location tied to one arc-config.yml key. */
export interface CommitCheckConfigurationLocation {
  kind: "configuration-key";
  key: CommitCheckConfigurationKey;
}

/** Discriminated location carried by every finding. */
export type CommitCheckLocation =
  | CommitCheckMessageLineLocation
  | CommitCheckWholeMessageLocation
  | CommitCheckConfigurationLocation;

/** Scalar values allowed in structured finding details. */
export type CommitCheckDetailValue = string | number | boolean | readonly string[];

/** Machine-readable context supplementing a finding's stable code. */
export type CommitCheckFindingDetail = Readonly<Record<string, CommitCheckDetailValue>>;

/** One machine-stable validation finding. */
export interface CommitCheckFinding {
  code: CommitCheckFindingCode;
  severity: CommitCheckSeverity;
  location: CommitCheckLocation;
  message: string;
  detail: CommitCheckFindingDetail;
}

/** Three-valued verdict for an actively validated message. */
export type CommitCheckVerdict = "pass" | "pass-with-warnings" | "fail";

/** All configuration keys consumed by commit-message validation. */
export type CommitCheckConfigurationKey =
  | "hooks.commit_msg"
  | "commit.format"
  | "commit.context_footer"
  | "commit.custom_pattern"
  | "commit.context_pattern"
  | "hooks.subject_max_length"
  | "hooks.body_max_lines"
  | "hooks.body_max_line_length";

/** Raw, quote-normalized configuration values supplied to validation. */
export type CommitCheckConfiguration = Readonly<Record<CommitCheckConfigurationKey, string>>;

/** Validated policy consumed by the grammar layer. */
export interface CommitCheckPolicy {
  format: CommitMessageFormat;
  contextFooter: ContextFooterMode;
  customPattern: string;
  contextPattern: string;
  subjectMaxLength: number;
  bodyMaxLines: number;
  bodyMaxLineLength: number;
}

/** Result of resolving raw configuration into an active policy. */
export type CommitCheckPolicyResolution =
  | { kind: "disabled" }
  | { kind: "active"; policy: CommitCheckPolicy }
  | { kind: "invalid"; findings: readonly CommitCheckFinding[] };

/** Artifact families referenced by legal Context trailers. */
export type CommitCheckArtifactFamily = "tasks" | "design" | "meta";

/** Reference passed to the injected artifact resolver. */
export interface CommitCheckArtifactReference {
  family: CommitCheckArtifactFamily;
  filename: string;
}

/** Result of inspecting every allowed root for an artifact family. */
export type CommitCheckArtifactResolution = "found" | "not-found" | "unresolvable";

/** Repository-bound artifact lookup seam. */
export type CommitCheckArtifactResolver = (
  reference: CommitCheckArtifactReference,
) => CommitCheckArtifactResolution | Promise<CommitCheckArtifactResolution>;

/** Repository facts shared by the hook, public check command, and wrapper. */
export interface CommitCheckRepositoryState {
  mergeInProgress: boolean;
  role: CommitCheckRole;
  resolveArtifact: CommitCheckArtifactResolver;
}

/** Unnormalized facts accepted by the shared context constructor. */
export interface CommitCheckContextInput {
  configuration: CommitCheckConfiguration;
  mergeInProgress: boolean;
  role?: string | null;
  resolveArtifact: CommitCheckArtifactResolver;
}

/** One normalized context injected into every validation surface. */
export interface CommitCheckContext {
  configuration: CommitCheckConfiguration;
  repository: CommitCheckRepositoryState;
}

/** Typed reason for bypassing active grammar validation. */
export type CommitCheckExemptionReason = "disabled" | "merge-in-progress";

/** Validation was intentionally bypassed by a configured or Git-state exemption. */
export interface CommitCheckSkippedOutcome {
  kind: "skipped";
  reason: CommitCheckExemptionReason;
}

/** Active validation completed with a three-valued verdict and stable findings. */
export interface CommitCheckValidatedOutcome {
  kind: "validated";
  verdict: CommitCheckVerdict;
  findings: readonly CommitCheckFinding[];
}

/** Public result returned by every commit-message validation consumer. */
export type CommitCheckOutcome = CommitCheckSkippedOutcome | CommitCheckValidatedOutcome;
