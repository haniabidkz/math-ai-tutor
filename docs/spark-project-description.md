# SPARK Program – Section 2: Project Description (REFERENCE OUTLINE ONLY)

> **Do not paste this text into the Ignite form.** Ignite's policy rejects proposals "substantially developed by generative AI" and runs similarity checks. This file is an AI-written outline of the points to cover. Write every field in your own words (see `spark-writing-kit.md`), then use AI only for translation/editing and disclose it.

Live product: https://learnaitutor.com

Suggested Project Title (Section 1): **LearnAI Tutor: An AI-Powered Adaptive Learning Platform for Pakistani Schools, Starting with Mathematics (Classes 6–10)**

---

## 1. Project Summary / Abstract

LearnAI Tutor (formerly SMART Math Tutor) is an AI-powered, adaptive learning platform for Pakistani school students. Its first subject is mathematics for Classes 6–8, aligned with the Oxford Countdown and Sindh Textbook Board curricula. The platform is already live at https://learnaitutor.com and is used by individual students, teachers and schools.

The platform itself is subject-agnostic: the diagnostic engine, adaptive practice, AI content pipeline and school dashboards work for any subject with a structured curriculum. Mathematics was chosen first because it has the highest failure rate and the largest tuition market; Science and English modules will follow on the same engine after this project.

Every student starts with a 15-question diagnostic test that identifies weak concepts. An adaptive engine then builds a personalised learning path: short step-by-step lessons, practice quizzes that adjust difficulty in real time, and AI-generated explanations of mistakes in simple English or Roman Urdu. Teachers get a dashboard to assign homework and track every student's progress; parents receive weekly reports; schools get a multi-tenant admin panel with class sections, seat management and school-level leaderboards.

This project will take the platform from a working product to a validated, scalable national solution: (a) run a controlled pilot in 20 public and low-fee private schools in Sindh and Punjab, (b) extend content to Classes 9–10 and the Punjab/Federal boards, (c) add full Urdu-medium support, and (d) publish evidence of learning gains so the platform can be adopted at scale.

## 2. Problem Statement

- Pakistan has over 20 million out-of-school children and, among those in school, learning outcomes in mathematics are very low. ASER Pakistan reports that most Class 5 students cannot do Class 2-level division.
- Mathematics has one of the highest failure rates in Class 9 and 10 board exams in Sindh and Punjab. Students arrive in Class 9 with gaps from Classes 6–8 that are never fixed.
- Teachers in public and low-fee private schools typically handle 40–60 students per class. They cannot diagnose each student's individual gaps or give personalised practice.
- Private tuition is the only existing fix. It costs PKR 3,000–10,000 per month, which most families cannot afford, and its quality is unverified.
- Existing digital learning apps are either foreign (not aligned to Pakistani textbooks), English-only, or simply video libraries with no diagnosis, no adaptivity and no teacher integration.

There is no affordable, curriculum-aligned, bilingual tool that tells a student exactly which concept they are missing and then teaches that concept until they master it.

## 3. Proposed Solution and Innovation

LearnAI Tutor combines six elements that no existing Pakistani product offers together:

1. **Diagnostic-first learning.** A fixed, teacher-designed 15-question diagnostic per class maps each student to a concept-level profile before any teaching starts.
2. **Adaptive engine.** Question selection, difficulty and revision timing adjust after every answer using the student's mastery history, so a strong student is not bored and a weak student is not lost.
3. **AI explanations with human-verified content.** Lessons and worked explanations are drafted by a large language model, automatically checked by a second model, and then reviewed by a mathematics teacher before publication (our "AI Studio" pipeline). Students never see unverified AI output.
4. **Bilingual by design.** The whole learning experience is available in English and Roman Urdu with a single toggle; Urdu script support is part of this project.
5. **Whole-school model.** Teacher dashboards, homework assignment, parent reports, per-school leaderboards, phone-number sign-in (no email needed) and offline-tolerant quizzes make the product usable in real Pakistani classrooms with low connectivity.
6. **Reusable across subjects.** Concepts, diagnostics, lessons and questions are stored as structured curriculum data, not hard-coded. The same AI Studio pipeline and adaptive engine can be pointed at a Science or English syllabus, so each new subject costs a fraction of the first.

The platform is built on a modern cloud stack (Next.js, Firebase, Vercel, OpenAI models) with automated tests and CI/CD, so it can scale to hundreds of thousands of students without a proportional increase in cost.

## 4. Objectives

1. Validate learning impact: demonstrate a statistically significant improvement in mathematics scores for students who use the platform for one academic term, compared with a control group.
2. Extend curriculum coverage from Classes 6–8 to Classes 6–10, covering Sindh, Punjab and Federal board textbooks.
3. Add full Urdu-medium support (Urdu script UI, lessons and explanations), reaching students who are not comfortable in English.
4. Deploy in 20 pilot schools (at least 10 public), reaching 3,000+ students and 100+ teachers, and train teachers to use the data.
5. Produce a misconception dataset for Pakistani middle-school mathematics and publish findings to inform curriculum and teacher training.
6. Establish a sustainable business model (school licences + affordable individual subscriptions) so the platform continues after the grant.

