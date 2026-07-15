import * as z from "zod";

/**
 * Form/input validation shared by server actions and API routes.
 * zod is already a dependency (see the Next.js auth guide).
 */

export const emailSchema = z.string().trim().toLowerCase().email({ message: "Enter a valid email." });

export const passwordSchema = z
  .string()
  .min(8, { message: "Use at least 8 characters." })
  .max(200, { message: "That password is too long." });

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  // Don't enforce complexity on login — just that something was typed.
  password: z.string().min(1, { message: "Enter your password." }),
});

/**
 * Usernames are the public handle in /<username>. Rules:
 *  - 3–12 characters (the product cap is 12)
 *  - lowercase letters, digits, underscore
 *  - not a reserved app path
 * Stored lowercased; matching is case-insensitive.
 */
export const USERNAME_MAX = 12;

/** Paths the router owns — these can never be usernames or /<username> breaks. */
export const RESERVED_USERNAMES = new Set([
  "api", "login", "signup", "logout", "welcome", "account", "settings",
  "admin", "about", "help", "support", "terms", "privacy", "explore",
  "map", "maps", "user", "users", "me", "new", "auth", "static", "public",
  "_next", "favicon", "robots", "sitemap", "assets", "images", "photos",
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, { message: "At least 3 characters." })
  .max(USERNAME_MAX, { message: `At most ${USERNAME_MAX} characters.` })
  .regex(/^[a-z0-9_]+$/, { message: "Only lowercase letters, numbers, and underscores." })
  .refine((u) => !RESERVED_USERNAMES.has(u), { message: "That username is reserved." });

/** First zod issue message, or a fallback. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}
