# Research: Development Methodologies Landscape

**Date:** 2026-02-23\
**Purpose:** Comprehensive inventory of software development methodologies in professional
use today, to inform how ARC framework integrates with established team workflows.\
**Scope:** Adoption rates, key constructs, team size suitability, current prevalence\
**Critical Goal:** Identify integration patterns and avoid missing commonly-used methodologies

---

## Executive Summary

The professional development landscape is dominated by **Agile/Scrum-family methodologies**, with 97% adoption among
surveyed organizations. However, "Agile" masks significant variation: pure Scrum (87% of Agile teams), Kanban (56%),
Scrumban (27%), and SAFe at scale (44% of large enterprises) represent different ceremony/artifact patterns. Traditional
Waterfall remains significant in regulated/sequential contexts (~44% of mixed portfolio approaches). Emerging patterns
show **hybrid approaches growing fastest**, ceremony fatigue driving streamlining, **AI-assisted development reshaping
estimation/velocity metrics**, and **integration patterns favoring lightweight overlays** (documentation-as-workflow,
not documentation-as-process).

**Critical finding for ARC integration:** Teams operate across a spectrum from heavily ritualized (SAFe, RUP) to
lightweight/ad-hoc (Shape Up, no-methodology). One-size-fits-all frameworks fail; successful overlays are
**non-prescriptive, composable, and work alongside existing ceremonies**, not replacing them.

---

## 1. COMPREHENSIVE METHODOLOGY INVENTORY

### AGILE FAMILY (97% organizations, 95%+ software teams)

#### **Scrum** — [Widely Adopted, Stable to Growing]

- **Description:** Time-boxed iterative delivery with defined ceremonies (daily standup, sprint planning, sprint review,
  retrospective), roles (Product Owner, Scrum Master, dev team), and artifacts (backlog, sprint backlog, increments).
- **Key Constructs:** Sprints (1-4 weeks, typically 2), user stories, story points (or t-shirt sizes), velocity
  tracking, burndown charts, Definition of Done.
- **Prevalence:** 87% of Agile teams (State of Agile 2025); 78% would recommend; 63% use Team Scrum at team level.
- **Team Size Sweet Spot:** 5-9 people per team (scales to larger orgs via Scrum-of-Scrums)
- **Trend:** Stable dominant framework; hybrid/customized variants more common than pure Scrum.
- **Enterprise Maturity:** High (established patterns, certified practitioners, tooling mature)

#### **Scrum Variants & Scale Frameworks**

- **Scrum@Scale:** Connects team-level Scrums via Scrum of Scrums; similar adoption to base Scrum but as organizational
  approach
- **LeSS (Large-Scale Scrum):** Leaner alternative to SAFe; smaller adoption footprint but used in larger orgs
  preferring lighter coordination
- **Nexus:** Scrum.org's scaling framework; minimal market adoption (< 5%)

#### **Kanban** — [Widely Adopted, Growing]

- **Description:** Continuous flow model with visual management (physical or digital boards), WIP (work-in-progress)
  limits, and pull-based work assignment. No fixed ceremonies; focus on throughput, cycle time, and bottleneck
  visibility.
- **Key Constructs:** Kanban board (visualizes workflow stages), WIP limits per column, cycle time metrics, throughput,
  cumulative flow diagrams, Service Level Expectations (SLE) instead of sprints.
- **Prevalence:** 56% of Agile teams; 76% of Kanban users report it as "more effective" than other methodologies; 48% of
  software dev teams use Kanban; 71% of U.S. enterprises use Kanban tools (broader than pure development).
- **Team Size Sweet Spot:** Works well for 4-12 person teams; scales to large via portfolio Kanban but requires stronger
  discipline.
- **Trend:** Growing in adoption; often combined with Scrum (Scrumban) rather than pure.
- **Enterprise Maturity:** Mature; market for Kanban tools substantial ($321M in 2025, projected $1.5B by 2034).

#### **Scrumban (Scrum + Kanban Hybrid)** — [Moderately Adopted, Growing]

- **Description:** Combines time-boxed planning (Scrum) with continuous flow (Kanban). Fixed-length iterations for
  planning/commitment, but work pulled continuously within the iteration.
- **Key Constructs:** Sprint-like planning phase + Kanban board with WIP limits; stories + continuous flow; some
  ceremonies (planning, retro) but lighter standups.
- **Prevalence:** 27% of teams report using Scrumban; hybrid approaches show growth from 20% (2020) to 31.5% (2023)
  adoption; 73% success rate for hybrid approaches vs. single methodology.
- **Team Size Sweet Spot:** 6-12 people; excellent for mixed workload teams (features + maintenance + unplanned).
- **Trend:** Fastest-growing hybrid; increasingly seen as "Scrum done right in reality" rather than deviation.
- **Enterprise Maturity:** Rising; moving from niche to mainstream.

#### **Extreme Programming (XP)** — [Niche, Stable to Declining]

- **Description:** Disciplined engineering practices overlaid on Agile: test-driven development (TDD), pair programming,
  continuous integration, simple design, refactoring, collective code ownership, sustainable pace.
- **Key Constructs:** Pair programming ceremonies, automated testing (unit + integration), frequent commits, continuous
  integration/deployment, user stories, releases every 1-3 weeks.
- **Prevalence:** 20% of Agile teams use XP (as of 2023); 13% use "Scrum/XP Hybrid" variants; adoption declining as
  TDD/CI practices are adopted without full XP discipline.
- **Team Size Sweet Spot:** 2-12 people (requires high collaboration); small, high-trust teams.
- **Trend:** Core practices (TDD, CI, pair programming) adopted widely; full methodology adoption niche (< 5% pure XP).
- **Enterprise Maturity:** Mature frameworks for small teams; tools support strong.

#### **SAFe (Scaled Agile Framework)** — [Moderately Adopted at Enterprise Scale]

- **Description:** Hierarchical Agile scaling framework with Program Increment (PI) planning cycles (8 weeks), portfolio
  governance, DevOps pipeline, and explicit integration points. Prescriptive roles, cadence, and ceremonies.
- **Key Constructs:** PI Planning (every 8 weeks), Program Board (portfolio view), Release Train Engineer, Scrum Masters
  at multiple levels, Lean Portfolio Management, SAFe metrics (velocity, PI Predictability, CFD).
- **Prevalence:**
    - 70% of Fortune 100 companies claim SAFe adoption
    - 44% of large organizations use SAFe (often mixed with other approaches)
    - Growth trend: 37% (2021) → 44-53% (2025) projected
    - Most common "scaled agile" choice at 30% of scaling orgs
- **Team Size Sweet Spot:** 50+ person scale; minimum viable for less than 30 people is overhead-heavy.
- **Trend:** Growing but contentious; high-touch implementation, ceremony-heavy; driving "ceremony fatigue" reactions.
- **Enterprise Maturity:** Highest certifications/training market; most invested in by enterprises; criticism for
  rigidity.

#### **Crystal Methods** — [Niche, Stable]

- **Description:** Family of methodologies (Crystal Clear, Yellow, Orange, Red) scaling difficulty based on team size
  and project risk. People-first, lightweight, tailored to context.
- **Key Constructs:** Oscillating work cycles, reflective improvement workshops, information radiators, user
  involvement, frequent releases.
- **Prevalence:** < 2% explicit adoption; more as "inspiration" for lightweight agile teams. Crystal Clear (6-8 person,
  low criticality) most referenced.
- **Team Size Sweet Spot:** 6-8 (Clear); scales up with color variants, but rarely implemented formally at scale.
- **Trend:** Declining as Scrum standardized on lightweight; principles absorbed into broader Agile culture.
- **Enterprise Maturity:** Historic; not widely supported by modern tooling.

#### **DSDM (Dynamic Systems Development Method)** — [Niche, Stable]

