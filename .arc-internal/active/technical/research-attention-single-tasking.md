# Research: Human Attention and Single-Tasking

**Purpose:** Empirical evidence on human attention constraints — the cognitive science foundation
for ARC's minimal parallelism and one-task-at-a-time principles.\
**Gathered:** 2026-02-23 | **Agent:** external-research-analyst (two passes)\
**Consumer:** Phase 2 core identity discussion (Task 2.1), core philosophy strategy document,
ADR candidates (PRD requirement 1)

**Source quality:** Prioritizes peer-reviewed empirical sources; meta-analyses and landmark studies
noted. Two research passes: (1) supporting evidence for single-threaded attention, (2) targeted
counterevidence search covering supertaskers, practice effects, threaded cognition, real-world
multitasking domains, and replication critiques. This is research input — findings should be
verified against primary sources before citing in published ADRs.

---

## 1. Task-Switching Costs (Cognitive Psychology)

### 1.1 Rogers & Monsell (1995) — Landmark Study

**Citation:** Rogers, R. D., & Monsell, S. (1995). Costs of a predictable switch between simple
cognitive tasks. *Journal of Experimental Psychology: General*, 124(2), 207-231.

**Key findings:**

- Even when task switches are completely **predictable**, reaction time costs persist on switch
  trials vs. repeat trials
- Switch costs cannot be fully eliminated through preparation
- As preparation interval increased from 150 ms to 600 ms, switch costs reduced but did NOT
  fully disappear beyond 600 ms
- Task-set reconfiguration involves two separable components:
    1. **Intentional reconfiguration** (time-consuming, can be done in advance with sufficient
       preparation interval)
    2. **Competition from carry-over control settings** (immune to preparation — cannot be
       eliminated through advance notice)

**Practical implication:** Humans cannot achieve perfect parallel attention preparation even with
maximum advance notice.

### 1.2 Rubinstein, Meyer & Evans (2001) — Quantified Costs

**Citation:** Rubinstein, J. S., Meyer, D. E., & Evans, J. E. (2001). Executive control of
cognitive processes in task switching. *Journal of Experimental Psychology: Human Perception and
Performance*, 27(4), 763-797.

**Study design:** Four experiments examining task-switching costs across varying task complexity
and familiarity levels. Tasks included solving math problems, classifying geometric objects.

**Key findings:**

- **Task complexity effect:** Time costs **increase significantly with task complexity**;
  switching between complex tasks costs far more than between simple tasks
- **Familiarity effect:** Switching to unfamiliar tasks incurs higher costs; people regain speed
  faster with familiar tasks
- **Quantified cost:** Task-switching can cost up to **40% of productive time** due to cumulative
  cognitive load
