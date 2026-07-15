import { sql } from "./db";

/**
 * User records in Postgres. A user may sign in with a password, with Google, or
 * both (linked by matching email). `username` is null until picked in /welcome.
 *
 * Queries use the parameterised `sql.query(text, params)` form (not the tagged
 * template) so the shared column list can be reused — the Neon HTTP driver turns
 * template interpolations into bound params, so it can't compose SQL fragments.
 * Values still go through `$1, $2…`, so this is injection-safe.
 */

export interface User {
  id: string;
  email: string;
  passwordHash: string | null;
  googleSub: string | null;
  username: string | null;
  name: string | null;
  image: string | null;
}

/** Selected explicitly so we never return more of the row than needed. */
const COLS = `id, email, password_hash as "passwordHash", google_sub as "googleSub", username, name, image`;

export async function getUserById(id: string): Promise<User | null> {
  const rows = (await sql.query(`select ${COLS} from users where id = $1 limit 1`, [id])) as User[];
  return rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = (await sql.query(`select ${COLS} from users where email = $1 limit 1`, [email.toLowerCase()])) as User[];
  return rows[0] ?? null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const rows = (await sql.query(`select ${COLS} from users where username = $1 limit 1`, [
    username.toLowerCase(),
  ])) as User[];
  return rows[0] ?? null;
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const rows = (await sql.query(`select 1 from users where username = $1 limit 1`, [
    username.toLowerCase(),
  ])) as unknown[];
  return rows.length > 0;
}

export async function createUserWithPassword(email: string, passwordHash: string): Promise<User> {
  const rows = (await sql.query(
    `insert into users (email, password_hash) values ($1, $2) returning ${COLS}`,
    [email.toLowerCase(), passwordHash],
  )) as User[];
  return rows[0];
}

/**
 * Sign in / register via Google. Links to an existing account by email when one
 * exists (so password-first users can later use Google), otherwise creates one.
 */
export async function upsertGoogleUser(profile: {
  googleSub: string;
  email: string;
  name: string | null;
  image: string | null;
}): Promise<User> {
  const email = profile.email.toLowerCase();

  // Already linked to this Google account?
  const linked = (await sql.query(`select ${COLS} from users where google_sub = $1 limit 1`, [
    profile.googleSub,
  ])) as User[];
  if (linked[0]) return linked[0];

  // Same email from a password signup → link Google onto it.
  const byEmail = await getUserByEmail(email);
  if (byEmail) {
    const rows = (await sql.query(
      `update users
         set google_sub = $1,
             name  = coalesce(name, $2),
             image = coalesce(image, $3)
       where id = $4
       returning ${COLS}`,
      [profile.googleSub, profile.name, profile.image, byEmail.id],
    )) as User[];
    return rows[0];
  }

  const rows = (await sql.query(
    `insert into users (email, google_sub, name, image) values ($1, $2, $3, $4) returning ${COLS}`,
    [email, profile.googleSub, profile.name, profile.image],
  )) as User[];
  return rows[0];
}

/** Thrown when a username is already taken (unique violation) at set time. */
export class UsernameTakenError extends Error {
  constructor() {
    super("That username is already taken.");
    this.name = "UsernameTakenError";
  }
}

export async function setUsername(userId: string, username: string): Promise<User> {
  try {
    const rows = (await sql.query(`update users set username = $1 where id = $2 returning ${COLS}`, [
      username.toLowerCase(),
      userId,
    ])) as User[];
    return rows[0];
  } catch (e) {
    // 23505 = unique_violation: lost the race for this handle.
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "23505") {
      throw new UsernameTakenError();
    }
    throw e;
  }
}
