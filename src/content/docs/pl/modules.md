---
title: Aplikacje i własne moduły
description: Włączaj i wyłączaj aplikacje, buduj własne listy bez kodu albo dodaj moduł w kodzie do self-hosted Work Inbox.
section: Guides
order: 5
updated: 2026-11-17
---

Work Inbox to zestaw aplikacji (Poczta, Czat, Notatki, Kalendarz, Dysk, Kontakty i Kolekcje), które dzielą te same osoby,
logowanie, wyszukiwanie, wzmianki @ i aplikacje AI. Możesz go dopasować na trzy sposoby, od bez kodu do kodu.

## Włączanie i wyłączanie aplikacji

Właściciele i administratorzy wybierają aplikacje w **Konsola administratora → Aplikacje**. Poczta jest zawsze włączona. Wyłączona aplikacja znika
z paska aplikacji, paska bocznego i ⌘K, jej strony i API odpowiadają 404, jej narzędzia znikają z [serwera MCP](/pl/docs/mcp), a
linki do niej (publiczne linki do plików i notatek, kanał kalendarza, wzmianki @) przestają działać. Jej dane zostają: włącz ją ponownie,
a wszystko będzie na swoim miejscu. Aplikacje AI mogą zrobić to samo przez `workspace_apps_list` i `workspace_app_set`.

## Buduj własne listy (bez kodu)

Większość „brakujących modułów” to listy z polami: ewidencja sprzętu, magazyn, prosty CRM, tablica zadań, dostawcy,
kandydaci do pracy. Zrobisz je w **Kolekcjach**, na każdym planie, hostowanym i self-hosted:

- **Zacznij** od szablonu (Transakcje, Sprzęt, Magazyn, Zadania), od zera albo od arkusza: plik CSV z Excela
  lub Arkuszy Google staje się kolekcją, z typami pól odgadniętymi na podstawie kolumn.
- **Pola**: tekst, liczba, data, wybór, pole wyboru, osoba, link i e-mail. Pole wyboru zamienia listę w
  tablicę, na której przeciągasz karty.
- **Udostępnianie**: każda kolekcja jest tylko dla Ciebie, dla wybranych osób (do podglądu lub edycji) albo dla całego zespołu.
- **Automatyzacje**: gdy rekord zostanie dodany lub pole się zmieni (na wartość), wyślij e-mail do osób z organizacji albo napisz
  na kanale czatu.
- **Wszędzie indziej**: wzmianki @ o rekordach na czacie i w poczcie, import i eksport CSV oraz praca z rekordami z Claude lub
  ChatGPT (`collections_list`, `collection_records_search`, `collection_record_create` i inne, zob.
  [Aplikacje AI](/pl/docs/mcp)) albo przez [API](/pl/docs/api) (`/api/v1/collections`).

## Dodaj moduł w kodzie (self-hosted)

Gdy lista nie wystarcza (własne ekrany, reguły lub integracje), self-hosted Work Inbox może rozbudować się o moduł w kodzie.
Kod źródłowy jest otwarty ([github.com/workinbox-io/inbox](https://github.com/workinbox-io/inbox)), a każda aplikacja jest zbudowana
tak samo, więc nowa idzie śladem istniejących. **Kontakty** to najmniejszy kompletny przykład do skopiowania; plik
`CLAUDE.md` w repozytorium opisuje każdą aplikację i służy jako brief dla agentów programistycznych.

Moduł o nazwie `assets` (wybierz własną) dotyka tych miejsc:

1. **Zarejestruj go**: dodaj `"assets"` do `OPTIONAL_MODULES` w `src/config/modules.ts`. Samo to daje mu przełącznik
   włącz/wyłącz w Ustawieniach oraz odpowiedzi 404 na `/app/assets`, `/api/app/assets` i `/api/v1/assets`, gdy jest wyłączony.
2. **Nawigacja**: wpis w `WORKSPACE_NAV` w `src/config/nav.ts`, z ikoną Lucide.
3. **Tabele**: `src/db/schema/assets.ts`, eksportowane z `src/db/schema/app.ts`; każda tabela ma `org_id`. Uruchom
   `pnpm db:generate`, aby wygenerować migrację, i `pnpm db:migrate`, aby zastosować ją lokalnie.
4. **Logika**: reguły niewymagające bazy danych w `src/lib/assets/*` z testami w `test/assets.test.ts`; zapytania w
   `src/lib/server/assets.ts`, zawsze ograniczone do organizacji (i do osoby, jeśli elementy są udostępniane).
5. **API**: trasy w `src/pages/api/app/assets/` owinięte w `handler()` lub `manageHandler()`
   (`src/lib/server/api.ts`), treści sprawdzane przez `parseBody()` ze schematem zod, zmiany zapisywane przez `audit()`
   (dodaj akcję do `src/config/audit.ts`). Trasy, które mają być publiczne, wyeksportuj ponownie z `src/pages/api/v1/assets/`.
6. **Ekran**: dodaj `"assets"` do `APP_SCREENS` i `WORKSPACE` w `src/lib/app-routes.ts`, przypadek w loaderze (oraz id w
   przekierowaniu dla nieznanych adresów) w `src/lib/server/app-page.ts`, a ekran w `src/components/app/panel-router.tsx`. Zbuduj komponent ze
   zestawu workspace w `src/components/workspace/` (pasek, lista, widok dzielony, menu wierszy), aby wyglądał jak pozostałe aplikacje.
7. **Aplikacje AI**: `src/mcp/assets.ts` eksportujący `McpModule`, którego `name` to id modułu (`"assets"`), dodany do
   `appModules` w `src/mcp/app.ts`. Narzędzia to opakowania `defineTool()` wokół Twoich funkcji z `lib/server`; zmiany używają
   `scope: "write"`. Przy tym samym `name` wyłączenie modułu usuwa jego narzędzia.
8. **Opcjonalnie**: sekcja na stronie ustawień (`src/components/settings/settings-page.tsx`), rodzaj
   wzmianek @ (`src/lib/mentions.ts`), zadania w kolejce (`src/jobs/app.ts`).

Sprawdź go przez `pnpm typecheck`, `pnpm test` i `pnpm dev`, a potem wdróż jak w [Self-hostingu](/pl/docs/self-host). Trzymaj
moduł w osobnych plikach, gdzie się da: aktualizacje z głównego repozytorium scalą się wtedy z niewieloma konfliktami.

W wersji hostowanej na workinbox.io moduły w kodzie nie są dostępne: użyj zamiast tego Kolekcji, [API](/pl/docs/api) lub aplikacji AI.
