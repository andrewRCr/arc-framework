# Roadmap: ARC Framework Development

**Purpose:** Internal planning artifact documenting sequencing strategy for framework development.
Subject to change as we learn.

**Last Updated:** 2025-12-26

---

## Current Sequencing Strategy

### Phase A: CineXplorer Sync Completion (Current)

Complete the 2+ month sync from CineXplorer refinements.

1. ✅ **Infrastructure Sync** - Complete (2025-12-26)
   - .githooks, .claude infrastructure
   - Directory structure alignment

2. ✅ **Workflow Sync** - Complete (2025-12-26)
   - Core workflows (0-3) with underscore naming
   - Supplemental workflows

3. ✅ **Agent Files Sync** - Complete (2025-12-26)
   - ai-instructions → agent rename
   - De-instanced from CineXplorer

4. ✅ **Constitution Sync** - Complete (2025-12-26)
   - TECHNICAL-ARCHITECTURE → TECHNICAL-OVERVIEW
   - Strategy documents

5. 🔄 **Structural Alignment** - In Progress
   - Phase 7a: upcoming → backlog, ATOMIC-TASKS, archive structure
   - Phase 7b: Workflow generalization (remove CineXplorer-specific content)

6. ⏳ **Validation**
   - Phase 8: Review old tasks-enhance-docs-content-p1 for remaining work

### Phase B: Documentation Enhancement

After sync completion, enhance template content.

- Comprehensive template-first documents
- Battle-tested patterns from CineXplorer
- User-focused adoption documentation

### Phase C: Public Release

- Repository migration strategy execution
- Polish for public consumption
- Initial release

---

## Dependency Analysis

```
CineXplorer Sync ────► Documentation Enhancement
                       (can't enhance until synced)
Documentation ───────► Public Release
                       (can't release until polished)
```

---

## Related Documents

- Plan: `technical/plan-public-release-repository-strategy.md`
- Active work: `.arc-internal/active/CURRENT-SESSION.md`
- Constitution: `.arc-internal/reference/constitution/PROJECT-STATUS.md`
