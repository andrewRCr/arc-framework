# {{PROJECT_NAME}} Meta Product Requirements Document (META-PRD)

The META-PRD is the product vision document — the single source of truth for what your project
is, what it does, and what success looks like. Work-level PRDs (created via the PRD workflow)
reference this for context.

## 1. Purpose

What your project does, who it's for, and why it exists. Include key external dependencies
or integrations that shape the project's scope.

## 2. Core Features

Organize features into logical groups. Each group represents a distinct capability area.
List specific features as bullet points within each group.

### [FEATURE_GROUP_1]

- [FEATURE]
- [FEATURE]

### [FEATURE_GROUP_2]

- [FEATURE]
- [FEATURE]

<!-- Add feature groups as needed. Aim for 3-6 groups covering your project's core
     functionality. Each feature should be concrete enough to eventually become a
     task list or work-level PRD. -->

## 3. Out-of-Scope Features

Explicitly list what your project will NOT do. This prevents scope creep and gives clear
boundaries to anyone working on the project. Include deferred features and stretch goals.

- [OUT_OF_SCOPE_ITEM]
- [OUT_OF_SCOPE_ITEM]

## 4. User Flow (Target)

Describe the primary user journey through your project in narrative form. This helps
contributors understand the intended experience and make contextual implementation decisions.

[USER_FLOW_NARRATIVE]

<!-- For non-UI projects (libraries, CLIs, data pipelines), describe the primary usage
     pattern instead: how someone integrates, configures, and uses your project. -->

## 5. Success Metrics

How you'll measure whether the project is achieving its goals. Metrics should be specific
enough to evaluate but don't need concrete targets at this stage.

- **[METRIC_CATEGORY]**: [METRIC_DESCRIPTION]
- **[METRIC_CATEGORY]**: [METRIC_DESCRIPTION]
- **[METRIC_CATEGORY]**: [METRIC_DESCRIPTION]

## 6. Technical Requirements

Cross-cutting quality attributes that apply across all features. These inform architectural
decisions and quality gate configuration.

- **Performance**: [PERFORMANCE_REQUIREMENTS]
- **Reliability**: [RELIABILITY_REQUIREMENTS]
- **Security**: [SECURITY_REQUIREMENTS]

<!-- Adjust categories to your project's priorities. A CLI tool might emphasize performance
     and error handling; a web app might emphasize accessibility and security; a library
     might emphasize API stability and backward compatibility. -->

## 7. Data Sources

External data dependencies your project relies on. Understanding these informs decisions
about caching, error handling, and integration patterns.

- **[DATA_SOURCE]**: [DATA_SOURCE_DESCRIPTION]
- **[DATA_SOURCE]**: [DATA_SOURCE_DESCRIPTION]

<!-- If your project has no external data dependencies, remove or repurpose this section. -->
