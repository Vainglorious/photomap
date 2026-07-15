"use server";

import { redirect } from "next/navigation";

import { createSession, deleteSession, getSession } from "@/lib/dal";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  createUserWithPassword,
  getUserByEmail,
  isUsernameTaken,
  setUsername,
  UsernameTakenError,
} from "@/lib/users";
import { firstError, loginSchema, signupSchema, usernameSchema } from "@/lib/validation";

/**
 * Auth server actions. Each returns `{ error }` for the form to display, or calls
 * `redirect()` on success. `redirect()` throws a control-flow signal, so it must
 * stay outside any try/catch.
 */

export type AuthState = { error?: string } | undefined;

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const { email, password } = parsed.data;

  if (await getUserByEmail(email)) {
    return { error: "An account with that email already exists — try logging in." };
  }

  const passwordHash = await hashPassword(password);
  try {
    const user = await createUserWithPassword(email, passwordHash);
    await createSession({ userId: user.id, username: user.username });
  } catch {
    // Unique-violation race, or DB hiccup.
    return { error: "Could not create your account. Please try again." };
  }

  redirect("/welcome");
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const { email, password } = parsed.data;
  const user = await getUserByEmail(email);

  // Same message whether the email is unknown or the password is wrong.
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect email or password." };
  }

  await createSession({ userId: user.id, username: user.username });
  redirect(user.username ? `/${user.username}` : "/welcome");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/");
}

export async function chooseUsername(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const parsed = usernameSchema.safeParse(formData.get("username"));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const username = parsed.data;

  if (await isUsernameTaken(username)) return { error: "That username is taken." };

  let username_;
  try {
    const user = await setUsername(session!.userId, username);
    await createSession({ userId: user.id, username: user.username });
    username_ = user.username;
  } catch (e) {
    if (e instanceof UsernameTakenError) return { error: "That username is taken." };
    return { error: "Could not save your username. Please try again." };
  }

  redirect(`/${username_}`);
}