## 5. Methodology / Work Plan

**Phase 1 – Preparation (Months 1–3)**
- Finalise pilot school agreements with provincial education departments and private school networks.
- Build the Classes 9–10 content pipeline (AI drafting + teacher review); map Punjab/Federal board chapters.
- Design the evaluation study (pre-test / post-test, treatment and control groups) with an academic partner.

**Phase 2 – Build (Months 2–7)**
- Urdu script UI and content localisation.
- Classes 9–10 lessons, question banks and diagnostics; Punjab/Federal board variants for Classes 6–8.
- Offline-first improvements for low-connectivity schools; low-cost Android device compatibility.
- Teacher training module and school onboarding kit.

**Phase 3 – Pilot (Months 4–10)**
- Roll out to 20 schools in two cohorts; weekly usage and learning analytics.
- Collect misconception data (which wrong answers occur most, by district and school type).
- Mid-pilot teacher feedback and product iteration.

**Phase 4 – Evaluation and Scale-up (Months 10–12)**
- Post-test, analysis and impact report.
- Policy brief for provincial education departments; commercial rollout plan.
- Final report and dissemination (conference paper, open misconception dataset).

## 6. Expected Outcomes and Deliverables

| # | Deliverable | Month |
|---|---|---|
| 1 | Pilot agreements with 20 schools; evaluation design | 3 |
| 2 | Urdu-medium version of the platform live | 6 |
| 3 | Classes 9–10 content live (Sindh board); Punjab/Federal variants for Classes 6–8 | 7 |
| 4 | 3,000+ students and 100+ teachers onboarded; teacher training completed | 8 |
| 5 | Misconception dataset (anonymised) and analytics dashboard | 10 |
| 6 | Impact evaluation report with pre/post learning gains | 12 |
| 7 | Sustainability and scale-up plan; policy brief | 12 |

Target impact indicators: 15%+ improvement in post-test scores over control; 70%+ weekly active usage in pilot schools; teacher time spent on marking reduced by at least 50%.

## 7. Impact

- **Students:** affordable, personalised math help for families who cannot pay for tuition; reduced Class 9–10 failure rates through early gap-filling.
- **Teachers:** concept-level visibility of each student, automatic homework marking, data to guide classroom teaching.
- **Education system:** the first Pakistani-curriculum misconception dataset; evidence for provincial departments on digital adaptive learning in public schools.
- **Economy:** a locally built EdTech platform that can be extended to other subjects and exported to other South Asian and Urdu/Hindi-speaking markets; skilled jobs in AI, software and content development.
- **Inclusion:** Roman Urdu / Urdu support and phone-based login reach students and parents outside the English-speaking, email-using population; works on shared low-cost Android phones.

## 8. Current Status / Readiness

- Working product live in production at https://learnaitutor.com with automated testing and continuous deployment.
- Classes 6–8 diagnostics, adaptive quizzes, lessons, AI explanations, leaderboards, teacher and parent dashboards, and a multi-school admin platform are already built.
- AI content pipeline (draft → automatic check → teacher review → publish) is operational.
- The requested funding takes an existing product to validated impact and scale, which greatly reduces technical risk.

## 9. Risks and Mitigation

| Risk | Mitigation |
|---|---|
| Low connectivity in schools | Offline-tolerant quizzes already built; further offline caching in Phase 2; works on 2G/3G |
| AI explanations contain errors | Two-model check plus mandatory teacher review before publishing; students can flag any content |
| Low teacher adoption | Teacher training, WhatsApp support, simple dashboards; teachers see time saved on marking |
| Data privacy of minors | Phone-number login without email, no ads, data stored with role-based access rules, anonymised research data |
| Content-alignment differences across boards | Board-specific chapter mapping maintained by subject experts |

## 10. Sustainability and Commercialisation

- **Schools (B2B):** annual per-student licence (target PKR 150–300 per student per month, far below tuition cost), with trial and seat management already built.
- **Individuals (B2C):** low-cost monthly subscription with free chapters for every student.
- **Public sector:** province-level licensing for public schools after the pilot evidence.
- The platform's cloud cost per student is small and falls with scale, so the business becomes self-sustaining at roughly 10,000 paying students.
- **Roadmap beyond this project:** Year 2 adds Science (Classes 6–10) and Year 3 adds English on the same engine, turning LearnAI Tutor into a full-curriculum platform and raising revenue per school without new infrastructure.

## 11. Budget Summary (PKR 12,000,000)

| Item | PKR |
|---|---|
| Team salaries (2 developers, 1 math content lead, 1 QA/support) × 12 months | 6,500,000 |
| AI API, cloud hosting, Firebase, monitoring | 1,500,000 |
| Content development: Classes 9–10, Punjab/Federal boards, Urdu localisation | 1,500,000 |
| School pilot: devices for pilot classrooms, teacher training, travel, data collection | 1,500,000 |
| Research, evaluation and reporting (academic partner, data analysis) | 600,000 |
| Contingency | 400,000 |
| **Total** | **12,000,000** |
