# LearnAI Tutor: School (B2B) + Individual (B2C) hybrid — implementation plan

Written 2026-10-21 before building. The PRD is general; this plan maps it onto the
system that exists today (Next.js 15 + Firebase Auth + Firestore, Class 6–8 curriculum,
141 live students, 15 teachers, 10 parents, 2 super admins, all B2C today).

## Ground rules

1. Existing curriculum, question bank, diagnostic tests, quiz/evaluate engine, teacher and
   parent workflows, leaderboard rules and the super-admin tools stay exactly as they are.
   Every existing student keeps full access: a student without a school is "paid" unless the
   admin unticks them (the rule chosen for the leaderboard on 2026-10-11).
2. Everything new is additive: new collections, new optional fields (`schoolId`,
   `sectionId`, `phone`), new API routes under `/api/auth`, `/api/school`, `/api/schools`,
   `/api/admin/analytics`. Old documents without the new fields behave as "no school".
3. All tenant checks are enforced on the server (ID token → profile → role → school).
   A cross-school request returns HTTP 403 with code `FORBIDDEN_CROSS_TENANT`.
4. No user-facing toggles: the login and the dashboards route by the account's role and
   school automatically.

## Data model (Firestore)

| Collection / field | Purpose |
| --- | --- |
| `schools/{schoolId}` | name, code (e.g. `EAGLE-6`), city, contact, `plan` (trial / paid / expired), `trialEndsAt`, `paidUntil`, `trialFullAccess`, `seatLimit`, `seatsUsed`, `status` (active / suspended), `lastPromotedAt`, timestamps |
| `schools/{schoolId}/sections/{sectionId}` | `classLevel` (6–8), `name` ("A"), `label` ("6-A"), `active` |
| `schools/{schoolId}/promotions/{id}` | one record per annual promotion run (counts, who, when) |
| `schoolCodes/{CODE}` | `schoolId`; makes the school code unique |
| `schoolAdmins/{uid}` | name, email, phone, `schoolId`, role `school_admin` |
| `students/{uid}` (+ fields) | `schoolId`, `sectionId`, `sectionLabel`, `phone`, `parentPhone`, `schoolStatus` (active / graduated), `enrolledAt`, `lastActiveDate`, `lastActiveAt`; existing `membership.paid` = individually paid |
| `teachers/{uid}` (+ fields) | `schoolId`, `phone`, `assignedSectionIds` (school teachers); existing `assignedClasses` |
| `parents/{uid}` (+ field) | `phone` |
| `homework/{id}` (+ fields) | `schoolId` (null = individual students), `sectionId` (optional) |
| `leaderboards/{week}_{class}_{schoolId}` | a school's own weekly board; the public board id is unchanged |
| `activityLog/{date}_{uid}` | one document per active user per day (DAU, weekly actives, regular users) |
| `questionStats/{questionId}` | attempts / wrong counts per question (most failed questions) |
| `misconceptionStats/{tag}` | counts per misconception, with a per-lesson breakdown |
| `platformSettings/access` | `freeChapterCount` (default 1), `trialDays` (14), `defaultSeatLimit` (100) |

Phone numbers are stored in E.164 (`+923001234567`). Firebase Auth gets the phone as
`phoneNumber` (unique by Firebase itself) and a synthetic sign-in email
`923001234567@phone.learnaitutor.com`, so phone + password works without OTP. Existing
email accounts keep working; the login box accepts either a phone or an email.

## Roles

| Role | Where | Scope |
| --- | --- | --- |
| Super admin (existing) | `/super-admin` | everything, plus Schools and Analytics tabs |
| School admin (new) | `/school-admin` | own school only |
| Teacher (existing) | `/teacher-*` | school teacher: own school, assigned sections/classes; individual teacher: individual students in assigned classes (unchanged) |
| Student / Parent (existing) | unchanged | own data |

## Plans and access

- `trial`: 14 days from creation (`trialEndsAt`); computed as `expired` once the date passes.
- `paid`: institutional plan (optionally with `paidUntil`); `expired`: restricted/free state.
- Students' curriculum access: `full` when the student is individually paid, or the school
  plan is `paid`, or the school has `trialFullAccess`; otherwise `basic` = the first
  `freeChapterCount` chapter(s) of the class. Locked lessons show "Premium" and the
  teach/quiz APIs answer 403 `{ code: "premium" }`.
- Homework: accessible lessons open normally; a homework on a locked lesson stays locked
  for free/trial students. Teachers of an expired school can set homework from the free
  chapters only; trial and paid schools can set any lesson.
- School admin and teacher panels stay fully usable on trial and after expiry (PRD §4).
- Suspended school: every API call from its members answers 403 and the dashboards show
  a notice. Suspended user: Firebase Auth disabled → cannot sign in.
- Seats: enrolment (code sign-up, direct add, bulk import) runs in a transaction that
  refuses once `seatsUsed >= seatLimit`.

## Work items, in order

1. Pure libraries + unit tests: `lib/phone.ts`, `lib/access.ts`, `lib/schools.ts`
   (codes, plan state, promotion planner, CSV import parser, schemas).
2. Server: `lib/server-auth.ts` enriched (profile, schoolId, school, school-admin guard,
   cross-tenant guard); `lib/schools-server.ts` (create school/admin/teacher/student,
   enrol with seats, sections, promotion, suspend, delete, reports, analytics counters);
   `lib/analytics-server.ts` (activity + question/misconception counters, never blocking).
3. APIs: `POST /api/auth/signup`; `/api/schools` (super admin); `/api/school/*` (school
   admin: overview, students, teachers, sections, promote, reports); `/api/admin/analytics`;
   `/api/admin/users` (school column, delete, paid toggle); school scoping in
   `/api/teacher/students`, `/api/homework`, `/api/leaderboard`, premium gate in
   `/api/progress`, `/api/teach`, `/api/quiz`.
4. UI: login (phone or email, school code), `/school-admin` panel, super-admin Schools and
   Analytics tabs, teacher pages (section + Free/Paid, add student), student dashboard
   (premium notice/lock labels), landing "For schools" section.
5. Firestore rules: tenant-aware teacher reads, server-only creates, protected student
   fields, new collections.
6. Verification: lint, typecheck, unit tests, build, local browser run, production
   end-to-end with throwaway school data (deleted afterwards), rules deploy.
7. Deliverable: PDF test guide for the owner.

## Deliberate deviations from the PRD (fit to this system)

- Classes 9–12: the data model is dynamic, but the curriculum and diagnostics exist for
  Class 6–8 only, so sections can be created for 6–8 now; promotion moves 6→7→8 and marks
  Class 8 students "graduated" (data kept). Adding Class 9 later is one constant + content.
- Paid status of an individual student is set by the super admin only (there is no
  payment gateway); school admins and teachers see it.
- Trial students get the free chapters (PRD §6); the super admin can give a prospective
  school a full demo with the `trialFullAccess` switch.
