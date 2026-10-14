# Student Portal — setup on Ubuntu

Everything below is copy-paste. Total time: about 10 minutes.

---

## 1. Install Node.js 22

Ubuntu's default Node is too old, so install the current version:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v      # should print v22.x.x
```

## 2. Install PostgreSQL

For development, run the database on your own machine — free, and it works offline:

```bash
sudo apt install -y postgresql
sudo systemctl start postgresql
sudo systemctl enable postgresql        # start automatically after reboot

sudo -u postgres psql -c "CREATE USER portal WITH PASSWORD 'portal' CREATEDB;"
sudo -u postgres createdb -O portal portal
```

You now have a database at `postgresql://portal:portal@localhost:5432/portal`.

## 3. Unpack the project

```bash
unzip student-portal.zip
cd student-portal
npm install
```

## 4. Create your settings file

```bash
cp .env.example .env
```

Open `.env` in a text editor and set these four values:

```
DATABASE_URL=postgresql://portal:portal@localhost:5432/portal
SESSION_SECRET=<paste the output of the command below>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<pick a password, at least 8 characters>
```

Generate the session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`.env` holds your passwords and is never committed to Git.

## 5. Create the tables and the first accounts

```bash
npm run db:push              # creates all 19 tables
npm run db:seed -- --demo    # creates your admin + demo course, teacher, student
```

Leave off `--demo` later when you set up the real server — it then creates only the admin.

## 6. Run it

```bash
npm run dev
```

Open http://localhost:3000

---

## Accounts to try

| Portal | Address | Username | Password |
|---|---|---|---|
| Student | `/login` | `240101` | `01711000000` (the phone number) |
| Teacher | `/teacher/login` | `demo.teacher` | `teacher123` |
| Admin | `/admin/login` | whatever you set | whatever you set |

Sign in as the student first — it asks you to choose a new password, exactly as a real student will experience on day one.

---

## Commands you'll use

| Command | What it does |
|---|---|
| `npm run dev` | Run the site while developing |
| `npm run build` | Check everything compiles before deploying |
| `npm run db:push` | Apply schema changes after editing `src/db/schema.ts` |
| `npm run db:studio` | Browse and edit the database in your browser |
| `npm run db:seed` | Create the admin account (safe to re-run) |

---

## Where things live

```
src/db/schema.ts          Every table. Edit here, then run npm run db:push
src/lib/session.ts        Login cookies
src/lib/dal.ts            The security check every page runs
src/lib/roles.ts          Which roles may enter which portal
src/proxy.ts              Fast route guard before every page
src/app/actions/auth.ts   Sign in, sign out, change password
src/app/login             Student sign in
src/app/student           Student portal
src/app/teacher           Teacher portal
src/app/admin             Admin portal
src/components            Shared pieces used across screens
scripts/seed.ts           Creates the first accounts
```

---

## If something goes wrong

**`ECONNREFUSED` or "database does not exist"**
Postgres isn't running: `sudo systemctl start postgresql`

**`SESSION_SECRET is missing or too short`**
You skipped step 4. The secret needs 32+ characters.

**`password authentication failed for user "portal"`**
Re-run the two `sudo -u postgres` commands from step 2.

**Port 3000 already in use**
`npm run dev -- -p 3001`

**Fonts look plain**
The page loads Bangla fonts from Google. Check your internet connection.

---

# Phase 1 — connecting the result website

Add three lines to your `.env`, then restart (`Ctrl+C`, then `npm run dev`):

```
EXTERNAL_STUDENT_API_BASE_URL=https://the-result-website-domain
EXTERNAL_STUDENT_API_KEY=your-api-key
CRON_SECRET=any-long-random-string
```

Generate the cron secret the same way as the session one:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Then sign in as admin and open **Data import**. Press **Import now**.

## What the import does

- Creates an account for every student it finds. Username is the roll number, first password is the phone number, and they must choose a new one on first login.
- Creates courses and enrollments, and gives each new enrollment that course's default allowances.
- Runs again later reading only what changed, so a daily update takes seconds.
- Never touches a password a student has chosen.
- Disables accounts for students removed upstream, and ends enrollments that disappear. Nothing is ever deleted.
- Reports students who arrived without a phone number — they have no usable password and need an admin reset.
- Skips records it can't read, imports the rest, and shows you which ones failed and why.
- If the result website is unreachable, the import fails without changing any data, and the failure is recorded.

Tick **"Read everything, not just what changed"** to force a full re-read. Do that weekly; only a full read can notice that an enrollment has ended.

## Running it automatically

Once the site is deployed, have the host call this once a day:

```
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://yoursite/api/cron/sync
```

Add `?full=1` for the weekly full read. Without the correct secret the URL returns 401.
