/**
 * DATABASE SCHEMA
 * ---------------------------------------------------------------
 * Every table in the system is defined here. To change the database,
 * edit this file and run:   npm run db:push
 * ---------------------------------------------------------------
 */
import {
  pgTable, pgEnum, serial, integer, text, varchar, boolean,
  timestamp, jsonb, numeric, primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";

/* ---------- Enums (fixed lists of allowed values) ---------- */

export const roleEnum = pgEnum("role", ["student", "teacher", "admin", "super_admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "disabled"]);
export const courseStatusEnum = pgEnum("course_status", ["active", "archived"]);
export const enrollmentStatusEnum = pgEnum("enrollment_status", ["active", "dropped"]);

export const qaStatusEnum = pgEnum("qa_status", [
  "draft",            // media question extracted, waiting for the student to confirm the text
  "awaiting_ai",      // submitted, AI is working on it
  "ai_answered",      // AI replied, waiting for student to decide
  "escalated",        // student asked for an expert
  "teacher_claimed",  // a teacher picked it up
  "answered",         // teacher replied
  "resolved",         // student satisfied
  "closed_timeout",   // closed automatically after inactivity
]);
export const senderTypeEnum = pgEnum("sender_type", ["student", "ai", "teacher", "admin"]);
export const attachmentKindEnum = pgEnum("attachment_kind", ["image", "audio", "video", "file"]);

export const sessionStatusEnum = pgEnum("mentor_session_status", [
  "pending", "scheduled", "completed", "cancelled",
]);
export const syncKindEnum = pgEnum("sync_kind", ["students", "results"]);
export const syncStatusEnum = pgEnum("sync_status", ["running", "success", "partial", "failed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
    .$onUpdate(() => new Date()),
};

/* ---------- People ---------- */

/** Every account: students, teachers and admins all live here. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  role: roleEnum("role").notNull(),
  username: varchar("username", { length: 64 }).notNull().unique(), // roll number for students
  name: varchar("name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 160 }),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  // Bumped on password reset / disable, which logs the user out everywhere.
  tokenVersion: integer("token_version").default(0).notNull(),
  status: userStatusEnum("status").default("active").notNull(),
  // "import" when the daily import disabled the account, "admin" when a person did.
  // The import only re-enables accounts it disabled itself.
  disabledBy: varchar("disabled_by", { length: 10 }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("users_role_idx").on(t.role)]);

/** Extra details for students, mirrored from the external result website. */
export const students = pgTable("students", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  rollNo: varchar("roll_no", { length: 64 }).notNull().unique(),
  externalId: varchar("external_id", { length: 64 }).unique(), // ID on the source website
  batch: varchar("batch", { length: 80 }),
  institution: varchar("institution", { length: 200 }),
  meta: jsonb("meta").$type<Record<string, unknown>>(), // any extra fields from the source
  ...timestamps,
});

export const teachers = pgTable("teachers", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  bio: text("bio"),
  ...timestamps,
});

/* ---------- Courses & subjects ---------- */

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  externalId: varchar("external_id", { length: 64 }).unique(),
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 64 }),
  batch: varchar("batch", { length: 80 }),
  status: courseStatusEnum("status").default("active").notNull(),
  // Every student in this course starts with these allowances:
  defaultQaQuota: integer("default_qa_quota").default(20).notNull(),
  defaultSessionQuota: integer("default_session_quota").default(2).notNull(),
  leaderboardPublished: boolean("leaderboard_published").default(true).notNull(),
  // Shown to students under "Available courses" while the course is active.
  listed: boolean("listed").default(true).notNull(),
  resultsSyncedAt: timestamp("results_synced_at", { withTimezone: true }),
  ...timestamps,
});

/** Subjects are shared across courses (e.g. "Physics"), so teachers can be assigned once. */
export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  ...timestamps,
});

export const courseSubjects = pgTable("course_subjects", {
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.courseId, t.subjectId] })]);

export const teacherSubjects = pgTable("teacher_subjects", {
  teacherId: integer("teacher_id").notNull().references(() => teachers.userId, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.teacherId, t.subjectId] })]);