- **Description:** Iterative project delivery framework with fixed cost/quality/time at outset; uses MoSCoW
  prioritization (Must, Should, Could, Won't) to adjust scope. Includes business analyst and configuration management
  roles.
- **Key Constructs:** Timeboxed iterations, MoSCoW priority matrix, Fixed Time-Boxed Delivery, Business Analyst role,
  Integrated Testing.
- **Prevalence:** < 2% as primary framework; more adoption in UK/Europe than North America. Recognized as "agile with
  more structure" for regulated domains.
- **Team Size Sweet Spot:** 8-20 people; best for fixed-deadline, variable-scope contexts.
- **Trend:** Stable niche; not declining but not growing; DSDM Consortium maintains standards but limited market
  mindshare vs. Scrum/Kanban.
- **Enterprise Maturity:** Mature for practitioners; limited tooling integration vs. Scrum.

#### **Feature-Driven Development (FDD)** — [Niche, Stable]

- **Description:** Model-driven iterative approach with feature-centric organization. Two-week cycles, five activities
  (develop domain model, build feature list, plan by feature, design, build). Six formal roles (Chief Architect, Chief
  Programmer, etc.).
- **Key Constructs:** Features (expressed as "Action + Result + Object"), feature lists by domain, class owners,
  two-week iterations, Feature Team model.
- **Prevalence:** < 2% as primary choice; more common in financial services, government, manufacturing (requires
  model-driven culture).
- **Team Size Sweet Spot:** 15-50 developers; smaller teams find process overhead excessive; larger teams need
  coordination structure FDD provides.
- **Trend:** Stable niche; more adoption discussion/interest recent years, but low market penetration. Less established
  in tooling than Scrum.
- **Enterprise Maturity:** Mature framework; used successfully in large financial/gov projects.

---

### PLAN-DRIVEN / TRADITIONAL (44% mixed adoption, declining)

#### **Waterfall** — [Moderately Adopted in Specific Contexts, Declining Overall]

- **Description:** Sequential phase model: Requirements → Design → Implementation → Testing → Deployment → Maintenance.
  Each phase completes before next begins.
- **Key Constructs:** Requirements document, design specifications, test plans, phased delivery, change control board,
  upfront estimation.
- **Prevalence:**
    - Pure Waterfall: 44% of mixed portfolios (2025, down from 58% in 2020)
    - Remains significant in regulated/sequential domains: aerospace, defense, safety-critical systems
    - Used in parallel with Agile in same organization: 35-40% use hybrid approaches
- **Team Size Sweet Spot:** Works for any size; overhead/ceremony overhead actually lower for small teams than Scrum.
- **Trend:** Declining in general software; persistent in regulated/sequential contexts; hybrid approaches (Waterfall +
  Agile elements) growing.
- **Enterprise Maturity:** Mature; declining tooling innovation, but established patterns well-known.

#### **V-Model** — [Niche, Stable]

- **Description:** Extends Waterfall with verification testing at each development level. Requirements level matched to
  acceptance test level; design levels to module/system test levels.
- **Key Constructs:** V-diagram structure, test-level pairing, requirement traceability, formal testing phases.
- **Prevalence:** < 2% as primary methodology; more as test strategy within Waterfall or Agile (testing at every level).
- **Team Size Sweet Spot:** 15+ people; primarily used in large, regulated projects.
- **Trend:** Stable niche; testing discipline increasingly borrowed by Agile frameworks.
- **Enterprise Maturity:** Established in aerospace/defense; limited adoption elsewhere.

#### **Spiral Model** — [Niche, Stable]

- **Description:** Risk-driven iterative model with cycles of Planning → Risk Analysis → Development → Evaluation.
  Combines Waterfall structure with iterative risk management.
- **Key Constructs:** Risk assessment phase, prototyping, formal reviews, cumulative deliverables.
- **Prevalence:** < 1% as primary choice; concepts (risk-driven iteration) absorbed into modern Agile.
- **Team Size Sweet Spot:** Large projects (100+ person); rarely used now.
- **Trend:** Historical; superseded by Agile + risk frameworks.
- **Enterprise Maturity:** Conceptually mature; minimal modern implementation.

#### **RUP (Rational Unified Process)** — [Declining from Historical Use, Niche]

- **Description:** Iterative process framework from IBM/Rational Software. Four phases (Inception, Elaboration,
  Construction, Transition) with parallel iterations of design, implementation, testing. Heavyweight: role-based,
  artifact-intensive.
- **Key Constructs:** Use cases, component architecture, iterative cycles within phases, multiple formal reviews,
  configuration management.
- **Prevalence:** < 2% as primary methodology; higher historical adoption (peak ~2010); declining as organizations
  adopted Scrum instead.
- **Team Size Sweet Spot:** 30-200 person organizations; designed for large, complex projects.
- **Trend:** Declining; superseded by SAFe (scaled Agile) and Agile frameworks. OpenUP (lightweight variant) attempted
  revival; minimal uptake.
- **Enterprise Maturity:** Mature methodologically; tooling and practitioner base shrinking.

---

### LEAN AND FLOW-BASED (5-10% explicit adoption, higher in principles)

#### **Lean Software Development** — [Moderately Adopted as Principles, Growing]

- **Description:** Applies Lean manufacturing principles (eliminate waste, amplify learning, deliver fast, empower team,
  build quality in, optimize whole) to software. Focus on value delivery, waste elimination, minimal work in progress.
- **Key Constructs:** Value Stream Mapping, Kanban (work visualization), WIP limits, Just-In-Time delivery, continuous
  improvement.
- **Prevalence:**
    - Explicit methodology: < 5% primary choice
    - Principles widely adopted: 40-60% of Agile teams use Lean concepts (Kanban, value focus, waste elimination)
    - Companies like Tesla, Nike, Intel explicitly cited as Lean practitioners
    - Complements rather than competes with Scrum/Kanban (often layered on top)
- **Team Size Sweet Spot:** Scales from small (5 person) to enterprise; principles adaptable.
- **Trend:** Growing not as standalone methodology but as overlay on Agile. "Lean Agile" becoming standard terminology.
- **Enterprise Maturity:** Mature principles; lightweight implementation frameworks.

#### **Theory of Constraints (ToC) / Flow-Based** — [Niche, Growing in DevOps]

- **Description:** Goldratt's approach: identify system bottleneck, focus improvement there, subordinate other
  processes. Applied to software: identify deployment/testing/approval bottlenecks; optimize those first.
- **Key Constructs:** Constraint identification, throughput accounting, continuous improvement focused on constraint.
- **Prevalence:**
    - < 2% as primary methodology
    - Growing in DevOps/SRE contexts; integrated into CI/CD thinking
    - Concepts influence "flow" metrics in Kanban
- **Team Size Sweet Spot:** Any size; most value at 20-500 person organizations with complex dependencies.
- **Trend:** Growing in DevOps communities; often implicit in flow optimization work.
- **Enterprise Maturity:** Mature theory; practical implementation frameworks emerging.

#### **Value Stream Mapping** — [Moderately Adopted as Diagnostic]

- **Description:** Lean technique to visualize workflow end-to-end, identify waste, plan improvements. Often one-time
  exercise rather than continuous methodology.
- **Key Constructs:** Current state map, future state map, implementation plan, waste identification.
- **Prevalence:** 15-25% of organizations use VSM as improvement exercise; usually as project-based activity, not
  continuous methodology.
- **Team Size Sweet Spot:** 10-50 person teams; works for analysis across larger orgs.
- **Trend:** Stable; used as diagnostic tool within Agile/Lean transformations.
- **Enterprise Maturity:** Mature; training and consulting available.

---

### MODERN / HYBRID / EMERGING (5-20% adoption, growing)

#### **Shape Up (Basecamp)** — [Niche, Growing/Emerging]

- **Description:** Time-boxed iterative delivery with lightweight upfront "shaping." Six-week cycles with fixed
  scope/timeline; small cross-functional teams ("Shapers" define problem, "Builders" implement). No Agile ceremonies
  (standup, sprint planning, retro).
- **Key Constructs:** Six-week cycles, Pitching phase, Betting (leadership chooses pitches), Shaped work (defined
  scope/constraints), team autonomy.
- **Prevalence:**
    - Explicitly adopted by Basecamp, GitHub, Shopify, Figma, and growing cohort of product-focused companies
    - < 2% of teams but growing: "post-Scrum" appeal for organizations tired of ceremony overhead
    - Dedicated community and book sales indicate uptake
- **Team Size Sweet Spot:** 5-50 person teams; designed for autonomous team model; works well for distributed teams.
- **Trend:** Emerging and growing, especially in startup/product-focused organizations. Reaction against Scrum ceremony
  complexity.
- **Enterprise Maturity:** Emerging; limited tooling, but adoption increasing among influential product companies.

#### **Dual-Track Agile** — [Moderately Adopted, Growing]

- **Description:** Parallel discovery and delivery "tracks." Discovery track: continuous user research, testing,
  learning (weekly touchpoints). Delivery track: traditional Agile development of validated ideas. Runs concurrently
  rather than sequentially.
- **Key Constructs:** Two parallel team tracks (or overlapping responsibilities), Discovery ceremonies (user interviews,
  testing), Delivery ceremonies (Scrum/Kanban), Product trio (PM, Designer, Engineer) leading discovery.
- **Prevalence:**
    - Growing adoption among product-focused organizations; ~10-15% of organizations with dedicated discovery roles
    - Popularized by Teresa Torres (Continuous Discovery Habits), Jeff Patton, Silicon Valley Product Group
    - Often implicit in modern product teams even if not named "Dual-Track"
- **Team Size Sweet Spot:** 8-50 person product teams; requires product discipline.
- **Trend:** Growing; seen as evolution of Agile to include product validation.
- **Enterprise Maturity:** Emerging best-practice; coaching/consulting available; tooling support growing.

#### **Continuous Discovery** — [Moderately Adopted, Growing]

- **Description:** Weekly user research practices integrated into Agile workflow. Product trio (PM, Designer, Eng)
  conduct customer interviews, test assumptions, validate ideas continuously rather than big upfront discovery or
  "discovery sprint."
- **Key Constructs:** Weekly customer touchpoints, assumption testing, rapid iteration, cross-functional involvement.
- **Prevalence:**
    - Growing rapidly; 40-50% of modern product teams claim continuous discovery practices
    - Often layered on Scrum/Kanban rather than standalone
    - Responds to "building wrong product" problem that Agile doesn't solve
- **Team Size Sweet Spot:** 5-20 person product teams.
- **Trend:** Fastest-growing overlay to Agile in product teams.
- **Enterprise Maturity:** Emerging; practices documented but tooling immature.

#### **DevOps (as Methodology, not Just Tooling)** — [Widely Adopted as Practice, Growing as Methodology]

- **Description:** Cultural movement emphasizing development + operations collaboration, automation, and continuous
  delivery. Includes practices: continuous integration (CI), continuous deployment (CD), infrastructure-as-code,
  monitoring/observability, blameless postmortems.
- **Key Constructs:** CI/CD pipelines, automated testing, infrastructure automation, observability (metrics, logs,
  traces), on-call rotations, deployment frequency metrics, mean time to recovery (MTTR).
- **Prevalence:**
    - 95%+ of organizations claim "DevOps" adoption in some form
    - 71% use Docker; 43% use AWS; continuous deployment/integration mainstream
    - Enterprise DevOps adoption at 70%+ but often inconsistent implementation
    - Not a single methodology but set of principles/practices adopted across Agile/Waterfall/Hybrid teams
- **Team Size Sweet Spot:** Any size; more overhead on small teams.
- **Trend:** Accelerating adoption; shifting from "DevOps team" to "engineering teams practice DevOps."
- **Enterprise Maturity:** Mature; extensive tooling, widespread skills.

#### **SRE (Site Reliability Engineering)** — [Moderately Adopted, Growing]

- **Description:** Operational methodology from Google: apply engineering discipline to infrastructure reliability.
  Focus on SLO/SLI metrics, error budgets, automation, chaos engineering. Combines development skills with operational
  focus.
- **Key Constructs:** Service Level Objectives (SLOs), Service Level Indicators (SLIs), error budgets, on-call burden
  metrics, automation-first mentality, chaos engineering, observability.
- **Prevalence:**
    - Explicit SRE teams: 15-20% of larger organizations (500+ people)
    - SRE practices: much higher; 60%+ of organizations have SLO/SLI frameworks
    - Growing role evolution: SREs moving from operations role to platform engineering/architecture
- **Team Size Sweet Spot:** Minimum 3-5 person SRE team for any organization; more common at 10-50 person scale.
- **Trend:** Rapidly growing; from niche (2017) to widespread (2025). Evolving to platform engineering/FinOps/SecOps
  variants.
- **Enterprise Maturity:** Emerging but maturing; certifications available, extensive tooling, community strong.

#### **Trunk-Based Development (TBD)** — [Moderately Adopted, Growing]

- **Description:** Source control branching practice where developers commit directly to main trunk (mainline) or via
  short-lived feature branches (< 1 day). Requires feature toggles and continuous testing. Emphasizes frequent
  integration and deployment.
- **Key Constructs:** Main/trunk branch, feature flags/toggles, short-lived branches, continuous testing, frequent
  deployments, high-performing teams deploy 182X more frequently (per DORA metrics).
- **Prevalence:**
    - Explicit practice: 30-40% of software teams
    - Strongly correlated with high-performing teams (DORA research): elite teams use TBD
    - Adopted by highly regulated industries (healthcare, finance, gambling) as well as startups
- **Team Size Sweet Spot:** 4-500+ people; scales across any size with discipline.
- **Trend:** Accelerating adoption; tied to DevOps/continuous deployment practices.
- **Enterprise Maturity:** Mature practice; tooling well-established.

#### **BDD / TDD as Methodology Overlays** — [Moderately Adopted, Growing]

- **Description:** Development practices rather than full methodologies, but often specified as methodology choice:
    - **TDD:** Write failing test → implement code → refactor. Tests drive design.
    - **BDD:** Behavior specifications in business language (Gherkin/Cucumber) → development → automation.
    - Often combined: BDD for acceptance criteria, TDD for unit/integration tests.
- **Key Constructs:** Test-first development, executable specifications, automated test suites, example-driven
  development.
- **Prevalence:**
    - TDD adoption: 40-50% of development teams practice TDD at some level (majority part-time)
    - BDD adoption: 20-30% of teams use BDD tools (Cucumber, SpecFlow, etc.)
    - 46% of teams automated over 50% of manual testing (2025)
    - IBM, Microsoft cite 90% fewer pre-release defects with TDD/BDD practices
- **Team Size Sweet Spot:** Any size; higher value in teams > 5 people.
- **Trend:** Accelerating adoption; AI tools (ChatGPT, Copilot) changing dynamics: edge cases where AI misses, tests
  becoming more critical.
- **Enterprise Maturity:** Mature practices; tooling strong; training widely available.

#### **OKR-Driven Development** — [Moderately Adopted, Growing]

- **Description:** Development planning driven by Objectives & Key Results (goals + metrics). Teams set quarterly OKRs;
  development work is then tracked as progress toward OKRs rather than traditional velocity/burndown.
- **Key Constructs:** Objectives (qualitative goals), Key Results (quantitative metrics), quarterly cycles, weekly
  check-ins, 60-70% completion target.
- **Prevalence:**
    - Explicit OKR-driven development: 15-25% of organizations, growing
    - Used by Google, Amazon, Intel, Microsoft, Twitter, Spotify
    - Often layered with Scrum (Scrum execution, OKR goal-setting) rather than replacing methodology
- **Team Size Sweet Spot:** 20-500 person organizations; minimum viable for smaller teams but overhead-heavy.
- **Trend:** Growing adoption, especially in tech/startups; increasingly integrated with Agile.
- **Enterprise Maturity:** Emerging; consulting services available, tools maturing.

#### **Impact Mapping** — [Niche, Growing]

- **Description:** Lightweight strategic planning tool where teams map business goals → personas → impacts →
  solutions/stories. More about alignment than execution methodology.
- **Key Constructs:** Goal → Actor → Impact → Delivery map, stakeholder alignment.
- **Prevalence:** < 2% as primary methodology; used by 5-10% of organizations as planning exercise with Agile delivery.
- **Team Size Sweet Spot:** Works for planning any size team; often used as one-time or quarterly exercise.
- **Trend:** Stable niche; some growth in product organizations.
- **Enterprise Maturity:** Mature framework; limited tooling; consulting available.

#### **No-Methodology / Ad-Hoc / Solo Developer Patterns** — [Non-negligible, Underreported]

- **Description:** Lack of formalized methodology; rely on tooling (GitHub/Jira/Trello) and informal practices. Common
  among:
    - Solo developers (freelance, contractors)
    - Very small teams (2-3 people)
    - Maintenance/legacy code teams
    - Open-source projects with distributed contributors
- **Prevalence:**
    - Solo/freelance developers: 15-20% of professional software developers
    - Small team ad-hoc: 20-30% of teams < 5 people report no formal methodology
    - Not captured in "Agile adoption" surveys (which bias toward team-based frameworks)
- **Team Size Sweet Spot:** 1-3 people.
- **Trend:** Stable; often dismissed by enterprise but significant segment of professional development.
- **Enterprise Maturity:** N/A; survival mode focus on delivery.

---

## 2. PREVALENCE DATA & ADOPTION TRENDS

### Overall Agile Adoption

- **97% of organizations** report using Agile development methods to some extent
- **95%+ of software teams** use Agile in some form (up from 64% in 2015)
- **Only 18%** of organizations implemented Agile for all teams; **77%** still have some non-Agile teams
- **Primary adoption rate by department:**
    - Software development: 86%
    - IT operations: 63%
    - Operations: 29%
    - Marketing: 17%
    - Security: 17%
    - HR: 16%
    - Sales: 11%
    - Finance: 10%
    - Hardware: 10%

### Methodology Breakdown (Within Agile-Adopting Teams)

| Methodology                         | Adoption                | Trend                | Notes                                      |
| ----------------------------------- | ----------------------- | -------------------- | ------------------------------------------ |
| **Scrum**                           | 87%                     | Stable dominant      | Team-level standard practice               |
| **Kanban**                          | 56%                     | Growing              | Often combined with Scrum                  |
| **Scrumban**                        | 27%                     | Growing fastest      | Hybrid, increasingly mainstream            |
| **XP**                              | 20% (Scrum/XP hybrid)   | Declining            | Core practices (TDD/CI) adopted separately |
| **Iterative**                       | 20%                     | Stable               | Generic "iterative" not framework-specific |
| **Lean**                            | 5% (explicit)           | Growing (principles) | Principles widely adopted; 40-60% of teams |
| **SAFe**                            | 44% (large orgs)        | Growing              | 30-44% among enterprises; 70% Fortune 100  |
| **FDD**                             | < 2% (explicit)         | Stable               | Niche in finance/gov                       |
| **DSDM**                            | < 2%                    | Stable               | Mostly UK/Europe adoption                  |
| **Crystal**                         | < 1%                    | Declining            | Principles absorbed into broader Agile     |
| **Waterfall**                       | 44% (mixed portfolios)  | Declining            | Stable in regulated/sequential contexts    |
| **RUP**                             | < 2%                    | Declining            | Superseded by Scrum/SAFe                   |
| **Shape Up**                        | < 2% (explicit)         | Growing              | Emerging from product-focused companies    |
| **Dual-Track/Continuous Discovery** | 10-15% (explicit)       | Growing              | Often implicit in product teams            |
| **DevOps**                          | 95% (claimed)           | Growing              | Practices widely adopted; inconsistent     |
| **SRE**                             | 15-20% (explicit teams) | Growing rapidly      | 60%+ have SLO/SLI frameworks               |
| **TDD/BDD**                         | 40-50% (partial)        | Growing with AI      | Edge cases, AI hallucinations driving need |
| **OKR-Driven**                      | 15-25%                  | Growing              | Tech/startup dominant                      |

### Regional/Industry Variation

- **Technology:** 27% of Agile adoption (largest industry)
- **Financial Services:** 18%
- **Professional Services:** 8%
- **Healthcare/Pharma:** 8%

- **North America:** Higher Scrum/SAFe prevalence
- **UK/Europe:** Higher DSDM/Lean prevalence
- **APAC:** Growing SAFe adoption; higher Kanban/Lean emphasis

### Hybrid Approaches (Fastest Growing)

- **2020:** 20% of teams used hybrid/homegrown approaches
- **2023:** 31.5% of teams
- **2025:** 35-40% of teams (projected)
- **Success rate:** Hybrid approaches achieve 73% success vs. 60% single-methodology

### Enterprise vs. Small Team Patterns

- **Enterprise (500+ people):** SAFe, RUP variants, formal frameworks (40-60% overhead)
- **Mid-market (50-500):** Scrum-of-Scrums, Kanban, Lean (20-30% overhead)
- **Small teams (5-20):** Pure Scrum, Kanban, Shape Up (10-15% overhead)
- **Solo/freelance:** Tooling-based (Jira/GitHub) + intuition (5% overhead)

---

## 3. KEY CONSTRUCTS MAPPING

### By Methodology Family

#### **Scrum & Variants**

| Construct              | Details                                                                                         | Frequency                |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------ |
| **Planning Artifacts** | Backlog (prioritized), Sprint Backlog (committed), Product Increment                            | Sprint-based (1-4 weeks) |
| **Estimation**         | Story Points (Fibonacci), T-shirt Sizes, or Ideal Hours                                         | Per backlog item         |
| **Ceremonies**         | Sprint Planning (4 hrs), Daily Standup (15 min), Sprint Review (2 hrs), Retrospective (1.5 hrs) | Sprint-bound             |
| **Tracking**           | Velocity (points/sprint), Burndown chart, Cumulative Flow Diagram                               | Sprint-bound reporting   |
| **Roles**              | Product Owner, Scrum Master, Dev Team                                                           | Fixed/continuous         |
| **Definition of Done** | Explicit acceptance criteria per team                                                           | Sprint-bound             |

#### **Kanban & Variants**

| Construct                   | Details                                                                                       | Frequency                 |
| --------------------------- | --------------------------------------------------------------------------------------------- | ------------------------- |
| **Planning Artifacts**      | Backlog (prioritized), Kanban board (visual workflow), Work items                             | Continuous                |
| **Estimation**              | None (flow-based), optional: Cycle Time, Throughput                                           | Per item, not aggregated  |
| **Ceremonies**              | Standup (optional, often async), Commitment point ceremony, Delivery ceremony                 | Continuous or weekly      |
| **Tracking**                | Cycle time, Throughput, WIP metrics, Cumulative Flow Diagram, Service Level Expectation (SLE) | Continuous/rolling window |
| **Roles**                   | Team coordinator (no Scrum Master), optional Product Owner                                    | Continuous                |
| **Work-In-Progress Limits** | Per column (explicit constraint)                                                              | Enforced                  |
| **Definition of Done**      | Per workflow column (Definition of Done, Definition of Accepted, etc.)                        | Per stage                 |

#### **Scrumban**

| Construct              | Details                                                                                   | Frequency                 |
| ---------------------- | ----------------------------------------------------------------------------------------- | ------------------------- |
| **Planning Artifacts** | Backlog, Sprint Backlog, Kanban board within sprint                                       | Sprint-bound              |
| **Estimation**         | Story points for planned work; throughput metrics for unplanned                           | Sprint-bound planning     |
| **Ceremonies**         | Sprint Planning, Daily Standup, Sprint Review/Retro (lighter); Kanban commitment ceremony | Sprint-bound + continuous |
| **Tracking**           | Velocity + Cycle Time, Burndown + CFD                                                     | Dual tracking             |
| **Roles**              | Scrum Master, Product Owner (lighter), Dev Team                                           | Sprint-bound              |
| **WIP Limits**         | Per column; managed within sprint                                                         | Enforced                  |

#### **SAFe**

| Construct              | Details                                                                                                                                | Frequency                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Planning Artifacts** | Agile Release Train (ART) backlog, Program Increment (PI) plan, Feature list                                                           | Every 8-10 weeks (PI)          |
| **Estimation**         | Story points (team level), Capacity-based planning (train level)                                                                       | Per PI                         |
| **Ceremonies**         | PI Planning (2 days), Daily Standup, Sprint Planning/Review (Scrum teams), PI Review (train level), Inspect & Adapt (retro equivalent) | Every PI; weekly at team level |
| **Tracking**           | Velocity (team), PI Predictability (train), Release Train metrics, Portfolio-level metrics                                             | Per PI + weekly                |
| **Roles**              | Scrum Master, Product Owner, Release Train Engineer, Solution Architect, Portfolio Manager, SAFe Program Consultant                    | Hierarchical                   |
| **Definition of Done** | Per team + train + portfolio levels                                                                                                    | Multi-level                    |

#### **Lean / Flow-Based**

| Construct              | Details                                                                          | Frequency                                    |
| ---------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| **Planning Artifacts** | Value Stream Map (diagnostic), Backlog (continuous), Feature list                | Quarterly VSM exercise; continuous execution |
| **Estimation**         | Cycle time focus, not effort; Just-In-Time estimation                            | Per item, lightweight                        |
| **Ceremonies**         | Continuous improvement workshops (quarterly), optional standups                  | Quarterly + ad-hoc                           |
| **Tracking**           | WIP metrics, Cycle time, Throughput, Waste elimination metrics                   | Continuous                                   |
| **Roles**              | Process owner, team members (empowered)                                          | Continuous                                   |
| **Waste Focus**        | Identify/eliminate: delays, handoffs, rework, context switching, unused features | Ongoing                                      |

#### **Shape Up**

| Construct              | Details                                                                                    | Frequency     |
| ---------------------- | ------------------------------------------------------------------------------------------ | ------------- |
| **Planning Artifacts** | Shaped projects (defined scope/constraints), Pitch documents, Betting table outcomes       | Every 6 weeks |
| **Estimation**         | 6-week fixed timebox; no story points                                                      | Per cycle     |
| **Ceremonies**         | Betting table (leadership chooses pitches), optionally: kickoff, no standup/retro/planning | Every 6 weeks |
| **Tracking**           | Scope adherence, cycle completion rate, team morale/autonomy                               | Per cycle     |
| **Roles**              | Shapers (define), Builders (execute), deciders (bet)                                       | Fixed         |
| **Definition of Done** | Feature shipped and working; shaped projects don't carry over                              | Cycle-bound   |

#### **Dual-Track Agile**

| Construct              | Details                                                                                           | Frequency                               |
| ---------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Planning Artifacts** | Discovery backlog (interview insights, test results), Delivery backlog (validated features)       | Weekly discovery; sprint-bound delivery |
| **Estimation**         | Validation/learning metrics (discovery); Story points (delivery)                                  | Weekly (discovery); sprint-bound        |
| **Ceremonies**         | Discovery rituals (customer interviews), Delivery Scrum/Kanban ceremonies, Product trio alignment | Weekly discovery; sprint-bound delivery |
| **Tracking**           | Learning velocity (discovery), Development velocity (delivery), separate CFDs                     | Weekly + sprint-bound                   |
| **Roles**              | Product Manager, Designer, Engineer (product trio); separate discovery/delivery teams possible    | Continuous                              |
| **Definition of Done** | Validated learning (discovery); Shipped feature (delivery)                                        | Per track                               |

#### **DevOps**

| Construct                     | Details                                                                               | Frequency        |
| ----------------------------- | ------------------------------------------------------------------------------------- | ---------------- |
| **Planning Artifacts**        | CI/CD pipeline definition, Infrastructure-as-code, Release notes                      | Continuous       |
| **Estimation**                | Deployment frequency, MTTR (mean time to recovery), Change failure rate               | Per deployment   |
| **Ceremonies**                | On-call handoff, incident postmortems (blameless), deployment readiness reviews       | As-needed        |
| **Tracking**                  | Deployment frequency, Lead time for changes, MTTR, Change failure rate (DORA metrics) | Continuous       |
| **Roles**                     | Engineer (dev + ops skills), SRE, Platform Engineer, Deployment lead                  | Cross-functional |
| **Infrastructure Management** | Infrastructure-as-code, GitOps, self-service deployments                              | Continuous       |

#### **SRE**

| Construct              | Details                                                                                   | Frequency                             |
| ---------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| **Planning Artifacts** | SLO targets, Error budget allocation, Runbooks, Incident response procedures              | Quarterly SLO review                  |
| **Estimation**         | Toil reduction targets, SLO achievement targets                                           | Quarterly                             |
| **Ceremonies**         | On-call rotations, Incident postmortems, SLO review meetings, Chaos engineering exercises | Continuous rotation; monthly+ reviews |
| **Tracking**           | SLI achievement vs. SLO target, Error budget burn rate, Toil reduction, MTTR              | Real-time + weekly                    |
| **Roles**              | SRE (embedded in product team or separate), SRE Manager, Platform Engineer                | Continuous                            |
| **Service Definition** | Explicit SLOs for all production services                                                 | Continuous                            |

---

## 4. INTEGRATION PATTERNS & FRAMEWORK OVERLAYS

### How Structured Documentation/Planning Frameworks Layer on Agile

#### **Pattern 1: Lightweight Specification Overlay (Working)**

Examples: AGENTS.md, .cursorrules, Spec-Driven Development

- **What works:** Frameworks that enhance Agile without replacing ceremonies
    - Live in repo, consulted by team/AI at every cycle
    - Integrate with existing artifact flow (user story → spec → implementation)
    - Minimal ceremony overhead (no new meetings required)
    - Non-prescriptive about methodology choice (compatible with Scrum/Kanban/Shape Up)

- **Why it works:**
    - Respects "working software over comprehensive documentation" principle
    - Reduces ambiguity at point of implementation (saves rework)
    - Integrates with existing tools (GitHub, VSCode, Cursor)
    - Does not compete with product backlog/sprint planning

#### **Pattern 2: Documentation as Workflow (Emerging)**

Examples: ARC framework, GitHub Agentic Workflows

- **What works:**
    - Documentation structures that define task flow/approval gates
    - Repository-based, human-readable format (Markdown)
    - Explicitly define transition points (when can next phase start)
    - Composable with existing methodology (not "replace Scrum with ARC")

- **Why it works:**
    - Creates institutional memory across sessions/team changes
    - Approval gates reduce rework and alignment issues
    - Non-invasive: can adopt parts without full commitment
    - Works with any underlying methodology (Agile/Waterfall/Hybrid)

- **Common failure modes:**
    - **Over-specification:** Feels like bureaucracy to teams used to lightweight Agile
    - **Ceremony duplication:** Creates new meetings that duplicate Agile ceremonies
    - **Tooling friction:** Requires context-switching if not integrated with existing tools

#### **Pattern 3: Heavyweight Overlay (Often Failing)**

Examples: Traditional ITIL, formal governance frameworks, legacy CMMI

- **What fails:**
    - Frameworks that prescribe additional ceremonies (on top of Scrum ceremonies)
    - Separate "documentation team" or "governance team"
    - Focus on "comprehensive documentation" instead of "right-sized documentation"
    - Treat Agile as constraint rather than base practice

- **Why it fails:**
    - Ceremony fatigue: adds 5-10 hours/week overhead on teams already doing Scrum
    - Duplicate work: e.g., sprint planning + "governance planning," standup + "status reporting"
    - Misalignment: governance documents become stale while Agile artifacts stay current
    - Team resentment: seen as "audit culture," not value-add

#### **Pattern 4: Methodology-Specific Overlays (Context-Dependent)**

Examples: SAFe metrics on top of Scrum, SRE practices on DevOps, Lean Value Stream Mapping

- **What works at scale:**
    - Frameworks that extend existing methodology rather than compete
    - Added constructs (metrics, roles, ceremonies) improve specific problem (e.g., "how do we scale?")
    - Integration with existing tools/workflows (velocity tracking → SAFe PI Predictability)

- **What works for product teams:**
    - Dual-Track Agile extends Scrum with discovery track (solves "building wrong thing" problem)
    - OKR-driven development aligns Scrum sprints to business goals
    - Continuous Discovery extends backlog prioritization with user validation

- **What works for operations/infrastructure:**
    - SRE practices on top of DevOps CI/CD (adds reliability discipline)
    - Lean principles on DevOps (eliminates toil, optimizes handoffs)
    - GitOps + Trunk-based development (tightens feedback loop)

### Precedents: Frameworks Successfully Layering on Agile

#### **SAFe (Scaled Agile Framework)**

- **Integration approach:** Keeps Scrum teams as base unit; adds coordinating layers (Release Train, Portfolio)
- **Adoption rate:** 44% of enterprises; most expensive/highest-touch
- **Lesson:** Heavy frameworks work at scale but create ceremony fatigue; criticized as "agile theater" by practitioners

#### **Lean on Kanban**

- **Integration approach:** Kanban + Lean principles (waste elimination, flow, value focus)
- **Adoption rate:** 40-60% of Kanban teams explicitly incorporate Lean
- **Lesson:** Lightweight principles overlay better than heavyweight frameworks; Lean enhances Kanban without replacing

#### **DevOps on Agile**

- **Integration approach:** Agile + DevOps practices (CI/CD, automation, monitoring) = true end-to-end delivery
- **Adoption rate:** 95% claim integration; 60-70% actually implemented
- **Lesson:** Integrations that solve concrete pain points (deployment, monitoring) scale faster than abstract
  governance

#### **SRE on DevOps**

- **Integration approach:** DevOps + SLO/SLI targets + error budgets = reliability discipline
- **Adoption rate:** 60% have SLO frameworks; 15-20% have dedicated SRE teams
- **Lesson:** Operational practices adopted when they have metrics/visibility; SRE growing because it defines
  reliability language

#### **OKRs on Agile**

- **Integration approach:** OKRs set quarterly goals; Agile teams deliver against goals; decouples goal-setting from
  execution methodology
- **Adoption rate:** 15-25% explicit adoption; higher in tech/startups
- **Lesson:** Goal-setting frameworks orthogonal to execution methodology; low friction adoption

### Common Friction Points When Introducing Structured Overlays

1. **Ceremony Fatigue**
    - **Problem:** Teams already spend 8-10 hours/week in Scrum ceremonies (standup, planning, review, retro); adding
      structured documentation reviews feels like additional meetings
    - **Solution:** Integrate documentation review into existing ceremonies (backlog refinement, sprint planning) rather
      than new meetings
    - **Evidence:** 2025 trend is toward streamlining ceremonies, not adding; teams eliminating standups that "feel like
      confession booths"

2. **Documentation Staleness**
    - **Problem:** Documentation disconnects from reality when Agile execution changes rapidly; "comprehensive
      documentation" becomes liability
    - **Solution:** "Living documents" model; specification changes whenever code changes (versioned in same repo);
      executable/generated specs
    - **Evidence:** Diataxis framework gaining adoption for user docs; spec-driven development advocates emphasize
      "specifications as code"

3. **Methodology Complexity**
    - **Problem:** Teams are already learning Scrum/Kanban/Shape Up; adding another framework's terminology/artifacts
      creates cognitive load
    - **Solution:** Use existing methodology's terminology where possible (e.g., ARC work units = Agile
      epics/initiatives); lightweight on new concepts
    - **Evidence:** Shape Up's success due to simplicity (6-week cycles, no Agile jargon); Dual-Track success due to
      clear two-track model