- **Executive control model:** Task switching involves two sequential stages:
    1. **Goal shifting** ("I want to do this now instead of that")
    2. **Rule activation** ("I'm turning off the rules for that and turning on the rules for
       this")

**Strength of evidence:** Landmark empirical study with multiple experiments demonstrating
consistent effects across task types.

### 1.3 Task-Switching Cost Magnitude: Quantified Metrics

**Reaction time costs:**

- RT switch cost measured as difference in reaction time between switch and repeat trials
- Costs vary with task complexity but are consistently present
- Recent research shows medium to large effects: task changes show large effect sizes
  (partial eta-squared = 0.10-0.37)

**Accuracy costs:**

- Switching between simple, familiar tasks produces reliable reaction time costs
- Accuracy costs are generally smaller than RT costs
- Meta-analysis of 114 effects found weak correlation between RT and accuracy costs
  (mean r = .17, range -0.45 to .78)

**Recovery dynamics:**

- Increased preparation interval reduces but does not eliminate switch costs
  (Rogers & Monsell, 1995)
- Even with ample preparation time, residual switching costs remain

---

## 2. Attention Bottleneck Theories: Dual-Task Interference

### 2.1 Broadbent's Filter Theory (1958)

**Citation:** Broadbent, D. E. (1958). *Perception and Communication*. Pergamon Press.

**Key findings:**

- Attention acts as a **selective bottleneck** operating early in perceptual processing
- Central processor has **limited capacity** that can select only one sensory input channel
  at a time
- Can switch between channels at maximum rate of about **twice per second**
- Unattended inputs held in short-term memory for only a few seconds before decay
- Evidence from dichotic listening experiments: listeners invariably recalled digits **ear by ear**
  rather than pair by pair, showing mandatory sequential attention

**Theoretical significance:** Established foundational concept that attention has a structural
bottleneck, not just a resource limitation.

### 2.2 Welford's Psychological Refractory Period (1952)

**Citation:** Welford, A. T. (1952). The 'psychological refractory period' and the timing of
high-speed performance — A review and a theory. *British Journal of Psychology. General Section*,
43(1), 2-19.

**Key findings:**

- When responding to two stimuli in rapid succession, **response to the second stimulus is
  significantly delayed**
- Delay arises from a **central bottleneck** that prevents preparation of second action until
  first action is complete
- Bottleneck occurs at **central amodal stage** of information processing (not at perceptual or
  motor stages)
- Perceptual and motor processing can proceed in parallel; the limitation is in response
  selection

**Strength of evidence:** Foundational 70+ year empirical finding replicated across thousands of
studies.

### 2.3 Pashler's Central Bottleneck Model (1994)

**Citation:** Pashler, H. (1994). Dual-task interference in simple tasks: Data and theory.
*Psychological Bulletin*, 116(2), 220-244.

**Key findings:**

- Dual-task interference demonstrates a **structural bottleneck** in response selection
- Central bottleneck model: at any moment, only one response selection process can occur
- Response selection on Task 1 must **complete before** response selection on Task 2 can begin
- Evidence supports bottleneck encompassing:
    - Response selection in choice reaction tasks
    - Certain central cognitive operations (memory retrieval, semantic processing)

**Magnitude of effect:** When task 1 is demanding, task 2 response time is delayed
substantially — often **300-500 ms delays** depending on stimulus onset asynchrony.

**Key implication:** Even with extensive practice, humans cannot achieve true parallel response
selection. The bottleneck persists.

### 2.4 Kahneman's Capacity-Sharing Alternative (1973)

**Citation:** Kahneman, D. (1973). *Attention and Effort*. Prentice-Hall.

**Key findings:**

- Proposes that attention limitation arises from **limited capacity** rather than structural
  bottleneck
- All three processing stages (perception, decision, motor execution) could theoretically
  process two tasks in parallel
- Interference arises because task difficulty determines resource allocation
- Capacity-sharing model predicts graded performance degradation based on relative task demands

**Comparison with Pashler:** Empirical evidence generally favors Pashler's structural bottleneck
over pure capacity-sharing, particularly for response selection tasks.

### 2.5 PRP Paradigm: Quantified Evidence

**PRP effect magnitude:**

- Response to second stimulus delayed by **200-600 ms** depending on stimulus onset
  asynchrony (SOA)
- Delay decreases as SOA increases
- At very short SOAs (< 100 ms), second response may be delayed by 400+ ms
- Effect is **robust and consistent** across modalities and task types

**Recent debate on mechanism:**

- Classical view: bottleneck is in **response selection**
- Contemporary evidence suggests bottleneck may involve **response timing/initiation** rather
  than selection per se
- Regardless of exact mechanism, the bottleneck effect is empirically robust

---

## 3. The Multitasking Myth: Single-Tasking Outperforms in Knowledge Work

### 3.1 Ophir, Nass & Wagner: Media Multitasking and Cognitive Control (2009)

**Citation:** Ophir, E., Nass, C., & Wagner, A. D. (2009). Cognitive control in media
multitaskers. *Proceedings of the National Academy of Sciences*, 106(37), 15583-15587.

**Study design:** Compared heavy vs. light media multitaskers on filtering irrelevant
information, task switching, and working memory management tasks.

**Key findings:**

- **Heavy multitaskers performed WORSE at multitasking** than light multitaskers
  (counterintuitive finding)
- Heavy multitaskers showed deficits in:
    1. **Task switching ability** (slower, more error-prone)
    2. **Filtering irrelevant information** (difficulty ignoring distractions)
    3. **Working memory management** (impaired memory span)
- Heavy multitaskers are **more susceptible to interference** from irrelevant environmental
  stimuli and irrelevant representations in memory

**Critical finding:** "When researchers kept looking for what heavy multitaskers were better at,
they didn't find it." Experience with multitasking does not build multitasking capacity.

**Strength of evidence:** Published in PNAS; widely cited (5000+ citations). Meta-analysis of
subsequent studies shows pooled effect is smaller than initial study but remains significant;
no studies show multitaskers performing *better* at cognitive control.

### 3.2 Sophie Leroy: Attention Residue and Task Switching (2009)

**Citation:** Leroy, S. (2009). Why is it so hard to do my work? The challenge of attention
residue when switching between work tasks. *Organizational Behavior and Human Decision Processes*,
109(2), 168-181.

**Key concept — Attention Residue:** "The persistence of cognitive activity about Task A even
though one stopped working on Task A and currently performs Task B."

**Key findings:**

- When switching tasks, **parts of attention remain with previous task** instead of fully
  transferring
- Attention residue correlates with **worse performance** on new task
- **Stronger residue = worse subsequent performance** (dose-response relationship)
- Residue is especially pronounced when:
    - Previous task was unfinished
    - Previous task was cognitively engaging
    - Insufficient time/ritual for mental closure

**Cognitive implication:** Task switching is not simply about chronological separation — mental
attention lags behind physical action.

### 3.3 Media Multitasking and Attention Capacity (Recent Research)

**Key findings:**

- Heavy media multitasking associated with:
    - **Reduced sustained attention** capability
    - **Increased distractibility** (even in non-multitasking contexts)
    - **Reduced filtering of irrelevant information**
- Neuroscience evidence: continuous partial attention shows increased activation in anterior
  cingulate cortex (attention switching) and dorsolateral prefrontal cortex (cognitive control)
- Interpretation: brain works *harder* to maintain performance, not more efficiently

---

## 4. Workplace Interruptions and Recovery Time

### 4.1 Gloria Mark: The Cost of Interrupted Work (2005-2008)

**Citation:** Mark, G., Gudith, D., & Klocke, U. (2008). The cost of interrupted work: more
speed and stress. *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*
(pp. 107-110).

**Study design:** Observational study of knowledge workers tracking interruptions, recovery time,
and task resumption.

**Key findings:**

**Interruption frequency:**

- Average time on a single task before interruption or self-switch: **3 minutes 5 seconds**
- Workers experience approximately **10-12 interruptions per hour** (context switches every
  3-4 minutes)
- **~50% are self-interruptions** (workers interrupt themselves as much as external interruptions)

**Recovery time:**

- **Average recovery time after interruption: 23 minutes 15 seconds** to fully regain focus
- Many interrupted tasks are not resumed same day (~25% of interrupted work)
- When work is resumed, workers have often worked in 2+ other task contexts before returning

**Behavioral effects:**

- Workers compensate for expected interruptions by **working faster** and maintaining speed
- **Cost of compensation: increased stress**
- Slower response times and reduced accuracy following interruptions
- Higher mental load during interrupted work

**Context matters:**

- Interruptions from **same context** as current task: **beneficial** (relevant information)
- Interruptions from **different context**: **disruptive** (requires mental switch)
- Medium of interruption matters less than whether content relates to current task

**Strength of evidence:** Landmark empirical study; observational methodology with real workers;
findings replicated in follow-up studies.

### 4.2 Quantified Workplace Impact

**Daily productivity loss:**

- **23.25 minutes recovery per interruption** x number of interruptions = massive cumulative cost
- For worker experiencing 8 interruptions daily: ~3 hours recovery time
- Additional time cost from actual task switching overhead
- **Total productivity loss: 25-40% of work day** for interrupt-heavy environments

---

## 5. Developer Interruptions and Flow State (Software Engineering)

### 5.1 Breaking the Flow: Interruptions During Software Engineering (2024)

**Citation:** Lestan, K., Leventis, G., & Ivanovic, M. (2024). Breaking the flow: A study of
interruptions during software engineering activities. *Proceedings of the IEEE/ACM 46th
International Conference on Software Engineering*.

**Study design:** Examined interruptions during three critical SE tasks: code writing, code
comprehension, code review. Measured with physiological sensors and self-report.

**Key findings:**

**Recovery time:**

- **10-15 minutes** for programmer to resume code editing after interruption
- A programmer typically achieves only **one uninterrupted 2-hour session per day**
- Rare to achieve longer flow states in typical work environment

**Productivity impact:**

- **Productivity decreases up to 40%** in environments with frequent interruptions
- Different tasks show different vulnerability:
    - Code writing: highest stress from interruptions
    - Code review: more resilient to interruptions
    - Code comprehension: intermediate disruption

**Flow state implications:**

- Interruptions fundamentally prevent achievement of deep coding flow state
- Even brief interruptions (< 1 min) require 10-15 min recovery
- Recovery involves reloading mental context of code structure, logic, and design

**Strength of evidence:** Recent empirical study using physiological sensors; domain-specific
(software engineering); consistent with broader task-switching literature.

---

## 6. Monitoring Multiple Concurrent Automated Systems

### 6.1 Supervisory Control and Cognitive Load

**Definition:** Supervisory control is high-level monitoring of multiple individual
controllers/processes. Human acts as supervisor of automated systems rather than direct
controller.

**Key challenges:**

- With humans "out of the loop," they supervise **multiple system aspects simultaneously**
- Creates **high workload** managing attention and cognitive resources
- Multiple information sources + high operational tempo = **elevated cognitive demands**
- Ten major supervisory control challenges identified:
    1. Information overload
    2. Appropriate automation levels
    3. Attention allocation across systems
    4. Situation awareness maintenance
    5. Decision time pressure
    6. Trust calibration
    7. Automation transparency
    8. Error recovery
    9. Fatigue and vigilance
    10. Skill degradation

### 6.2 Vigilance Decrement in Automation Monitoring

**Citation:** Wohleber, J. C., Matthews, G., Reinerman-Jones, L. E., & Parfitt, S. L. (2019).
Vigilance and automation dependence in operation of multiple unmanned aerial systems (UAS):
A simulation study. *Human Factors: The Journal of the Human Factors and Ergonomics Society*,
61(2), 305-326.

**Key findings:**

**Vigilance decrement phenomenon:**

- **First significant vigilance drop: ~15 minutes** into automated monitoring
- **Second drop: between 25-40 minutes** into task
- Performance accuracy declines substantially over time
- Effect is **stronger when automation reliability is low** (unpredictable failures)

**Monitoring automated systems:**

- Humans are "not good" at monitoring tasks
- Monotony and passivity during automation cause attention fade
- **Vigilance decrement is operational issue** for multi-system surveillance

**Historical evidence:**

- Monitoring an automated system for a single failure shows:
    - More failure detection in first 10 min than last 10 min of 30-min session
    - Temporal decline in monitoring performance
    - Occurs even with simple task conditions

**Implication:** Humans cannot maintain vigilant attention across multiple automated systems
simultaneously for extended periods. Performance degrades predictably over time.

### 6.3 Air Traffic Control: Monitoring Multiple Aircraft

**Cognitive demands:**

- Air traffic controllers must monitor multiple aircraft in three-dimensional space
- Each aircraft has: position, altitude, speed, trajectory, separation requirements
- Prediction of multiple aircraft "taxes processing capabilities to the utmost" and limits
  visualization quality

**Attention distribution:**

- During high workload, controllers pay **less attention to certain aircraft** to maintain
  awareness of more important information
- Necessary prioritization: cannot give equal attention to all aircraft
- Controllers use prioritization strategies that inherently involve **serial attention** shifting

**Implication:** Even highly trained professionals monitoring complex automated systems must use
serial attention strategies with deliberate prioritization. True parallel monitoring is not
feasible.

---

## 7. Counterevidence and Limitations

**Context:** A follow-up research pass specifically seeking counterarguments, nuances, and
limitations to the single-threaded attention claim. Gathered to ensure the ADR engages with
the strongest objections rather than ignoring them.

### 7.1 Supertaskers: The 2.5% Exception

**Citation:** Watson, J. M., & Strayer, D. L. (2010). Supertaskers: Profiles in extraordinary
multitasking ability. *Psychonomic Bulletin & Review*, 17(4), 479-485.

**Key findings:**

- ~2.5% of participants (5 of 200) showed **zero performance decrements** between single-task
  and dual-task conditions (driving simulator + auditory operation span task)
- Supertaskers scored in the **top quartile** on all dependent measures in single-task conditions
- Frequency was significantly greater than chance (Monte Carlo simulation)
- Neural basis research (Strayer et al., 2014) showed **more efficient recruitment** of anterior
  cingulate and frontopolar cortices — neural efficiency, not just higher capacity

**Critical caveat:** Supertasking appears **innate rather than trainable**. No published research
demonstrates that this capacity can be acquired through training in typical populations.

**Strength as counterargument:** Strong — well-replicated, peer-reviewed, genuine exception to
universal bottleneck. But 2.5% is too rare to design systems around.

### 7.2 EPIC Model: "Virtually Perfect" Time-Sharing Under Specific Conditions

**Citation:** Schumacher, E. H., et al. (2001). Virtually perfect time sharing in dual-task
performance: Uncorking the central cognitive bottleneck. *Psychological Science*, 12(2), 101-108.

**Key findings:**

- After modest practice, some participants achieved **virtually perfect time-sharing** —
  performing two tasks simultaneously with zero dual-task cost
- Meyer & Kieras' EPIC model proposes **no structural response-selection bottleneck**; instead,
  flexible executive control over task processing sequencing
- Three mechanisms reduce dual-task interference with practice:
    1. **Task integration** — structuring task pairs to minimize resource contention
    2. **Automatization** — shifting processing to non-bottlenecked subsystems
    3. **Stage-shortening** — practice shortens processing stages, allowing more temporal overlap

**Critical caveat:** Requires very specific conditions — compatible modalities (e.g.,
visual-manual + auditory-vocal), extensive practice, and simple choice tasks. Does not generalize
to complex, novel, or semantically related tasks.

**Strength as counterargument:** Strong within its narrow scope. Shows the bottleneck *can* be
overcome — but only under conditions unlike novel AI-assisted development work.

### 7.3 Threaded Cognition: Resource-Specific Bottlenecks

**Citation:** Salvucci, D. D., & Taatgen, N. A. (2008). Threaded cognition: An integrated theory
of concurrent multitasking. *Psychological Review*, 115(1), 101-130.

**Key claim:** Multitasking behavior operates as **cognitive threads** — independent streams
coordinated by a serial procedural resource but executed across other available resources
(perceptual, motor, memory). Bottlenecks are **resource-specific** rather than a single central
amodal bottleneck.

**Supporting evidence:** Borst & Taatgen (2010) identified the **problem state bottleneck** — a
resource needed to represent and update the current problem in working memory. When two tasks both
require problem-state access (e.g., two decision-making tasks), interference is maximal. When only
one task requires it, interference is minimal.

**Critical caveat:** Threaded cognition still posits bottlenecks — just specific ones rather than
a general central bottleneck. It does not claim unlimited parallel processing is possible.

**Strength as counterargument:** Moderate. More accurate than "single bottleneck" but reinforces
that complex knowledge tasks (which all require problem-state access) still interfere.

### 7.4 Real-World Multitasking Domains: Managed, Not Eliminated

**Air traffic control — the paradox:**

- Controllers manage 5-20+ aircraft simultaneously using **structured task prioritization** and
  **external cognitive aids** (radar, separation standards, checklists)
- Domain is highly **constrained**: predictable trajectories, standardized communications,
  algorithmic separation rules
- ~2000 hours of training plus proceduralization
- But: when workload exceeds manageable levels, **error rates rise sharply**; regulations strictly
  limit working hours; both very low and very high workload lead to substandard performance
- ATC demonstrates how **domain structure, training, and external tools** mitigate sequential
  bottleneck impact through intelligent task ordering — not true parallel processing

**Operating room evidence:**

- Surgical teams spend **48.2% of time multitasking**, performing **64 tasks per hour** in
  high-load conditions (Goras et al., 2019)
- During concurrent motor-cognitive tasks, prefrontal cortex activity **diminishes** — reduced
  activation in regions critical for attentional control and cognitive flexibility
  (Zheng et al., 2012)
- Even in highly trained surgeons, multitasking impairs performance

**Strength as counterargument:** Shows bottleneck can be *managed* through environmental design,
training, and tools — but does not show it can be eliminated. Performance still degrades under
high load.

### 7.5 Critiques of Anti-Multitasking Literature

**Ophir et al. (2009) replication failures:**

- Wiradhany & Nieuwenstein (2017): two replication studies + meta-analysis
- Only 5 of 14 replication tests yielded significant effects in predicted direction
- Only 2 held in Bayesian analysis
- Meta-analysis of 39 effect sizes: weak association that **turned nonsignificant after
  correction for small-study effects**
- The popular claim that "multitasking damages cognitive control" lacks robust replication

**Ecological validity concerns:**

- Lab task-switching studies (color-naming, shape-naming) may not reflect real-world
  multitasking involving dissimilar tasks, self-directed switching, and extended contexts
- Real-world compensatory strategies (external aids, environmental structure) are absent
  from lab studies

**Beneficial multitasking — creative incubation:**

- Mind wandering during creative incubation periods predicts greater creative improvement
  (Gable et al., 2025)
- Interleaving (alternating between different skills during practice) produces faster
  improvement than blocked practice (Rohrer & Taylor, 2007)
- But: these are sequential interleaving, not simultaneous parallel execution — compatible
  with bottleneck models

**Strength as counterargument:** Ophir replication failures are significant — weakens one
specific popular claim. Ecological validity critique is theoretically sound. But neither
disproves that simultaneous complex tasks show interference; they challenge magnitude and
universality of certain claims.

### 7.6 Counterevidence Synthesis

**Which counterarguments are strongest:**

1. **Supertaskers** — genuine, well-replicated exception. But 2.5% and innate, not trainable.
2. **EPIC time-sharing** — robust under specific conditions. But conditions are unlike novel
   knowledge work.
3. **Domain-structured multitasking** — shows intelligent design mitigates costs. But costs
   remain under load.
4. **Ophir replication failures** — weakens one popular claim. But doesn't disprove the
   underlying bottleneck.

**Which counterarguments are weaker:**

1. **Creative incubation** — conflates sequential interleaving with parallel multitasking.
2. **Skilled performers** — achieve apparent multitasking through automaticity and modality
   segregation, not by bypassing the bottleneck itself.

**The honest framing for ARC:** The bottleneck is probably not a single, amodal
response-selection stage — it's likely multiple resource-specific bottlenecks. With extensive
practice and appropriate task design, interference can approach zero. But these exceptions work
in **highly constrained domains** (practiced, modality-segregated, domain-structured) and do NOT
generalize to novel, complex, semantically related multitasking — which is what AI-assisted
development work is.

---

## 8. Key Takeaways for ARC

### The Evidence Supports Single-Tasking and Minimal-Parallelism Design

1. **Structural bottleneck in attention (70+ years of evidence)**
    - Broadbent (1958), Welford (1952), Pashler (1994) all demonstrate fundamental limitation
      in parallel attention/response selection
    - More precisely: multiple resource-specific bottlenecks (threaded cognition), with the
      **problem state bottleneck** most relevant to knowledge work
    - Implication: Human supervision of multiple parallel AI agents hits a hard cognitive limit

2. **Task-switching costs are substantial and multiply with complexity**
    - Rogers & Monsell: can't be eliminated even with prediction
    - Rubinstein/Meyer/Evans: can cost up to 40% of productive time
    - Costs increase with task complexity and unfamiliarity
    - Implication: ARC's one-task-at-a-time design minimizes cumulative overhead

3. **Attention residue degrades performance**
    - Leroy's research shows previous task's attention persists
    - Measured performance degradation with residue magnitude
    - Implication: Sequential task completion reduces mental "bleed-over" costs

4. **Recovery from interruptions takes 23+ minutes**
    - Gloria Mark's empirical measurement specific to knowledge work
    - Becomes 10-15 minutes for software engineering (still substantial)
    - Implication: Humans cannot effectively supervise multiple rapid AI agent updates;
      recovery time swamps response time

5. **Vigilance decrement in automation monitoring**
    - Humans cannot maintain vigilant attention across multiple systems
    - Significant performance drop at 15 min, then 25-40 min
    - Monotony leads to attention drift
    - Implication: Monitoring multiple AI agents simultaneously hits predictable vigilance wall

6. **Air traffic control shows both limits and mitigation strategies**
    - Highly trained professionals still use serial attention strategies with deprioritization
    - But: domain structure, training, and external tools substantially mitigate costs
    - Implication: The question isn't whether multitasking has costs — it's whether the
      environment is designed to manage them. ARC's design IS that environmental structure.

7. **Context matters for interruptions**
    - Same-context interruptions less harmful; different-context highly disruptive
    - Implication: Keeping human focused on related tasks maintains coherent mental model

8. **Counterevidence narrows but doesn't refute the claim**
    - Supertaskers (2.5%, innate), EPIC time-sharing (narrow conditions), and domain-structured
      success exist — but none generalize to novel, complex knowledge work
    - The strongest framing: "multitasking in novel knowledge work has well-documented costs,
      and AI-agent supervision is novel knowledge work"

### Summary for Architecture Decision Record

**Thesis:** ARC's commitment to minimal parallelism and one-task-at-a-time execution is grounded
in robust, 70+ year empirical evidence from cognitive psychology, human factors engineering, and
software engineering research. The position engages with genuine counterevidence and is stronger
for it.

**Evidence strength:**

- Multiple landmark studies from independent research groups
- Consistent findings across task domains (simple lab tasks, knowledge work, software
  engineering, automation monitoring)
- Meta-analyses confirm core findings despite some variation in magnitude
- Replicated in both controlled experiments and real-world observational studies
- Counterevidence (supertaskers, EPIC, domain-structured success) is real but narrow — does
  not generalize to novel knowledge work contexts

**Confidence level:** Very high for ARC's context. The bottleneck is not absolute (exceptions
exist under constrained conditions), but AI-assisted development is novel, complex, semantically
rich work — exactly the conditions where bottleneck effects are strongest.