/** Which courses a teacher answers questions for. This is the Q&A visibility boundary. */
export const teacherCourses = pgTable("teacher_courses", {
  teacherId: integer("teacher_id").notNull().references(() => teachers.userId, { onDelete: "cascade" }),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.teacherId, t.courseId] })]);

export const enrollments = pgTable("enrollments", {
  studentId: integer("student_id").notNull().references(() => students.userId, { onDelete: "cascade" }),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  status: enrollmentStatusEnum("status").default("active").notNull(),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.studentId, t.courseId] })]);

/** How many questions / mentor sessions a student has left in a course. */
export const quotas = pgTable("quotas", {
  studentId: integer("student_id").notNull().references(() => students.userId, { onDelete: "cascade" }),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  qaRemaining: integer("qa_remaining").default(0).notNull(),
  sessionRemaining: integer("session_remaining").default(0).notNull(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (t) => [primaryKey({ columns: [t.studentId, t.courseId] })]);

/* ---------- Results ---------- */

export const exams = pgTable("exams", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  externalId: varchar("external_id", { length: 64 }),
  title: varchar("title", { length: 200 }).notNull(),
  examDate: timestamp("exam_date", { withTimezone: true }),
  // Null when BigBang has no full mark recorded for that part.
  fullMcqMark: numeric("full_mcq_mark", { precision: 8, scale: 2, mode: "number" }),
  fullWrittenMark: numeric("full_written_mark", { precision: 8, scale: 2, mode: "number" }),
  totalMarks: numeric("total_marks", { precision: 8, scale: 2, mode: "number" }),
  published: boolean("published").default(true).notNull(),
  // The exam no longer comes back from BigBang. Kept, but hidden from students.
  removedUpstream: boolean("removed_upstream").default(false).notNull(),
  ...timestamps,
}, (t) => [uniqueIndex("exams_course_external_uq").on(t.courseId, t.externalId)]);

export const results = pgTable("results", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.userId, { onDelete: "cascade" }),
  marks: numeric("marks", { precision: 8, scale: 2, mode: "number" }), // MCQ + written
  mcqMark: numeric("mcq_mark", { precision: 8, scale: 2, mode: "number" }),
  writtenMark: numeric("written_mark", { precision: 8, scale: 2, mode: "number" }),
  satMcq: boolean("sat_mcq").default(false).notNull(),
  satWritten: boolean("sat_written").default(false).notNull(),
  correct: integer("correct"),
  incorrect: integer("incorrect"),
  skipped: integer("skipped"),
  questions: integer("questions"),
  absent: boolean("absent").default(false).notNull(),
  // No longer reported by BigBang (usually a corrected roll). Hidden and unranked.
  withdrawn: boolean("withdrawn").default(false).notNull(),
  // Subject / section breakdown, e.g. { "Physics": 18, "Chemistry": 22, correct: 40, wrong: 5 }
  breakdown: jsonb("breakdown").$type<Record<string, unknown>>(),
  rank: integer("rank"),
  percentile: numeric("percentile", { precision: 5, scale: 2, mode: "number" }),
  ...timestamps,
}, (t) => [
  uniqueIndex("results_exam_student_uq").on(t.examId, t.studentId),
  index("results_student_idx").on(t.studentId),
  index("results_exam_idx").on(t.examId),
]);

/* ---------- Q&A ---------- */

export const qaThreads = pgTable("qa_threads", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.userId, { onDelete: "cascade" }),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
  topic: varchar("topic", { length: 200 }),
  // The question as the AI understood it (and the student confirmed): what gets answered.
  question: text("question"),
  status: qaStatusEnum("status").default("awaiting_ai").notNull(),
  quotaCharged: boolean("quota_charged").default(false).notNull(),
  // Set when the AI tutor couldn't handle the question: "unclear" (couldn't read or hear it)
  // or "off_topic". The student can then send it to a teacher instead; nothing is thrown away.
  aiVerdict: varchar("ai_verdict", { length: 20 }),
  aiNote: text("ai_note"),
  teacherId: integer("teacher_id").references(() => teachers.userId, { onDelete: "set null" }),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  hidden: boolean("hidden").default(false).notNull(), // admin moderation
  ...timestamps,
}, (t) => [
  index("qa_threads_status_idx").on(t.status),
  index("qa_threads_student_idx").on(t.studentId),
  index("qa_threads_course_idx").on(t.courseId),
]);

