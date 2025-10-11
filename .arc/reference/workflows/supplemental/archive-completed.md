# Workflow: Archive Completed Features

Move completed feature documentation to a structured archive to keep the active workspace clean while
preserving history and context.

## Preconditions

- All subtasks in the feature’s task list are marked [x]; parent tasks are [x]
- PROJECT-STATUS reflects completion in “Completed Work”
- All related code is merged and quality gates are passing
- Feature functions as expected in the development environment

## Steps

### 1) Verify Completion

- Confirm task list status (all subtasks and parent task [x])
- Confirm PROJECT-STATUS includes the feature under “Completed Work”
- Confirm tests/lint/type checks are green

### 2) Move PRD to Archive

- Move PRD from `_docs/prds/` to `_docs/archive/prds/`
- Create completion metadata file in `_docs/archive/completion-metadata/` named `completion-{feature}.md`
- Include in completion metadata:
  - Completion date and final commit hash
  - Brief completion summary
  - Links to key implementation commits
  - Feature overview and capabilities

### 3) Move Task List (optional)

- If you keep archived task lists, move `tasks-{feature}.md` to `_docs/archive/tasks/`
- Otherwise, reference the active task list from the completion metadata

### 4) Update PROJECT-STATUS

- Ensure the feature is listed in “Completed Work” with any relevant notes
- Remove it from “Work in Progress”
- Update cross-references if needed

### 5) Archive Index and README

- Ensure `_docs/archive/README.md` explains archive organization and navigation
- Maintain or regenerate an index of archived features and completion dates (optional)

### 6) Commit (Atomic)

- Group all archive-related moves and metadata additions as a single atomic docs commit
- Example (adjust for your VCS conventions):
  - Commit header: `docs(archive): archive {feature} documentation`
  - Bullets:
    - Move PRD and tasks to structured archive
    - Add completion metadata and summary
    - Update PROJECT-STATUS references

## Notes

### Archive Organization Principles

- Preserve development history (PRDs, tasks, completion metadata)
- Keep active directories focused on in-flight work
- Ensure archived content remains discoverable

### Suggested Archive Structure

```
_docs/archive/
├── README.md
├── prds/                         # Archived PRDs
├── tasks/                          # Archived task lists (optional)
└── completion-metadata/            # Completion summaries
```

### Benefits

- Professional documentation hygiene
- Faster navigation for active work
- Searchable record of completed features
- Clear story from planning → implementation → completion
