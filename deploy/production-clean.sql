-- Run once on the production database right after copying it from development.
-- Removes demo accounts and everything created while testing; keeps real students,
-- courses, results, staff accounts, assignments, settings and staff links.
begin;
delete from qa_threads;          -- messages and attachments go with them
delete from mentor_sessions;     -- and their photos
delete from notifications;
delete from audit_logs;
delete from sync_runs;
delete from users where username in ('demo.admin', 'demo.teacher');
delete from users where role = 'student' and id in (select user_id from students where institution = 'Demo Branch');
delete from courses where external_id like 'DEMO-%';
-- Everyone starts with the fixed allowance.
update quotas set qa_remaining = 20, session_remaining = 2, updated_by = null;
update courses set default_qa_quota = 20;
-- Force the next import to read everything from BigBang.
delete from settings where key = 'sync.students.last_success';
commit;
