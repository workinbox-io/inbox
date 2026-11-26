import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Before the React island hydrates (slow network, a blocked chunk), a form submits natively.
// GET would put the password in the URL, browser history and server logs; POST keeps it in the body.
describe("auth forms", () => {
  for (const file of ["auth-form.tsx", "password-forms.tsx"]) {
    it(`${file}: every <form> posts`, () => {
      const forms = readFileSync(new URL(`../src/components/auth/${file}`, import.meta.url), "utf8").match(/<form\b[^>]*/g) ?? [];
      expect(forms.length).toBeGreaterThan(0);
      for (const f of forms) expect(f).toContain('method="post"');
    });
  }
});
