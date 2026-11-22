---
title: Programy pocztowe (IMAP i SMTP)
description: Czytaj i wysyłaj pocztę z Work Inbox w Apple Mail, Outlooku, Thunderbirdzie lub aplikacji pocztowej na telefonie.
section: Guides
order: 4
updated: 2026-11-17
---

Każda skrzynka, którą możesz otworzyć w Work Inbox, czyli Twoja własna i udostępnione Ci skrzynki wspólne, działa też w zwykłej aplikacji
pocztowej przez IMAP (odbieranie) i SMTP (wysyłanie).

## Połącz urządzenie

1. Otwórz **Ustawienia → Programy pocztowe** i wybierz **Połącz urządzenie**.
2. Zaznacz skrzynki, które chcesz mieć na tym urządzeniu (własną i wspólne), i wybierz **Dalej**. Za pierwszym razem
   Work Inbox przygotuje Twoje istniejące wiadomości dla aplikacji pocztowych; w dużej skrzynce chwilę to potrwa.
3. Dokończ na urządzeniu:
   - **iPhone, iPad lub Mac**: wybierz **Zainstaluj na tym urządzeniu** i otwórz pobrany profil (na Macu: Ustawienia
     systemowe → Profile; na iPhonie: Ustawienia → Pobrano profil). Każda wybrana skrzynka pojawi się w Apple Mail.
   - **Inne urządzenia**: wybierz **Pokaż ustawienia i hasła**. W aplikacji pocztowej dodaj konto, podając adres skrzynki
     i jej hasło. Thunderbird, Outlook i większość aplikacji na telefon same znajdą serwery.

Hasła są pokazywane tylko raz, a każda skrzynka ma własne. Profil je zawiera, więc nie udostępniaj tego pliku.

Jeśli aplikacja pyta o serwery:

| | Serwer | Port | Zabezpieczenia |
|---|---|---|---|
| Poczta przychodząca (IMAP) | `mail.workinbox.io` | 993 | SSL/TLS |
| Poczta wychodząca (SMTP) | `mail.workinbox.io` | 465 | SSL/TLS |

Nazwą użytkownika jest adres skrzynki, w obu przypadkach.

## Warto wiedzieć

- **Jedno hasło na urządzenie i skrzynkę.** Unieważnij je w **Urządzenia** przy skrzynce, a urządzenie przestanie się
  synchronizować; Twoje hasło do logowania nigdy nie jest używane przez aplikacje pocztowe.
- **Samodzielne wyszukiwanie serwerów** działa na własnej domenie organizacji, gdy dodasz opcjonalne rekordy CNAME
  `autoconfig` i SRV `_autodiscover._tcp` (lista w Konsola administratora → Domeny i skrzynki; „Connect Cloudflare” doda je sam).
- **Ta sama poczta co w aplikacji webowej.** Czytaj, oznaczaj gwiazdką i przenoś w aplikacji, a Work Inbox za tym nadąży. Folderami i etykietami zarządzaj w
  Work Inbox. Wersje robocze też są wspólne: zaczęta w Work Inbox pojawia się w folderze Wersje robocze w ciągu pół
  minuty i odwrotnie, wysłanie lub odrzucenie po jednej stronie usuwa ją po drugiej, a gdy obie strony zmienią tę samą
  wersję naraz, zostają obie. Wersja edytowana w aplikacji pocztowej wraca jako zwykły tekst.
- **Wysyłanie** odbywa się przez Work Inbox, więc obowiązują jego limity wysyłania i rozmiar wiadomości do 10 MB. Osoby usunięte z
  organizacji tracą dostęp na każdym urządzeniu.
- **Wyłączanie**: Odłącz unieważnia wszystkie hasła urządzeń dla tej skrzynki; skrzynka zostaje w Work Inbox.
- **Self-hosted**: IMAP i SMTP wymagają opcjonalnego mostu poczty, czyli małego serwera Docker obok Twojego konta Cloudflare
  (`infra/mail` i `services/mail-bridge` w repozytorium). Bez niego pocztę czyta się i wysyła w aplikacji webowej.
