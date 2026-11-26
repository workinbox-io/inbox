/**
 * Who may create an account. Hosted (cloud) sign-up is open; a self-hosted instance takes its first user (the admin)
 * and after that only people invited to an org. Admins add the rest in Admin → People → Add person.
 */
export function signUpAllowed(mode: string | undefined, hasUsers: boolean, invited: boolean) {
  return mode !== "self" || !hasUsers || invited;
}

/** Where to go after signing in: a path on this site only. Browsers read `/\x` and `/<tab>/x` as another host. */
export const safeNext = (next: string | null | undefined) => (next && /^\/(?!\/)[^\\\x00-\x1f]*$/.test(next) ? next : "/app");
