<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Student Portal — project context

Read this before changing anything.

## What this is

A three-portal web app for a Bangladeshi exam-coaching business. Students see their
results, ask questions, and request mentor sessions. Built on top of an existing OMR
scanning system ("BigBang Exam Service") which stays the source of truth for students,
courses and marks.

Scale: about 1,000 students, ~50 questions a day. Do not add infrastructure for more
than that — no Redis, no queue workers, no microservices. It was a deliberate decision.

Most students are on cheap Android phones on mobile data, and write in Bangla, often
mixed with English technical terms. Mobile-first is not optional.

## Stack

- Next.js 16 (App Router, TypeScript), one codebase for all three portals
- PostgreSQL via Drizzle ORM — schema in `src/db/schema.ts`, apply with `npm run db:push`
- bcryptjs for passwords, `jose` for session cookies
- Tailwind v4, design tokens in `src/app/globals.css`

Drizzle was chosen over Prisma because Prisma needs a downloaded binary engine.
Don't swap it back.

## Layout

```
src/db/schema.ts              every table
src/lib/dal.ts                requirePortal() — the real auth check, called by every layout
src/lib/session.ts            signed cookie handling
src/lib/roles.ts              which roles may enter which portal
src/lib/qa.ts                 Q&A visibility rules (canSeeThread, teacherScope) and thread loading
src/lib/ai.ts                 Gemini calls: extract a question from voice/photo, screen + answer
src/lib/results.ts            result, merit-list and leaderboard queries
src/lib/uploads.ts            attachment storage on disk (UPLOAD_DIR), served by /api/files/[id]
src/lib/external/client.ts    paginated client for the BigBang API (students, course results)
src/lib/external/sync.ts      the import: upserts students, courses, enrollments, quotas
src/lib/external/results-sync.ts  results import + ranking (runs after the student import)
src/proxy.ts                  fast cookie-only route guard (Next 16 renamed middleware to proxy)
src/app/actions/              server actions: auth, admin, sync, qa, mentor
src/app/login                 student sign-in (/login)
src/app/teacher/login         teacher sign-in
src/app/admin/login           admin sign-in
src/app/student               student portal
src/app/teacher/(portal)      teacher portal
src/app/admin/(portal)        admin portal
```

Login pages sit outside the `(portal)` route groups on purpose — otherwise the auth
check in the layout would redirect them in a loop.

## Rules that must not be broken

1. **Never overwrite a student's chosen password during a data import.** They start
   with their phone number as the password and must change it at first login.
2. **Never delete records from the import.** Students removed upstream get
   `status: disabled`; enrollments that vanish become `status: dropped`.
3. **Every protected page calls `requirePortal()`.** `src/proxy.ts` is a fast first
   pass only — it reads the cookie and nothing else. The database check in the DAL is
   the real one.
4. **Disabling an account or resetting a password bumps `tokenVersion`**, which signs
   that user out everywhere. Keep that behaviour.
5. **Course-wide quota changes only touch students with an active enrollment.**
6. **Secrets live in `.env` only** — never in code, never in client components,
   never in a URL.
7. **Q&A visibility:** admins see everything, teachers see only their assigned courses
   (`teacher_courses`, narrowed by `teacher_subjects` when set), students see only their
   own threads. Check this on the server, in the page, not just in the query.
8. **Rolls are not unique people in BigBang.** Olympiad and regular programmes reuse
   roll ranges (~800 rolls belong to two different people). The results import only
   attaches a result when the name or phone matches the account; keep that check.

## Roles

`super_admin` (can create admins), `admin` (everything else), `teacher` (Q&A for
assigned courses only), `student`.

## Where the project is up to

Done: all three logins, first-login password change, admin password reset, the daily
import of students and results from BigBang, results with ranks and leaderboards,
student/course/teacher/admin management, quotas, Q&A (text, photo, voice; one AI
answer; rating; forward to a teacher; teacher replies with rating and follow-ups),
mentor session requests and scheduling.

Q&A flow: typed questions are screened and answered in one Gemini call. Photos and
voice notes are first turned into a written question the student confirms (status
`draft`), then answered. Off-topic messages are rejected without using the allowance.
Statuses: draft → awaiting_ai → ai_answered → (resolved | escalated → teacher_claimed →
answered → resolved / follow-up). Idle answered threads close after 7 days (cron).

Open: roll collisions across BigBang programmes (rule 8) make one portal account per
roll wrong for ~800 people; needs a decision on how students are identified.

## Commands

```
npm run dev        run locally
npm run build      must pass before anything is considered done
npm run db:push    apply schema changes
npm run db:studio  browse the database
npm run db:seed    create the admin account
npm run db:seed -- --demo   also a demo course, teacher and student
```

## Working style expected here

Run `npm run build` before claiming a change works. Test real flows in a browser where
it matters — several bugs in this project were only caught that way, not by type
checking. Prefer editing existing files over adding new ones. Keep comments for things
that aren't obvious from the code, and skip them where they are.
