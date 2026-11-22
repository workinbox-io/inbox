---
title: Self-hosting
description: Uruchom Work Inbox na własnym koncie Cloudflare, ze wszystkimi funkcjami i bez opłat dla nas.
section: Getting started
order: 3
updated: 2026-11-17
---

Work Inbox jest open source. W wersji self-hosted działa dla jednej firmy na jej własnym koncie Cloudflare: poczta, załączniki i
notatki zostają tam, a Ty płacisz Cloudflare za to, z czego korzystasz. Wszystkie funkcje są włączone; nie ma planów ani płatności.

## Self-hosted czy hostowany?

|                       | Self-hosted                                         | Hostowany (workinbox.io)                           |
| --------------------- | --------------------------------------------------- | -------------------------------------------------- |
| Gdzie są Twoje dane   | Twoje konto Cloudflare                              | Nasze konto Cloudflare                             |
| Koszt                 | To, co Cloudflare Ci naliczy (Workers Paid i zużycie) | Pierwsze 5 osób bezpłatnie, potem za osobę ([Cennik](/pl/pricing)) |
| Funkcje               | Każda aplikacja i funkcja, bez planów               | Zależnie od planu                                  |
| Domeny pocztowe       | Twoje własne domeny, na Cloudflare Email Routing    | Twoje własne domeny albo bezpłatna `<name>.workinbox.io` |
| IMAP i SMTP           | Uruchom most poczty samodzielnie (`infra/mail`)     | W cenie, pod adresem `mail.workinbox.io`           |
| Zakładanie kont       | Pierwsze konto, potem tylko zaproszone osoby        | Otwarte                                            |
| Aktualizacje i utrzymanie | Sam pobierasz i wdrażasz                        | Po naszej stronie                                  |

Wybierz self-hosted, gdy Twoja poczta musi zostać na Twoim koncie albo wolisz płacić Cloudflare niż nam; wybierz wersję hostowaną, gdy
chcesz, żeby działała bez dbania o serwery i aktualizacje. Przenoszenie między nimi działa przez
[import poczty](/pl/docs/quickstart) (.mbox).

## Czego potrzebujesz

- Konta Cloudflare w planie **Workers Paid** (kolejki i haszowanie haseł tego wymagają).
- Domeny pocztowej w Cloudflare albo możliwości ustawienia jej rekordów MX i TXT.
- Node 22.18 lub nowszego i pnpm.

## 1. Pobierz kod

```sh
git clone https://github.com/workinbox-io/inbox.git workinbox
cd workinbox
pnpm install
```

## 2. Utwórz zasoby Cloudflare

```sh
pnpm run setup
```

(`pnpm run setup`, a nie `pnpm setup`, które jest własnym poleceniem pnpm.) Pyta o adres Twojego Work Inbox, adres nadawcy
i Twój e-mail, a potem zapisuje je w `wrangler.jsonc`. Ustawia też `DEPLOY_MODE` na `"self"`, co wyłącza
płatności i włącza wszystkie funkcje, oraz usuwa trasę i ustawienia samego workinbox.io. Odpowiedz „y” na „create resources”,
a utworzy bazę D1, bucket R2 i cztery kolejki oraz zapisze identyfikator bazy w `wrangler.jsonc`.

## 3. Sekrety i ustawienia

```sh
wrangler secret put BETTER_AUTH_SECRET
```

`BETTER_AUTH_SECRET` to jedyny wymagany sekret (`openssl rand -hex 32`). Opcjonalne:

- `GOOGLE_CLIENT_ID` i `GOOGLE_CLIENT_SECRET` dla logowania przez Google.
- `VAPID_PUBLIC_KEY` i `VAPID_PRIVATE_KEY` (z `npx web-push generate-vapid-keys`) dla powiadomień push.

Pomiń wszystko dotyczące Paddle, AWS/SES i `MAIL_ZONE_TOKEN`: to tylko dla usługi hostowanej.

## 4. Wysyłanie poczty

Dodaj każdą domenę pocztową w **Cloudflare Email Service**, aby Work Inbox mógł z niej wysyłać, i ustaw `EMAIL_FROM_ADDRESS`
dla własnych wiadomości aplikacji (linki do logowania, resetowanie haseł). Jest wymagany: bez niego e-mail weryfikacyjny nigdy
nie dotrze i nikt nie dokończy zakładania konta.

## 5. Wdróż

```sh
pnpm run deploy
```

Buduje aplikację, stosuje migracje bazy danych i wdraża Worker. Dodaj swoją własną domenę do Workera w
panelu Cloudflare.

## 6. Odbieranie poczty

Dla każdej domeny pocztowej włącz **Email Routing** i dodaj **regułę catch-all** z akcją **Send to a Worker**,
wskazującą Twój Worker Work Inbox. Następnie załóż konto w swoim Work Inbox: pierwsze konto zostaje administratorem, a po nim rejestracja jest zamknięta. Dodaj swój
zespół w **Konsola administratora → Domeny i skrzynki → Dodaj osobę** albo zaproś osoby do organizacji. Dodaj domenę w **Konsola administratora → Domeny i skrzynki** i kliknij
**Sprawdź DNS**. Resztę opisuje [Szybki start](/pl/docs/quickstart).

## Aktualizowanie

Pobierz najnowszy kod i uruchom ponownie `pnpm run deploy`; migracje są stosowane w jego trakcie.
