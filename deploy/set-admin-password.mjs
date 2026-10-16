// Sets a new password for every super admin and signs them out everywhere.
// Run on the server: NEW_PASS=... node --env-file=.env deploy/set-admin-password.mjs
import pg from "pg";
import bcrypt from "bcryptjs";

const pass = process.env.NEW_PASS;
if (!pass || pass.length < 12) throw new Error("NEW_PASS must be at least 12 characters");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(
  "update users set password_hash = $1, must_change_password = false, token_version = token_version + 1 where role = 'super_admin' returning username",
  [await bcrypt.hash(pass, 10)],
);
console.log("super admin password set for:", r.rows.map((x) => x.username).join(", "));
await pool.end();