---

## References

### Task-Switching Costs

- Rogers, R. D., & Monsell, S. (1995). Costs of a predictable switch between simple cognitive
  tasks. *Journal of Experimental Psychology: General*, 124(2), 207-231.
- Rubinstein, J. S., Meyer, D. E., & Evans, J. E. (2001). Executive control of cognitive
  processes in task switching. *Journal of Experimental Psychology: Human Perception and
  Performance*, 27(4), 763-797.

### Dual-Task Interference and Bottleneck Theory

- Broadbent, D. E. (1958). *Perception and Communication*. Pergamon Press.
- Welford, A. T. (1952). The 'psychological refractory period' and the timing of high-speed
  performance. *British Journal of Psychology. General Section*, 43(1), 2-19.
- Pashler, H. (1994). Dual-task interference in simple tasks: Data and theory. *Psychological
  Bulletin*, 116(2), 220-244.
- Kahneman, D. (1973). *Attention and Effort*. Prentice-Hall.

### Multitasking and Cognitive Control

- Ophir, E., Nass, C., & Wagner, A. D. (2009). Cognitive control in media multitaskers.
  *Proceedings of the National Academy of Sciences*, 106(37), 15583-15587.
- Leroy, S. (2009). Why is it so hard to do my work? The challenge of attention residue when
  switching between work tasks. *Organizational Behavior and Human Decision Processes*, 109(2),
  168-181.

