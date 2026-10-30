# SPARK Project Concept – Field-by-Field Writing Kit (LearnAI Tutor)

Deadline on the Ignite portal: **02 Nov 2026**. Ignite asks you to submit at least two days before, so target **31 Oct or 1 Nov**. Stage 1 cannot be edited after submission.

## READ FIRST: Ignite's generative-AI rule

From the official guidelines (segms.ignite.org.pk/guidelines and /rules):

- "Proposals substantially developed by generative AI will not be accepted for evaluation."
- Core content must be your own: problem statement, novelty, methodology, work plan, commercialization/impact strategy, team description.
- Allowed, with disclosure: grammar/style editing of YOUR text, translation of YOUR content, formatting, literature search where YOU verify every source.
- Every proposal needs an **AI Use Disclosure Statement (max 150 words)**. Undisclosed use is itself a breach, even for permitted uses.
- Similarity limits: overall ≤19%, single source ≤3%, no 15+ consecutive words copied without quotation.

**So: do not paste `spark-project-description.md` or any AI-written paragraph into the form.** Use this kit as a checklist. Write each answer yourself (Roman Urdu is fine), then have the text translated/edited, and disclose that.

Safe workflow:
1. For each field below, answer the bullet questions in your own words (Roman Urdu or English, rough is fine).
2. Get translation + grammar editing only (permitted use).
3. Check every number against the source before you use it.
4. Tick the AI-disclosure box and keep the 150-word statement ready (draft at the end of this file).

## Decision 1 (made 30 Oct): SPARK, research framing

Ignite FAQ 1.2 sends teams with a "functional prototype" whose focus is "productization" to ELEVATE. SPARK is TRL 1–5: idea-to-prototype, outcomes = proof of concept, publications, IP. So the concept note must NOT read as "fund our product's growth". It must read as research on the parts that are genuinely unproven, with the live platform as the **testbed** that makes the research cheap and fast.

The three research questions (write them in your own words; you must actually believe in and commit to them, because later grant tranches are milestone-linked):

1. **Verified bilingual AI explanations.** Can a pipeline of LLM drafting → automatic second-model checking → teacher review bring the error rate of Urdu / Roman Urdu mathematics explanations for Classes 6–8 below a safe threshold (e.g. under 1% on a 2,000-item verified bank), and what is the cost per verified item? Today there is no benchmark for Urdu math explanations at all.
2. **Pakistani misconception map.** Which wrong answers and wrong methods are most common for each Class 6–8 concept in Sindh/Punjab textbooks, and can a model predict a student's specific misconception from their answer pattern? No such dataset exists for Pakistan.
3. **Does adaptive tutoring work in a real Pakistani classroom?** 50 students per teacher, shared low-cost phones, 2G/3G, load-shedding. A controlled study (treatment vs control, pre/post test, one term, 10+ schools) measuring learning gain in standard deviations, as Mindspark did in India (+0.37 SD).

SPARK deliverables that follow: proof of concept (the verified engine + the misconception model, demonstrated on the live platform), at least one peer-reviewed publication from the study, IP (the anonymised misconception dataset and the verification pipeline), and a signed pilot agreement with schools (Ignite releases later tranches against this kind of evidence).

TRL statement to use: the explanation-verification engine, the misconception model and the classroom evidence are at TRL 3–4; the platform around them is existing infrastructure that lowers the cost and risk of the research.

Words that signal SPARK fit: "research question", "hypothesis", "proof of concept", "controlled study", "dataset", "publication", "testbed". Words to avoid as the main story: "scale", "marketing", "customers", "growth" (those belong in the impact section only, as the adoption pathway).

Do not submit the same text to ELEVATE.

## Decision 2: Eligibility gates (check before writing anything)

1. **Registered entity.** "Individuals without a legally registered entity can't apply." Your PIO must be a registered company (SECP), university or research organisation. If your startup is not registered yet, you need a registered partner to act as PIO and nominate you as PI.
2. **PI full-time at the PIO** (declaration 1). As founder/employee of your own company this is true.
3. **Head of PIO signature** (VC / Principal / Rector / Director / CEO / MD). Ideally a different person from the PI, e.g. a co-founder or director. If you are both, be ready to explain.
4. **Not previously funded by any public-sector body** (declaration 4). Must be true.
5. **Equipment not available in PIO** (declaration 3). Only tick if true; for a software project say in the budget that no capital equipment is requested except laptops/tablets for the pilot.
6. **Collaborators must be notified before submission.** Stage 2 needs signed letters of support from every partner.

## Section I – Information

