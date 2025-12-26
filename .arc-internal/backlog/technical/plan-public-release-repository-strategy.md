# Public Release Repository Strategy

## Overview

Planning document for transitioning the ARC framework from development to public release using separate repository approach.

## Current State

**Repository**: `arc-agentic-dev-framework` (private development)

- Contains full `.arc-internal/` development workspace
- Uses `.example.md` naming in `.arc/` structure
- All development history and work context preserved
- Battle-tested through real project usage (CineXplorer)

## Future Public Release Strategy

### Repository Structure

**Development Repository** (private):

- **Name**: `arc-agentic-dev-framework-dev` (or `-internal`)
- **Purpose**: Ongoing framework development and improvements
- **Contains**: Full `.arc-internal/` workspace, development history, work context
- **Access**: Private, for framework development team

**Public Repository** (public):

- **Name**: `arc-agentic-dev-framework` ← **Keep current name**
- **Purpose**: Clean, user-facing framework for adoption
- **Contains**: Only `.arc/` structure, ready-to-use templates, documentation
- **Access**: Public, for framework users

### Migration Process

**When Ready for Public Release:**

1. **Rename Current Repository**:
   - GitHub: Rename `arc-agentic-dev-framework` → `arc-agentic-dev-framework-dev`
   - Update local remotes accordingly

2. **Create Clean Public Repository**:
   - New GitHub repo: `arc-agentic-dev-framework`
   - Push cleaned version without development artifacts

3. **Release Preparation**:
   - Remove entire `.arc-internal/` directory
   - Remove `.example` suffixes from all `.arc/` files
   - Polish documentation for public consumption
   - Create initial release tag

4. **Ongoing Development Workflow**:
   - Continue development in `-dev` repository
   - Periodic updates to public repository when ready
   - Release tags and user documentation from public repo

### User Experience Goals

**Simplicity**:

- Users discover: `github.com/andrewRCr/arc-agentic-dev-framework`
- No branch navigation required
- No confusing naming conventions
- Just copy `.arc/` directory and start using

**Professionalism**:

- Clean, polished framework presentation
- No development artifacts visible to users
- Clear adoption documentation and examples
- Battle-tested framework defaults included

## Prerequisites for Public Release

**Must be completed before migration:**

1. ✅ **Terminology Refactoring**: sub-prd → prd (COMPLETE)
2. 🔄 **Template System Consolidation**: Eliminate dual-template complexity (IN PROGRESS)
3. ⏳ **Framework Defaults Integration**: Include battle-tested rules from CineXplorer
4. ⏳ **Documentation Polish**: User-focused documentation throughout
5. ⏳ **Real-World Validation**: Ensure framework works seamlessly for adoption

## Long-Term Development Workflow

**Development Phase** (in `-dev` repo):

- Normal ARC framework development workflow
- Full `.arc-internal/` context maintained
- All development history preserved
- Feature development and improvements

**Release Updates** (to public repo):

- Periodic updates when significant improvements are ready
- Clean transfer of `.arc/` content without development artifacts
- Release notes and version tags
- User-focused communication

## Benefits of This Strategy

- ✅ **Clean user experience**: No development noise in public repo
- ✅ **Development context preserved**: Full work history maintained in `-dev` repo
- ✅ **Professional presentation**: Public repo shows polished framework only
- ✅ **Flexible timing**: Can develop privately until framework is truly ready
- ✅ **Simple adoption**: Users just copy `.arc/` directory, no complex navigation
- ✅ **Continued improvement**: Can enhance framework long-term without user confusion

## Timeline

**Phase 1** (Current): Complete framework development in current repo
**Phase 2** (After template consolidation): Prepare for public release
**Phase 3** (When ready): Execute repository migration strategy
**Phase 4** (Ongoing): Maintain dual-repo workflow for continued development

This strategy ensures the public framework maintains professional quality while preserving valuable
development context for ongoing improvements.
