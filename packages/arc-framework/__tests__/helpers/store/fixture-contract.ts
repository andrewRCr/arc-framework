/** Backend-neutral hooks and named exclusions used by the sixteen-item conformance suite. */

import type {
  FamilyId, KindId, RecordReference, RefusalCode, StateVersion, Store, StoreResult,
  UnsupportedCase, WriteInput, WriteResult, EntryConfig,
} from "../../../src/lib/store/index.js";

/** The numbered contract item, kept stable across every backend fixture. */
export type SuiteItem = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
/** One refusal scenario; interim unsupported cases and missing identity have their own names. */
export type RecoveryCaseId = Exclude<RefusalCode, "unsupported" | "not-found">
  | `unsupported:${UnsupportedCase}` | "not-found:name" | "not-found:identity"
  | `transient-write:${"unreachable" | "refused" | "retries-exhausted" | "version-conflict" | "record-malformed"}`;
/** A deliberately planted bad stored entry, or an unreadable whole family. */
export type PlantKind = "unreadable" | "oversized" | "malformed" | "key-mismatch" | "unknown-format-version" | "family-unreadable";
/** The remote's observable transport or contention state. */
export type RemoteState = "available" | "down" | "contended" | "refusing";

/** Reasons a backend cannot produce an entire item or named assertion in a served family. */
export interface FamilyExclusions {
  items?: Partial<Record<SuiteItem, string>>;
  assertions?: Record<string, string>;
}
/** Fixture facts belong to tests, rather than the production capability report. */
export interface FixtureDeclarations {
  families: readonly FamilyId[];
  mergesConcurrentWrites: boolean;
  substrates: readonly string[];
  stateOffBranch: boolean;
  liveListingStateVersion: boolean;
  syncFamilies: readonly FamilyId[];
  identitySyncFamilies: readonly FamilyId[];
  entryShapes: Partial<Record<KindId, EntryConfig>>;
  familyExclusions: Partial<Record<FamilyId, FamilyExclusions>>;
  refusalExclusions: Partial<Record<RecoveryCaseId, string>>;
  rejectingContentUnavailable: Partial<Record<KindId, string>>;
}

/** A caused refusal's real operation, kept for retry after the fixture applies its remedy. */
export interface RecoveryOperation {
  run(): Promise<StoreResult<unknown>>;
}
/** Backend-neutral test interface; all state and faults enter through these hooks. */
export interface ConformanceFixture {
  readonly store: Store;
  readonly declarations: FixtureDeclarations;
  reference(kind: KindId, suffix?: string): RecordReference;
  content(reference: RecordReference, variant?: "valid" | "changed" | "changed-again" | "invalid"): string;
  settle(): Promise<StateVersion>;
  reopen(): Store;
  race(left: WriteInput, right: WriteInput): Promise<[StoreResult<WriteResult>, StoreResult<WriteResult>]>;
  remote(enabled: boolean): Store | undefined;
  identity(name: string | undefined): void;
  plant(reference: RecordReference, kind: PlantKind): void;
  hold(reference: RecordReference, held: boolean): void;
  remoteState(state: RemoteState, message?: string): void;
  produce(caseId: RecoveryCaseId): Promise<RecoveryOperation>;
  repair(caseId: RecoveryCaseId): Promise<void>;
}

/** Registration pairs static declarations with a fresh isolated fixture for each assertion. */
export interface ConformanceRegistration {
  declarations: FixtureDeclarations;
  create(): ConformanceFixture;
}