4. **Tooling Friction**
    - **Problem:** Structured documentation lives in repo (Git); Agile practices live in Jira/Azure DevOps; switching
      tools breaks flow
    - **Solution:** Tight integration or single source of truth; bidirectional sync (Jira <-> Markdown); or repo-native
      tools (Cursor, GitHub's native Markdown)
    - **Evidence:** GitHub Agentic Workflows succeed because they live in GitHub (native); Cursor memory systems succeed
      because in IDE

5. **Role Ambiguity**
    - **Problem:** New frameworks often introduce new roles (e.g., "Documentation Lead," "Governance Officer") that
      conflict with existing roles (Scrum Master, Product Owner)
    - **Solution:** Overlay as responsibility, not role; existing roles integrate new responsibilities without title
      changes
    - **Evidence:** DevOps started as separate team; now engineering teams own DevOps as responsibility

### What Works: Lightweight Integration Principles

Based on research and successful patterns:

1. **Non-mandatory language:** Use framework's terminology only when it adds clarity; otherwise use existing methodology
   terms
2. **Additive, not prescriptive:** Framework should enhance existing practice, not dictate alternative practice
3. **Ceremony neutral:** Should work with Scrum, Kanban, Shape Up, Waterfall—not tied to specific approach
4. **Repo-native:** Documentation frameworks should live in version control, not separate tools
5. **Minimal new roles:** Integrate with existing roles; don't create overhead hierarchy
6. **Metrics optional:** Tracking should enhance decision-making, not become performance metrics that distort behavior
7. **Reversible adoption:** Teams should be able to adopt parts incrementally; nothing should require full commitment
   upfront

---

## 5. THE AI-ASSISTED DEVELOPMENT FACTOR

### Current State: AI in Development Workflows (2025-2026)

#### **Adoption Rates**

- **84% of developers** use or plan to use AI coding assistants (up from 76% in 2024)
- **41% of all code** generated is AI-assisted or AI-generated (2025 data)
- **82% of developers** use AI coding assistants daily or weekly
- **69% of developers** spend time learning new techniques/languages (implies ongoing adaptation)
- **97.5% of software companies** integrate AI into development workflows

#### **Specific Tools**

- **GitHub Copilot users:** Complete 126% more projects per week vs. manual coders (vendor claim; field data more
  modest)
- **Stack Overflow 2025:** 65% of developers use AI tools at least weekly
- **Productivity claims:** 30-75% time savings on coding/testing/documentation (highly variable, context-dependent)

### Impact on Development Methodologies

#### **1. Velocity/Estimation Changes**

- **Challenge:** Story points based on "developer effort" become meaningless when effort is AI-assisted
    - Same story takes 2 hours with AI, 8 hours without
    - What do velocity metrics mean in mixed-AI/non-AI teams?
    - How does AI change sprint planning accuracy?

- **Observable patterns:**
    - Teams using AI draft code 20-40% faster (individual velocity up)
    - But code review, testing, deployment cycle times don't change proportionally
    - Net productivity gains usually 10-20%, not 50%+ (processing overhead eats savings)

- **Emerging practice:**
    - Some teams abandoning velocity/story points entirely (Shape Up / continuous deployment style)
    - Others using "effort points" vs. "complexity points" (effort ≠ value delivered)
    - Focus shifting to cycle time/throughput (Kanban metrics) rather than velocity

#### **2. Task Decomposition & Planning**

- **Challenge:** AI works better with very detailed specs (reduces hallucinations), contradicting Agile's "embrace
  change" principle
    - Very detailed user stories with explicit acceptance criteria work better with Copilot
    - But over-specification reduces adaptability and feels anti-Agile

- **Observable patterns:**
    - Spec-Driven Development emerging as methodology response: light upfront spec → tight feedback loop
    - Dual-Track adoption accelerating: discovery validates ideas before detailed engineering spec
    - BDD/TDD practices gaining momentum: executable specifications reduce ambiguity for AI generation

- **Emerging practice:**
    - Specs-as-executable-tests (BDD) instead of natural language user stories
    - AI generates test scaffolding → developer writes business logic → AI assists refinement
    - Detailed specs for AI generation, brief specs for human communication

#### **3. Code Review & Quality Processes**

- **Challenge:**
    - AI generates code without understanding system context (65% of developers cite "missing context" as top issue)
    - More code to review means review bottleneck tightens
    - AI hallucinations / low-quality suggestions reduce team trust

- **Observable patterns:**
    - Code review time increasing despite faster coding (more code generated = more to review)
    - Testing importance rising: automated tests become primary quality gate vs. code review
    - TDD adoption accelerating: tests provide context AI needs; test first = AI handles implementation

- **Emerging practice:**
    - Automated testing as quality gate (not code review alone)
    - AI-generated test scaffolding / edge case detection
    - Smaller PRs, more frequent reviews (trunk-based development) winning over large-batch reviews

#### **4. Team Dynamics & Skill Distribution**

- **Challenge:**
    - AI helps junior developers write code quickly (positive)
    - But does it prevent them learning how to architect/design? (concern)
    - Productivity gains aren't evenly distributed (experienced devs benefit more than juniors)

- **Observable patterns:**
    - Some teams using AI as "pair programming" replacement (less mentorship)
    - Other teams using AI to offload boilerplate so seniors can mentor on design
    - Hiring focus shifting from "write code fast" to "design systems," "architect," "make decisions"

- **Emerging practice:**
    - AI for boilerplate/scaffolding; humans for architecture/design/decisions
    - Pair programming with AI (human + AI + expert reviews) vs. pair programming with human
    - Emphasis on specification clarity (as human skill, not implementation skill)

#### **5. Continuous Integration / Testing**

- **Challenge:**
    - AI-generated code needs higher-quality automated tests to catch hallucinations
    - CI/CD pipelines become quality bottleneck if not heavily automated
    - Feature flags / canary deployments more critical for untested features

- **Observable patterns:**
    - Trunk-based development adoption accelerating (need frequent integration, fast testing)
    - Feature flag usage becoming standard (safety valve for AI-generated features)
    - Observability/monitoring more critical (catch production issues AI-generated code might have)

- **Emerging practice:**
    - Shift-left testing (testing in IDE while writing, not just CI)
    - AI-assisted test generation (Copilot generates test cases for generated code)
    - Chaos engineering as standard practice (validate AI-generated resilience code)

#### **6. Documentation Practices**

- **Challenge:**
    - Less manual documentation written (AI can generate from code)
    - But documentation accuracy becomes critical (wrong docs from AI worse than no docs)
    - Tradeoff: "code as documentation" vs. external documentation

- **Observable patterns:**
    - Living documentation (generated from code) gaining adoption
    - Specification-as-code (executable specs) preferred over natural-language docs
    - API documentation auto-generated more common

- **Emerging practice:**
    - Tests as primary documentation (BDD/TDD)
    - ADRs (Architecture Decision Records) as structured documentation
    - Less sprawling documentation, more focused decision capture

#### **7. Estimation & Planning Impacts**

- **Observable changes in practice:**
    1. **Story point variance increasing:** Same story estimates from 3 points to 8 points depending on AI usage, team
       experience, feature complexity
    2. **Shorter iterations:** More teams moving from 2-week to 1-week sprints to accommodate faster feedback cycles
       with AI
    3. **Continuous planning:** Shape Up / no-ceremony approaches gaining relative adoption due to AI's ability to
       handle emerging requirements
    4. **Metrics focusing on outcomes not effort:** OKRs/throughput-based metrics replacing velocity-based planning

### Methodologies Most Affected by AI

#### **Heavily Affected (Need Significant Adaptation)**

1. **Scrum:** Velocity metrics broken; story points lose meaning; sprint planning assumptions invalid
    - **Response:** Some teams shifting to effort-agnostic metrics (throughput, cycle time); maintaining Scrum structure
      but changing how planning/estimation works

2. **RUP/Waterfall:** Upfront estimation becomes impossible; scope/schedule assumptions invalid
    - **Response:** Hybrid approaches (Waterfall structure + Agile execution); DAD (Disciplined Agile Delivery) gaining
      interest as adaptive framework

3. **Traditional Project Management (hours-based):** Time tracking for billing becomes unreliable
    - **Response:** Value-based billing; outcome-based pricing; retainers for AI-assisted teams

#### **Moderately Affected (Adaptations Emerging)**

1. **Kanban:** Cycle time metrics stable, but throughput needs AI-aware tracking; quality metrics more critical
    - **Response:** Adding quality gates (defect rate, test coverage) to Kanban; feature flags standard

2. **SAFe:** PI planning becomes harder with AI variability; velocity averaging breaks
    - **Response:** Capacity-based planning instead of velocity; shorter planning horizons (quarterly vs. 8-week)

3. **Dual-Track Agile:** Discovery track assumptions hold; delivery track needs velocity rethinking
    - **Response:** Learning velocity (discovery) stable; delivery velocity becomes delivery throughput; more emphasis
      on validation before implementation

#### **Less Affected (Minimal Adjustment Needed)**

1. **Shape Up:** 6-week fixed timebox, fixed scope approach works well with AI (AI accelerates implementation within
   fixed scope)
    - **Response:** Minimal changes; "shaped project" approach naturally accommodates AI variations

2. **DevOps/SRE:** Metrics (deployment frequency, MTTR) unaffected by code generation
    - **Response:** May need additional quality/safety gates; otherwise stable

3. **Lean:** Waste elimination principles still apply (AI doesn't eliminate handoffs, reviews, deployment toil)
    - **Response:** Stable; Lean on AI: eliminate toil, not just code generation

### Emerging Organizational Responses to AI-Induced Methodology Shifts

1. **"AI-Augmented Agile"** (informal terminology)
    - Keep Scrum/Kanban structure
    - Replace velocity/effort-based estimation with outcome/complexity-based planning
    - Shorter feedback loops (daily instead of weekly)
    - Higher quality gates (testing, review, monitoring)
    - Focus on "shaped work" / clear requirements over "embrace change"

2. **"Spec-First + AI Delivery"**
    - Detailed specification phase (human domain expertise)
    - BDD/TDD structure (executable specs)
    - AI implements against specs
    - Testing validates spec adherence
    - (Emerging as response to AI hallucination problem)

3. **"Outcome-Focused Development"**
    - Move from effort/velocity to impact/outcomes (OKRs, throughput, user satisfaction)
    - AI as tool for delivery, not measure of progress
    - Focus on "did we solve the problem?" not "how fast did we code?"

4. **"Guardrails & Quality Gates"**
    - Keep methodology mostly unchanged
    - Add quality gates (automated testing, security scanning, architecture review)
    - Feature flags on all AI-generated code
    - Monitoring/observability for AI-generated features

### Open Questions & Uncertainties

1. **Estimation models:** No consensus yet on how to estimate with mixed AI/human teams; different data sources give
   conflicting signals
2. **Long-term productivity:** 30-75% claims vary wildly; field data suggests 10-20%; unclear if gains persist as AI
   naturalizes
3. **Quality impacts:** Some studies show 90% fewer defects with TDD; others show AI-generated code needs 2X review
   time; conflicting signals
4. **Team dynamics:** Unclear if AI assistance helps juniors learn or prevents learning; early data mixed
5. **Methodology lock-in:** Will orgs get locked into "AI requires Shape Up" or "AI requires Spec-First"? Or can AI work
   with any methodology?

---

## 6. OUTPUT & COMPLETENESS CHECK

### Methodologies Covered

#### **Tier 1: Widely Adopted (> 10% of teams)**

- [x] Scrum (87%)
- [x] Kanban (56%)
- [x] Waterfall (44% in mixed contexts)
- [x] DevOps practices (95% claimed; includes Trunk-Based Development)
- [x] TDD/BDD as practices (40-50% partial adoption)

#### **Tier 2: Moderately Adopted (2-10% primary, higher with hybrid/partial adoption)**

- [x] Scrumban (27%)
- [x] SAFe (44% large enterprises; 30-44% scaling choice)
- [x] Lean principles (5% explicit; 40-60% incorporated into Agile)
- [x] Dual-Track Agile (10-15% explicit; higher implicit)
- [x] Continuous Discovery (growing; 40-50% product teams)
- [x] SRE (15-20% dedicated teams; 60% with SLO frameworks)
- [x] Shape Up (< 2% explicit; growing among product companies)
- [x] OKR-Driven Development (15-25% explicit)
- [x] XP (20% as hybrid; < 5% pure; core practices widespread)

#### **Tier 3: Niche (<2% primary adoption)**

- [x] FDD (Finance/Gov niche)
- [x] DSDM (UK/Europe niche)
- [x] Crystal Methods (< 1%)
- [x] RUP (< 2%; declining)
- [x] V-Model (< 2%; aerospace/defense)
- [x] Spiral Model (< 1%; historical)
- [x] Impact Mapping (< 2%; used as planning exercise)
- [x] Theory of Constraints (< 2% methodology; growing in DevOps thinking)
- [x] No-Methodology / Ad-Hoc (15-20% solo; 20-30% small teams; underreported)

#### **Questionable Exclusions / Borderline Cases**

**Considered but Excluded or Minimal Coverage:**

1. **Iterative Development (generic)** — included as 20% adoption rate, but this is often shorthand for "not Waterfall"
   rather than a defined methodology. Covered under broader Agile umbrella.

2. **Continuous Delivery / Continuous Integration** — included as DevOps practice family rather than standalone
   methodology. Correct framing because CI/CD is practice, not methodology; adopted across all methodologies.

3. **Agile Modeling** — mentioned in FDD/RUP context; not standalone (usually practiced within other methodologies like
   FDD, RUP, Crystal).

4. **Adaptive Software Development** — historical Agile framework (1990s, predates Scrum); minimal modern adoption. Not
   included due to < 0.5% current adoption and historical nature (similar to Spiral, RUP).

5. **Dynamic Specification / Extreme Design** — research specialization, not professional methodology. Excluded as
   theoretical rather than practiced.

6. **Mob Programming / Ensemble Programming** — practice within XP/Agile, not methodology. Covered under XP practices.

7. **Waterfall with Agile Iterations** — captured under "Hybrid Approaches" section; real pattern but no formal
   name/adoption tracking.

8. **eXtreme Programming variants (Crystal XP, etc.)** — minimal modern usage; covered under XP section.

9. **OpenUP (Rational Unified Process lightweight variant)** — attempted revival of RUP; minimal adoption (< 0.5%). Not
   included as distinctly separate.

10. **Agile Data Methodologies (DataOps, MLOps)** — emerging domain-specific practices, not core software development
    methodologies. Data/ML teams adapt general methodologies (Scrum/Kanban) rather than using distinct frameworks.
    Excluded as out-of-scope for general dev methodology landscape.

**Notable frameworks with lighter coverage:**

- **Spotify Model** (Squads/Tribes/Chapters/Guilds) — widely *discussed* in agile-at-scale
  conversations, but more organizational structure than development methodology. Spotify
  themselves have moved away from it. Some teams still reference it as aspiration. Covered
  implicitly under hybrid approaches and scaling variants, but worth noting by name given
  its recognition.
- **Lean Startup** (Build-Measure-Learn, MVP) — significant in startup and product contexts.
  Overlaps heavily with Continuous Discovery (covered above) but predates it and has distinct
  vocabulary (pivot, MVP, validated learning). Teams using Lean Startup principles would find
  ARC's discovery-track integration patterns applicable.
- **Disciplined Agile (DA/DAD)** — PMI-backed toolkit for choosing the right methodology per
  context. Mentioned in passing ("DAD gaining interest") but growing due to PMI certification
  push. More of a meta-framework (helps teams choose between Scrum/Kanban/Lean/etc.) than a
  methodology itself — ARC's methodology-agnostic positioning aligns naturally.
- **Prince2 Agile** — combining Prince2 governance with Agile delivery. Notable in
  UK/Europe/government/regulated contexts. Teams using Prince2 Agile would encounter ARC as
  a documentation overlay similar to how Prince2 already layers on governance — low friction
  if ARC avoids competing with Prince2's existing artifact structure.

### Confidence Levels

| Finding                          | Confidence  | Reasoning                                                                                 |
| -------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| Scrum 87% adoption               | High        | Multiple consistent sources (State of Agile, VersionOne, surveys)                         |
| Kanban 56% adoption              | High        | Consistent reporting across surveys; market data validates                                |
| SAFe 44% enterprise adoption     | Medium-High | Multiple sources; confounded by "claim vs. actual" (orgs claim SAFe but inconsistent use) |
| Waterfall 44% (mixed portfolios) | Medium      | Based on limited data point; likely underestimated (many don't admit pure Waterfall)      |
| AI impact on estimation          | Medium      | Early data; conflicting sources; field experience vs. vendor claims                       |
| Shape Up adoption < 2%           | Medium      | Not in traditional surveys; estimated from community size and adoption signals            |
| SRE 15-20% dedicated teams       | Medium      | Based on LinkedIn job postings, conference attendance; survey coverage limited            |
| Ceremony fatigue as trend        | Medium-High | Multiple 2025 sources; consistent narrative but limited quantitative data                 |
| No-methodology prevalence        | Medium      | Solo developers underreported in team-centric surveys; estimate based on labor statistics |

### Sources by Category

**Methodology Adoption & Prevalence:**

- State of Agile Reports 2025 (Digital.ai) — comprehensive, 3000+ respondents
- VersionOne Agile reports — historical data for trend analysis
- Stack Overflow Developer Survey 2025 — 49,000 respondents, general developer population
- Parabol Agile Statistics — aggregated survey data
- JetBrains Developer Survey — tech-focused demographic

**Specific Frameworks:**

- SAFe: Framework.scaledagile.com, IBM, Atlassian, Aha! Roadmapping
- Shape Up: Basecamp.com/shapeup, ProductSchool, Medium case studies
- Dual-Track: Silicon Valley Product Group, Teresa Torres (Continuous Discovery Habits)
- SRE: Google Cloud SRE resources, SRE Report 2025, AWS SRE
- DevOps: DevOps.com, GitHub, Cloud-native ecosystem sources
- DSDM: DSDM Consortium, ProjectManagement.com
- FDD: Peter Coad, Planview, Feature-driven development community
- Lean: Lean Enterprise Institute, Tom Poppendieck
- TDD/BDD: Katalon, Cucumber community, Microsoft/IBM case studies
- Kanban: Atlassian, BusinessMap.io, Japanese lean heritage sources
- XP: Extreme Programming community, Agile Alliance

**AI & Development Impact:**

- Stack Overflow 2025 Developer Survey — AI tooling adoption
- GitHub Copilot research — productivity claims
- METR open-source developer study — controlled field testing
- Index.dev AI Coding ROI — industry data
- Qodo AI code quality report — quality impacts
- Various 2025 blog articles on AI-augmented agile

**Enterprise & Industry Data:**

- Fortune 500/100 adoption claims (multiple sources)
- Industry vertical adoption (financial services, healthcare, tech) from State of Agile
- Regional variation from international Agile surveys

---

## 7. CRITICAL FINDINGS FOR ARC INTEGRATION

> **Note:** This section synthesizes research observations into preliminary integration
> analysis. These are *research inputs* for downstream ADR discussions, not validated
> design decisions. Actual framework positioning, integration strategy, and adoption
> prioritization will be decided through the ADR process in Phase 2.

### Key Principles for ARC as Methodology Overlay

Based on this research, ARC should:

1. **Be Methodology-Agnostic**
    - Work with Scrum, Kanban, Shape Up, Waterfall, Hybrid teams
    - Use terminology that translates to each methodology
    - Don't require teams to change existing ceremonies

2. **Be Lightweight & Composable**
    - Teams should adopt ARC constructs incrementally
    - No required "all-or-nothing" adoption
    - Integrate with existing tools (GitHub, Jira, repo-native)

3. **Solve Specific, Felt Pain Points**
    - Handbook notes: documentation staleness, ceremony fatigue, cross-session context
    - Not a framework in search of a problem
    - Explicitly articulate why each ARC construct exists

4. **Respect "Embrace Change" Agile Principle**
    - Specifications should enhance Agile, not constrain it
    - Flexible, "shaped" requirements work better with AI than rigid specs
    - Documentation should be living/versioned, not frozen

5. **Address AI-Assisted Development Reality**
    - Clear specification language helps AI; ARC's task structure good for this
    - Quality gates (approval, testing) become more critical
    - Session continuity especially valuable across tool changes (Copilot → Cline → Claude)

6. **Integrate with Both Synchronous (Ceremony-Based) and Asynchronous (AI-Assisted) Work**
    - Some teams have standups; AI assistance means context available async
    - Session handoff protocol especially valuable for solo/distributed teams
    - Approval gates reduce need for synchronous review meetings

### Methodologies Where ARC Has Highest Integration Value

1. **Dual-Track / Continuous Discovery Teams** (10-15% adoption, growing)
    - ARC's task structure complements discovery validation
    - Work unit concept aligns with delivery track organization
    - Session handoff protocol valuable for cross-functional team handoffs

2. **Distributed / Remote Agile Teams** (50-70% post-COVID)
    - ARC's documentation-first approach natural for async workflows
    - Session continuity critical for teams across time zones
    - Approval gates reduce synchronous meeting burden

3. **Solo Developer / Consulting / Freelance** (15-20% of dev workforce)
    - ARC's structured task execution, session handoff valuable for single-person operations
    - Documentation-as-continuity addresses context loss between sessions

4. **Scrum Teams with AI Assistance** (growing, no formal count)
    - ARC's task specification language helps with AI code generation
    - Quality gates (approval workflow) address AI hallucination concerns
    - Velocity metrics problem ARC can help solve (task-based tracking vs. story-point tracking)

5. **Emerging Teams / No-Methodology** (20-30% small teams)
    - ARC provides structure without ceremony burden
    - Scales from 1 person to small team without architectural change
    - Good fit for teams "too small for Scrum, too organized for chaos"

### Methodologies Where ARC Integration May Require More Effort

1. **SAFe / Large Enterprise Scale** (44% enterprises)
    - Already heavily prescribed; ARC is additional layer
    - High implementation overhead; hard to add another framework
    - Possible but not primary audience

2. **Highly Formal Waterfall** (< 5% pure; 44% mixed portfolios)
    - Waterfall already specifies documentation heavily
    - ARC's task execution model may seem redundant
    - Better angle: help Waterfall teams with changeability (ARC's strength)

3. **Minimal-Process Teams Using Shape Up** (< 2%)
    - Already very lightweight; ARC adds structure that contradicts Shape Up philosophy
    - Possible as optional overlay but low adoption likely

---

## Summary: What ARC Needs to Know

1. **Scrum (87% adoption) is the baseline.** ARC must work with Scrum without replacing Scrum.

2. **Methodology is increasingly hybrid (31.5% of teams).** One-size-fits-all doesn't work; composability critical.

3. **Ceremony fatigue is real.** ARC must integrate with existing ceremonies, not add overhead.

4. **AI changes everything about estimation/velocity, but doesn't change fundamental methodology structure.** ARC's task
   execution language helps AI understanding; approval gates help with quality.

5. **Documentation as workflow (not just information) is emerging pattern.** ARC is well-positioned for this shift;
   repo-native frameworks winning.

6. **Lightweight overlays work; heavyweight overlays fail.** ARC's strength is that it's documentation-based, not
   ceremony-based.

7. **Distributed/async work is now mainstream.** ARC's session continuity and async-friendly task structure are
   advantages, not niche.

---

## SOURCES

### Survey & Prevalence Data

- [State of Agile 2025](https://staragile.com/blog/state-of-agile)
- [State of Agile Report 2025 - CertLibrary](https://www.certlibrary.com/blog/insights-from-the-latest-state-of-agile-report-2025/)
- [2025 Stack Overflow Developer Survey](https://survey.stackoverflow.co/2025/)
- [Agile Statistics 2025 - Parabol](https://www.parabol.co/blog/how-many-companies-use-scrum-in-2025/)
- [Agile Statistics - ElectroIQ](https://electroiq.com/stats/agile-statistics/)
- [Scrum Statistics 2026 - Parabol](https://www.proprofsproject.com/blog/scrum-statistics/)
- [Kanban Adoption - Multiboard](https://www.multiboard.dev/posts/kanban-project-management-trends-2025/)

### Methodology Frameworks

- [SAFe - Scaled Agile Framework](https://framework.scaledagile.com/)
- [SAFe Adoption Rates - Atlassian](https://www.atlassian.com/agile/agile-at-scale/what-is-safe)
- [Shape Up Guide - Basecamp](https://basecamp.com/shapeup)
- [Shape Up Implementation - Medium/ProductSchool](https://medium.com/adventures-in-consumer-technology/why-we-transitioned-from-sprints-to-basecamps-shape-up-f416114224e7)
- [Dual-Track Agile - Silicon Valley Product Group](https://www.svpg.com/dual-track-agile/)
- [Dual-Track Agile - Tempo](https://www.tempo.io/glossary/dual-track-agile)
- [Scrumban Guide - Atlassian](https://www.atlassian.com/agile/project-management/scrumban)
- [Continuous Discovery - IxDF](https://www.interaction-design.org/literature/topics/continuous-discovery)
- [Feature-Driven Development - TechTarget](https://www.techtarget.com/searchsoftwarequality/definition/feature-driven-development)
- [FDD Guide - Monday.com](https://monday.com/blog/rnd/feature-driven-development-fdd/)
- [Extreme Programming 2025 - Premier Agile](https://premieragile.com/what-is-extreme-programming-xp-agile-2025/)
- [DSDM Framework - ProductPlan](https://www.productplan.com/glossary/dynamic-systems-development-method/)
- [Crystal Agile - Premier Agile](https://premieragile.com/crystal-agile-methodology)
- [Lean Software Development 2025 - Netguru](https://www.netguru.com/blog/lean-software-development)
- [Waterfall Methodology - Asana](https://asana.com/resources/waterfall-project-management-methodology)
- [RUP Framework - ONES](https://ones.com/blog/what-is-rational-unified-process-rup/)

### DevOps, SRE, and Flow-Based

- [DevOps Trends 2025 - DevOps.com](https://devops.com/the-future-of-devops-key-trends-innovations-and-best-practices-in-2025/)
- [SRE Report 2025](https://www.businesswire.com/news/home/20250113364803/en/The-SRE-Report-2025-Highlighting-Critical-Trends-in-Site-Reliability-Engineering/)
- [SRE Guide 2025 - Configu](https://configu.com/blog/site-reliability-engineering-complete-guide/)
- [Trunk-Based Development - Atlassian](https://www.atlassian.com/continuous-delivery/continuous-integration/trunk-based-development)
- [Trunk-Based Development Guide 2025](https://productdock.com/trunk-based-development/)
- [DORA: Trunk-Based Development](https://dora.dev/capabilities/trunk-based-development/)

### AI Impact on Development

- [AI Coding Assistants Statistics 2025 - Second Talent](https://www.secondtalent.com/resources/ai-coding-assistant-statistics/)
- [METR: AI Impact on Experienced Developers 2025](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
- [AI Coding Assistants ROI 2025 - Index.dev](https://www.index.dev/blog/ai-coding-assistants-roi-productivity)
- [State of AI Code Quality 2025 - Qodo](https://www.qodo.ai/reports/state-of-ai-code-quality/)
- [TDD vs BDD in 2025 - Katalon](https://katalon.com/resources-center/blog/tdd-vs-bdd)
- [TDD/BDD Adoption 2025 - Medium](https://medium.com/@sharmapraveen91/tdd-vs-bdd-vs-ddd-in-2025-choosing-the-right-approach-for-modern-software-development-6b0d3286601e)

### Documentation & Integration Patterns

- [Agile Documentation Best Practices - Document360](https://document360.com/blog/agile-documentation/)
- [Agile Documentation - Nuclino](https://www.nuclino.com/articles/agile-documentation)
- [Documentation Overhead & Ceremony Fatigue 2025 - DIVIM](https://www.divim.io/are-agile-ceremonies-dead-how-enterprise-teams-are-streamlining-workflows-in-2025/)
- [Agile Ceremonies Guide 2025 - Monday.com](https://monday.com/blog/rnd/agile-ceremonies/)
- [OKR Guide 2025 - Quantive](https://quantive.com/resources/articles/okr-guide)
- [OKRs in Product Management - Monday.com](https://monday.com/blog/rnd/okrs-for-product-management/)

### General Software Development Trends

- [Software Development Statistics 2026 - MindInventory](https://www.mindinventory.com/blog/software-development-statistics/)
- [Development Trends 2026 - Hostinger](https://www.hostinger.com/tutorials/software-development-trends)
- [Development Trends 2025 - Keyhole Software](https://keyholesoftware.com/software-development-statistics-2026-market-size-developer-trends-technology-adoption/)

---

**Research Completed:** 2026-02-23 **Next Steps for ARC Integration Planning:** Use this landscape analysis to refine
integration guidance, methodology-specific onboarding templates, and adoption paths for different team structures.
