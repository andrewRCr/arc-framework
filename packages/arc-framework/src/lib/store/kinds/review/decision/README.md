# Review decisions

One immutable envelope stores a review choice and the subject, lane, actor, and basis that bind it. Extra passes carry
ceiling, additional-pass, or approved-fix preconditions. Standard-lane termini carry the offer's pass count as their
basis; frontline skips and withdrawals carry no basis. Historical attribution and subject details may be unknown,
except that an approved-fix decision always retains its authorizer and originating head.

Decision keys omit recording time. Approved-fix keys reuse the conditional authorization identity, including the
original producer ID and logical pass, so existing approval and admission references keep resolving. Other keys bind
the subject, lane, choice, actor, and basis. The parser refuses contradictory and incomplete envelopes.

The write check binds each key to its envelope. Approved-fix decisions require their stored finished producer with the
same repository, lane, lineage owner, originating head, and logical pass. A withdrawal names a non-withdrawal decision
on the same work item; approved-fix withdrawals additionally require the original authorizer and no outcome citing the
grant as its admission. Incomplete or malformed related histories refuse. Live admission and successor timing remain
with the withdrawing verb, which can observe their ordering.
