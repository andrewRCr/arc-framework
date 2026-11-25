/** The owner-root filename namespace reserved for discovering archive metadata candidates. */
const OWNER_METADATA_NAME = /^metadata-[0-9a-f-]{36}\.json$/u;

/** Include malformed UID spellings in the reserved namespace so readers can diagnose them. */
export function isOwnerMetadataName(name: string): boolean { return OWNER_METADATA_NAME.test(name); }