export const qaMessages = pgTable("qa_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => qaThreads.id, { onDelete: "cascade" }),
  senderType: senderTypeEnum("sender_type").notNull(),
  senderId: integer("sender_id").references(() => users.id, { onDelete: "set null" }), // null for AI
  body: text("body"),
  // AI bookkeeping: model used and token counts, so cost per question is measurable.
  aiMeta: jsonb("ai_meta").$type<Record<string, unknown>>(),
  // The student's rating of an AI or teacher reply, 1-5.
  rating: integer("rating"),
  ratingNote: text("rating_note"),
  ratedAt: timestamp("rated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("qa_messages_thread_idx").on(t.threadId)]);

export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => qaMessages.id, { onDelete: "cascade" }),
  kind: attachmentKindEnum("kind").notNull(),
  storageKey: text("storage_key").notNull(), // path of the file in cloud storage
  mime: varchar("mime", { length: 100 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  durationSec: integer("duration_sec"),
  // For voice notes: the transcript the student confirmed before sending.
  transcript: text("transcript"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ---------- Mentor sessions ---------- */

export const mentorSessions = pgTable("mentor_sessions", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.userId, { onDelete: "cascade" }),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
  topic: varchar("topic", { length: 200 }).notNull(),
  problem: text("problem").notNull(),
  preferredTime: varchar("preferred_time", { length: 200 }),
  contactPhone: varchar("contact_phone", { length: 20 }),
  quotaCharged: boolean("quota_charged").default(false).notNull(),
  status: sessionStatusEnum("status").default("pending").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  // Set when the mentor is one of our teachers; they then see it under "Assigned sessions".
  mentorTeacherId: integer("mentor_teacher_id").references(() => users.id, { onDelete: "set null" }),
  mentorName: varchar("mentor_name", { length: 160 }),
  mentorPhone: varchar("mentor_phone", { length: 20 }),
  adminMessage: text("admin_message"),
  respondedBy: integer("responded_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (t) => [
  index("mentor_sessions_status_idx").on(t.status),
  index("mentor_sessions_teacher_idx").on(t.mentorTeacherId),
]);

/** Photos a student attaches to a mentor request, showing where they're stuck. */
export const mentorAttachments = pgTable("mentor_attachments", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => mentorSessions.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  mime: varchar("mime", { length: 100 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("mentor_attachments_session_idx").on(t.sessionId)]);

/* ---------- Staff tools ---------- */

/** Links to the office's other software (OMR scanner, report generator...). Never shown to students. */
export const staffLinks = pgTable("staff_links", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 120 }).notNull(),
  url: text("url").notNull(),
  description: text("description"),
  // "staff" = admins and teachers, "admins" = admins only
  audience: varchar("audience", { length: 10 }).default("staff").notNull(),
  position: integer("position").default(0).notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

/* ---------- System ---------- */

/** Everything configurable from the admin panel (quotas, AI prompt, templates...). */
export const settings = pgTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  kind: syncKindEnum("kind").default("students").notNull(),
  status: syncStatusEnum("status").default("running").notNull(),
  trigger: varchar("trigger", { length: 20 }).default("schedule").notNull(), // schedule | manual
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  created: integer("created").default(0).notNull(),
  updated: integer("updated").default(0).notNull(),
  failed: integer("failed").default(0).notNull(),
  log: jsonb("log").$type<unknown[]>(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(), // e.g. "password.reset"
  entity: varchar("entity", { length: 60 }),
  entityId: varchar("entity_id", { length: 64 }),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: varchar("ip", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("audit_logs_created_idx").on(t.createdAt)]);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 60 }).notNull(),
  payload: jsonb("payload"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("notifications_user_idx").on(t.userId)]);

export type Role = (typeof roleEnum.enumValues)[number];
