---
name: optimize-doc
description: Optimize documentation for conciseness and clarity by strengthening vague instructions and removing redundancy. Use when asked to optimize, tighten, or improve a documentation file.
---

# Optimize Documentation

**Task**: Optimize the documentation file specified in the arguments.

## Objective

Make documentation more concise and clearer without introducing vagueness or misinterpretation.

**Optimization Goals** (in priority order):

1. **Eliminate vagueness**: Strengthen instructions with explicit criteria and measurable steps
2. **Increase conciseness**: Remove redundancy while preserving all necessary information
3. **Preserve clarity AND meaning**: Never sacrifice understanding or semantic accuracy for brevity

**Critical Constraint**: Instructions should only be updated if the new version retains BOTH the same
meaning AND the same clarity. If optimization reduces clarity or changes meaning, reject the change.

## Decision Rule: The Execution Test

Before removing ANY content:

1. **Can the agent execute the instruction correctly without this content?**
   - If NO: KEEP (execution-critical)
   - If YES: proceed
2. **Does this content explain WHY (rationale/educational)?**
   - If YES: REMOVE (not needed for execution)
   - If NO: KEEP (operational detail)
3. **Does this content show WHAT "correct" looks like (success criteria)?**
   - If YES: KEEP (execution-critical)
4. **Does this content extract a general decision rule from a specific example?**
   - If YES: KEEP (pattern extraction for future cases)

**Priority**: Correctness > Efficiency > Conciseness. Never sacrifice correctness for brevity.

## Execution

1. **Read** the specified document
2. **Analyze** each section using the execution test
3. **Optimize** directly: strengthen vague instructions, remove redundancy, apply conciseness strategies
4. **Report** changes made with before/after summaries
