Dashboard dictionaries: `<area>/<code>.ts`, each a default export `Record<string, string>` from the English text
to its translation (`t("Save changes")` in lib/i18n/panel.ts). Add the code to `src/config/languages.ts` first.
Keys may carry a context (`"mail|Inbox"`) and plural forms (`"{n} items|few"`, see `tp()`).