### Workplace Interruptions

- Mark, G., Gudith, D., & Klocke, U. (2008). The cost of interrupted work: more speed and
  stress. *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*,
  107-110.

### Software Engineering Interruptions

- Lestan, K., Leventis, G., & Ivanovic, M. (2024). Breaking the flow: A study of interruptions
  during software engineering activities. *Proceedings of the IEEE/ACM 46th International
  Conference on Software Engineering*.

### Supervisory Control and Automation Monitoring

- Wohleber, J. C., Matthews, G., Reinerman-Jones, L. E., & Parfitt, S. L. (2019). Vigilance
  and automation dependence in operation of multiple unmanned aerial systems (UAS): A simulation
  study. *Human Factors*, 61(2), 305-326.

### Counterevidence: Supertaskers and Individual Differences

- Watson, J. M., & Strayer, D. L. (2010). Supertaskers: Profiles in extraordinary multitasking
  ability. *Psychonomic Bulletin & Review*, 17(4), 479-485.
- Strayer, D. L., et al. (2014). On supertaskers and the neural basis of efficient multitasking.
  *Psychonomic Bulletin & Review*, 21(4), 1057-1063.

### Counterevidence: Practice Effects and EPIC Model

- Schumacher, E. H., et al. (2001). Virtually perfect time sharing in dual-task performance:
  Uncorking the central cognitive bottleneck. *Psychological Science*, 12(2), 101-108.
- Hazeltine, E., Teague, D., & Ivry, R. B. (2002). How does practice reduce dual-task
  interference: Integration, automatization, or just stage-shortening? *Psychological Research*,
  66(4), 260-272.

### Counterevidence: Threaded Cognition

- Salvucci, D. D., & Taatgen, N. A. (2008). Threaded cognition: An integrated theory of
  concurrent multitasking. *Psychological Review*, 115(1), 101-130.
- Borst, J. P., & Taatgen, N. A. (2010). The problem state: A cognitive bottleneck in
  multitasking. *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 36(2),
  363-382.

### Counterevidence: Replication and Methodology Critiques

- Wiradhany, W., & Nieuwenstein, M. R. (2017). Cognitive control in media multitaskers: Two
  replication studies and a meta-analysis. *Attention, Perception, & Psychophysics*, 79(8),
  2524-2541.

### Counterevidence: Real-World Multitasking Domains

- Goras, C., et al. (2019). Tasks, multitasking and interruptions among the surgical team in
  an operating room. *Journal of Multidisciplinary Healthcare*, 12, 481-493.
- Zheng, B., et al. (2012). Multitasking and time pressure in the operating room: Impact on
  surgeons' brain function. *Archives of Surgery*, 147(3), 256-262.
