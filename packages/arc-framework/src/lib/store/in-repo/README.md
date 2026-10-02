# Tracked record backend

The public factory in the parent directory owns backend loading. Callers supply the complete port object and use
logical record references; this directory translates those operations to the checkout's existing records.

Flat active metas and held checkout listings use regular files directly, without Git. Other live work-unit reads
use the existing local lifecycle composition, including fetched remote-tracking refs, and share its selected copy
with companion reads and write admission. A saved state selects only the immutable tree at that branch commit.
Malformed listed records retain a diagnostic; reads preserve raw prose and meta bytes where their format permits it.

Tracked writes compare exact content digests under the checkout's own advisory lock. Internal machine records use
existing canonical writers and their per-file locks. Batches capture all targets, reject every stale target before
mutation, and restore attempted writes after failure. Writes leave the Git index untouched. Placement moves, UIDs,
links, and completed creation retain explicit refusal routes to the existing lifecycle verbs.

History and changes follow committed record bytes and preserve commit messages. Logical lookup derives current
slugs, transition aliases, checkout claims, branch names, and final Context footers. Personal and transient identity
operations remain explicit dispatch arms; tracked state reports that it lives on the branch.
