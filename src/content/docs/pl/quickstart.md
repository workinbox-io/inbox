---
title: Szybki start
description: Od założenia konta do poczty na własnej domenie.
section: Getting started
order: 2
updated: 2026-11-17
---

## 1. Załóż konto

[Załóż konto](/signup) przez e-mail lub Google. Każde konto hostowane zaczyna od bezpłatnego okresu próbnego, bez karty, a do pięciu osób pozostaje bezpłatne także po jego zakończeniu.

## 2. Dodaj domenę

Nie masz jeszcze domeny? W **Konsola administratora → Domeny i skrzynki** zajmij bezpłatny adres w rodzaju `twojanazwa.workinbox.io`: Work Inbox sam
ustawi jego rekordy, dostaniesz na nim skrzynkę, a poczta zacznie działać w kilka minut. Własną domenę możesz dodać później.

Otwórz **Konsola administratora → Domeny i skrzynki** i dodaj swoją domenę, na przykład `twojafirma.com`. Work Inbox pokaże listę potrzebnych rekordów DNS:

- rekord **MX**, aby poczta dla domeny trafiała do Work Inbox,
- trzy rekordy **DKIM** (CNAME) i dwa rekordy na `bounce.twojafirma.com`, aby wysyłana poczta była podpisana i dostarczana,
- rekord **DMARC** (TXT na `_dmarc`).

Dodaj je u swojego dostawcy DNS. Jeśli domena jest w Cloudflare, kliknij zamiast tego **Połącz z Cloudflare**: wklej token API
z uprawnieniami Zone Read i DNS Edit (link go tworzy), a Work Inbox doda rekordy za Ciebie; token jest użyty
jednorazowo i nie jest zapisywany. Przenosisz się od innego dostawcy poczty? Zaznacz „Zastąp obecne rekordy MX”. Kliknij **Sprawdź DNS**:
każdy rekord dostanie ptaszek, gdy tylko będzie widoczny, a wysyłanie ruszy po zweryfikowaniu rekordów DKIM.

W sekcji **Poczta na nieznane adresy** wybierz, czy poczta na adres, którego nikt nie ma, jest odrzucana, czy trafia do jednej skrzynki
(adres catch-all).

## 3. Dodaj osoby

W **Konsola administratora → Domeny i skrzynki → Dodaj osobę** podaj imię i nazwisko oraz adres w domenie. Osoba dostanie skrzynkę i
tymczasowe hasło, które pokażemy Ci tylko raz; zaloguje się i je zmieni. Później możesz je zresetować.

## 4. Udostępnij skrzynkę

Utwórz skrzynkę wspólną, na przykład `support@`, i wybierz jej członków. Właściciele i administratorzy widzą wszystkie skrzynki wspólne, członkowie
tylko te, do których dostali dostęp. Odpowiedzi wychodzą ze wspólnego adresu.

## 5. Napisz pierwszą wiadomość

Otwórz **Pocztę** i naciśnij `c` albo kliknij **Nowy e-mail**. Wybierz skrzynkę, z której wysyłasz, napisz wiadomość i wyślij. Poczta przychodząca na
domenę trafia teraz do właściwej skrzynki.

## 6. Przenieś starą pocztę

Wyeksportuj ją od dotychczasowego dostawcy: Google Takeout (wybierz Pocztę) daje plik `.mbox`; Outlook, Zoho i większość innych
eksportuje wiadomości jako pliki `.eml`. W **Konsola administratora → Domeny i skrzynki → Import poczty** wybierz skrzynkę i plik (albo wszystkie pliki
`.eml` naraz). Przesyłanie odbywa się w przeglądarce, a import w tle: wiadomości trafiają jako przeczytane, z oryginalnymi
datami i wątkami, a Twoja wysłana poczta jako wysłana. Z Gmaila to, co było w odebranych, zostaje w odebranych, reszta jest
zarchiwizowana, spam i kosz są pomijane. Ponowny import tego samego pliku niczego nie duplikuje.

Nie masz eksportu pod ręką? W **Konsola administratora → Domeny i skrzynki → Import poczty** możesz też podać adres IMAP starego serwera i hasło
aplikacji: poczta kopiuje się w tle, stara skrzynka zostaje nietknięta, a duplikaty są pomijane.

Nie chcesz jeszcze niczego przenosić? Każda osoba może podłączyć skrzynkę, którą już ma, w **Ustawienia → Programy
pocztowe → Konta zewnętrzne** (ustawienia IMAP i SMTP od dostawcy). Poczta synchronizuje się, czytasz i wysyłasz z Work
Inbox, a wiadomości dalej przychodzą do starego dostawcy; MX domeny przełączasz, kiedy zechcesz.