| Field | Enter |
|---|---|
| Project Title | LearnAI Tutor: Verified Bilingual AI Tutoring for Pakistani Middle-School Mathematics (adjust to your own words; keep "verified", "bilingual/Urdu", "adaptive", "Pakistan curriculum" – these are your differentiators) |
| Project Duration | 18 months (the maximum; lets the pilot cover one full academic year) |
| Budget Required (PKR) | `18000000` – realistic for 18 months; "budget realism" is a scored criterion, a new startup asking 50M+ looks unrealistic |
| PIO | Legal name of your registered company / institution |
| PIO Address | Registered address |
| Position/Title | Founder & CEO (or your actual designation) |
| Department | Product & Engineering (company) / CS or Education dept (university) |
| CNIC | your CNIC |
| Technology Verticals | Artificial Intelligence; Cloud Computing |
| Application Domains | Education & Human Capital |

Indicative 18-month budget split (Stage 2 will need Ignite's template; budget heads from FAQ 4.2 are Personnel, Equipment & consumables, Institutional overhead, Contingency, Travel, Other e.g. audit):

| Head | PKR |
|---|---|
| Project personnel (2 engineers, 1 math content lead, 1 research associate, part-time QA) × 18 months | 9,500,000 |
| AI API, cloud, Firebase, monitoring (18 months) | 2,000,000 |
| Pilot: tablets/devices for pilot classrooms, teacher training, data collection | 2,500,000 |
| Content: Urdu localisation, Classes 9–10, board variants (paid teachers/reviewers) | 1,800,000 |
| Evaluation study with academic partner (pre/post testing, analysis) | 900,000 |
| Travel (school visits, Sindh + Punjab) | 400,000 |
| Audit and institutional overhead | 500,000 |
| Contingency | 400,000 |
| **Total** | **18,000,000** |

## Section II – Project Description

**Project Status:** New project.

### Targeted Challenge (max 250 words)

Evaluator wants: ONE specific, measurable challenge + the precise scientific/technical barrier. Not a general "math is weak" story.

Structure (3 short paragraphs):
1. The measurable problem, with one or two numbers and sources.
2. Why the obvious fix (just use ChatGPT / an app) does not work: the technical barrier.
3. One sentence: what this project will prove and how it will be measured.

Answer these in your own words:
- Which exact learning gap? (e.g. Class 6–8 students carry Class 3–5 gaps into Class 9; math has the highest board-exam failure rate)
- Numbers you can cite after verifying at aserpakistan.org: ASER 2023 – 46.3% of Class 5 children could do Class-2 arithmetic, down from 51.4% in 2021 (Dawn report on ASER 2023). ASER 2025 as quoted by UKFIET: ~48% can do basic division.
- Technical barrier (pick the ones you believe in):
  - LLMs make arithmetic/algebra mistakes and hallucinate steps; in Urdu/Roman Urdu the error rate is higher and there is no benchmark to measure it. Unverified AI output is unsafe for unsupervised 11–14-year-olds.
  - No concept/misconception map exists for the Sindh/Punjab Class 6–8 textbooks, so no system can diagnose *why* a student is wrong.
  - Classroom reality: 40–60 students per teacher, shared low-cost Android phones, 2G/3G, load-shedding. Western adaptive systems assume one device per child and stable internet.
- Your measurable success outcome (criterion: "credibility of the verifiable success outcome"), e.g.: AI explanation error rate < 1% on a 2,000-item verified bank in both languages; a misconception map covering 100% of Class 6–8 concepts; a controlled study in 10 schools showing ≥0.2 SD gain vs control in one term.

### Review of State of the Art (max 750 words)

Evaluator wants: you know the global and local solutions, and you can name the precise gaps. This is where "verified literature search" is allowed, but you must write the analysis and check every source.

Suggested structure:
1. Global adaptive/AI tutoring (2 paragraphs)
2. Pakistan-specific products (1–2 paragraphs)
3. Research evidence (1 paragraph)
4. Gap table or gap list → what you will address (1 paragraph)

Verified starting points (check each before citing):
- **Khan Academy / Khanmigo** – AI tutor on Khan content; Khan Academy Pakistan exists and the Federal Ministry of Education signed an MoU for AI-driven personalised learning (reported by Dawn). Gap: English-first, US curriculum sequence, no Sindh/Punjab textbook alignment, no Urdu diagnosis.
- **Mindspark (Educational Initiatives, India)** – adaptive math software. RCT by Muralidharan, Singh & Ganimian (American Economic Review, 2019; J-PAL summary): 619 students in Delhi, 4.5 months, +0.37 SD in math, largest gains for weakest students, projected cost under US$2/student at scale. Gap: Hindi/English, Indian curriculum, centre-based, not AI-generated explanations.
- **Squirrel AI (China)**, **ALEKS (McGraw Hill, knowledge-space theory)** – mature adaptive engines; English/Chinese, proprietary, priced for rich markets. Verify current facts on their sites.
- **ChatGPT / Gemini used directly** – no curriculum map, no diagnosis, no teacher view, known math errors, English-biased; in Pakistani schools students use them to copy answers, not to learn.
- **Photomath-style solvers** – solve a photographed problem; they do not diagnose or teach sequence.
- **Pakistan:** Knowledge Platform's "Parhai Buddy" on Learn Smart Pakistan (with GSMA) – AI learning coach; Sabaq Foundation – free video library; Taleemabad – primary-school curriculum app; Maqsad – Class 9–12 test prep. Verify each company's current offering yourself. Common gaps: video-first not adaptive, English or Urdu-only not bilingual toggle, no verified AI explanations, no concept-level misconception data, no evidence published from Pakistani classrooms.
- Research evidence you can cite: J-PAL "Disrupting Education? Evidence on Technology-Aided Instruction in India" (Mindspark); ASER Pakistan reports; (add any Pakistani EdTech evaluation you find and verify).

Gaps to state explicitly (in your words):
1. Curriculum alignment to Sindh/Punjab/Federal textbooks.
2. Bilingual Urdu/Roman Urdu explanations that are *verified*, not just translated.
3. Concept-level diagnosis and a Pakistani misconception dataset.
4. Works with 50-student classes, shared devices and poor connectivity, with teacher and parent integration.
5. Published evidence of learning gains in Pakistan.

### Major Competencies (max 250 words)

Evaluator wants: expertise, track record, specific resources. Be concrete and honest; a reviewer can open the site.

Real platform numbers pulled from production on 30 Oct 2026 (read-only; a few demo/test accounts may be included, so round down and say "over"):

| Metric | Value |
|---|---|
| Registered students | 168 (Class 6: 95, Class 7: 20, Class 8: 53) |
| Students who completed the diagnostic | 102 |
| Teachers | 19 |
| Parents | 10 |
| Schools on the school platform | 3 |
| Verified questions in the bank | 675 (Class 6: 330, Class 7: 190, Class 8: 140) |
| Micro-concepts mapped | 39 |
| AI Studio drafts reviewed through the pipeline | 24 |
| Question attempts logged with mistake analysis | 214, of which 38% wrong |
| Most common misconception detected | "wrong operation choice" (54 of 82 wrong answers), then incomplete inverse operation, arithmetic slips, stopping before the final step, sign/direction errors |

Use the last two rows in the Targeted Challenge too: they are your own early evidence that the problem is conceptual, not careless, and that a misconception map is feasible.

Write in your own words:
- What you personally built and ran (the live platform at learnaitutor.com, how long, what it does, number of registered students/teachers/schools if you have them, number of questions/lessons in the bank).
- Technical assets already in hand: diagnostic tests per class, adaptive engine, mistake analysis, AI content pipeline with second-model check and teacher review, school admin platform, phone sign-in, offline-tolerant quizzes, automated test suite and CI/CD.
- Domain expertise: your own background (education, business, any teaching), years in the field.
- Resources: cloud infrastructure already running, content for Classes 6–8, relationships with schools/teachers (name them if real).
- Weakness you should cover with a partner: if you have no research background, name an academic co-PI for the evaluation study.

### Teams Profile (max 500 words)

Evaluator wants: each member's strongest past output linked to the work package they lead, and any proof of taking research into real use.

Build the team around 4 work packages, one lead each:
- **WP1 Verified bilingual AI engine** – lead: technical lead / senior engineer (name, strongest past output).
- **WP2 Curriculum, misconception map and content** – lead: math teacher / curriculum expert with Sindh/Punjab board experience.
- **WP3 School pilot and impact evaluation** – lead: academic co-PI (education or CS faculty) who has run a study before.
- **WP4 Adoption and commercialisation** – lead: you (PI), evidence: the product is live and used.

For each person: name, role, 1–2 lines of strongest past output, which WP, time commitment (%). If a seat is not yet filled, say "to be recruited, profile: …" rather than inventing a person. A solo-founder team is the biggest risk reviewers will see; even two confirmed collaborators change the picture.

### Socioeconomic Impact (max 300 words)

Evaluator wants quantified 2–3-year outcomes, each tied to a *named* adoption pathway (industry partner, government buyer, licensing, spin-off).

Write in your words, numbers you can defend:
- Beneficiaries: pilot 10–20 schools / 3,000+ students in 18 months → target X students in year 3 (B2C + B2B).
- Jobs: direct hires during the project (engineers, content, research) + part-time teacher-reviewers and trainers.
- Capacity built: teachers trained in data-driven teaching; school admins.
- Revenue / import substitution: school licence price and expected paying schools; replaces foreign subscriptions and private tuition spend (PKR 3,000–10,000/month per child).
- Adoption pathways, named: (1) private school networks – name the ones you are talking to; (2) government buyer – Sindh School Education & Literacy Department / Sindh Education Foundation / Punjab Education Foundation after the pilot evidence; (3) licensing the misconception dataset and verification pipeline to other EdTech or publishers; (4) the company itself as the commercial vehicle.
- Public goods: open anonymised misconception dataset; publication.

## Section III – Collaborators

Add at least two, three is better. Notify each one before you submit; Stage 2 needs their signed letter.

| Type | Scope | Who (examples to approach) | Role |
|---|---|---|---|
| Academic | National | A university Education or CS department (e.g. IBA Karachi, NED, Sukkur IBA, AKU-IED, LUMS SOE, Habib University) | Evaluation study design, co-PI, publication |
| Industrial / implementation partner | National | A school network you can actually reach (e.g. a private chain, TCF, Sindh Education Foundation partner schools) | Pilot schools, teacher access |
| Government (if the dropdown has it) | Provincial | Sindh School Education & Literacy Dept / Sindh Education Foundation / PEF | Adoption pathway, public-school pilot permission |

Co-financing (cash or in-kind, e.g. your company's existing platform and staff time, a school network's devices) is "viewed favourably"; declare it and back it with a letter at Stage 2.

## Section IV – CV (PDF, ≤10 MB)

One PDF per PI/co-PI with exactly these headings, in this order:
1. Full name and Position/Title
2. Complete address of the organisation
3. Relevant professional training / certifications
4. Experience in chronological order
5. Recent relevant publications (up to 5, Harvard style) – write "None" if none; do not leave the heading out
6. Previous projects won (title, duration, amount, status) – list LearnAI Tutor as a self-funded project: title, dates, amount invested, status "live in production"
7. Previous collaborations (title, duration, amount, status)

## Section V – Declaration

Tick only what is true. For the generative-AI line, the disclosure statement below must be true for your final text.

Head of PIO: name, phone, email, PIO – preferably a director/co-founder, not the PI.

## AI Use Disclosure Statement (≤150 words) – edit so it is exactly true

"Generative AI (Anthropic Claude, via Claude Code) was used only for permitted auxiliary purposes in preparing this concept note: translating the applicant's own Roman Urdu / English notes into English, grammar and style editing of text written by the applicant, formatting, and assisting literature search. All sources cited were independently located and verified by the applicant. The problem statement, novelty, methodology, work plan, team description and impact strategy were conceived and written by the applicant. No AI-generated text was submitted without the applicant's review and rewriting, and all facts, figures and claims are the applicant's responsibility."

## Section VI – Review & Submit

- "SPARK submissions count: 0 of 2" – you may submit two different SPARK proposals; one strong one is better than two weak ones.
- Save Draft after every section. Submit on 31 Oct / 1 Nov, not on the deadline day.
- Stage 1 result is typically known about 30 days after the deadline; Stage 2 (full proposal, budget template, letters, signed declarations) opens only if Stage 1 passes.

## Sources used (verify before citing)
- Ignite applicant guidelines: https://segms.ignite.org.pk/guidelines/
- Ignite FAQ: https://segms.ignite.org.pk/rules
- Ignite SPARK & ELEVATE page: https://ignite.org.pk/spark-elevate/
- Dawn on ASER 2023 (Class 5 arithmetic 51.4% → 46.3%): https://www.dawn.com/news/1824238
- UKFIET on ASER 2025 (48% basic division): https://www.ukfiet.org/2026/beyond-enrolment-pakistans-real-education-crisis-is-learning/
- J-PAL Mindspark evaluation (0.37 SD): https://www.povertyactionlab.org/print/pdf/node/2242?lang=en
- Knowledge Platform Parhai Buddy: https://knowledgeplatform.com/knowledge-platform-launches-parhai-buddy-pakistans-first-ai-powered-learning-coach/
- Khan Academy AI tool in Pakistan: https://www.globalvillagespace.com/khan-academy-introduces-ai-learning-tool-in-pakistan
