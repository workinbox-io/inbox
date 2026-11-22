---
title: Kalendarz
description: Kalendarze zespołu, zaproszenia, strefy czasowe, dostępność i link do subskrypcji.
section: Guides
order: 3
updated: 2026-11-17
---

Otwórz **Kalendarz** z paska aplikacji. Każdy ma własny kalendarz; w lewej kolumnie możesz dodać kolejne (na przykład „Święta”) i udostępniać je jak notatki: prywatnie, wybranym osobom (do podglądu lub edycji) albo całemu zespołowi.

Wybierz **Rok**, aby zobaczyć przegląd dwunastu miesięcy z wyróżnionym dzisiejszym dniem. Kliknij miesiąc lub datę, aby otworzyć
wydarzenia z tego miesiąca. Strzałki przełączają między latami; **Dziś** wraca do bieżącego roku.

## Skróty

| Klawisz | Działanie |
| --- | --- |
| `c` | Nowe wydarzenie |
| `t` | Dziś |
| `j` / `k` lub `←` / `→` | Następny / poprzedni dzień, tydzień, miesiąc lub rok |
| `d` / `w` / `m` / `y` | Widok dnia, tygodnia, miesiąca, roku |
| `a` | Wybierz wolne terminy do udostępnienia |
| `/` | Pokaż kalendarz współpracownika obok swojego |
| `Enter` / `Esc` | Otwórz / zamknij wydarzenie |
| `⌫` | Usuń zaznaczone wydarzenie |

Przeciągnij w siatce, aby utworzyć wydarzenie, przeciągnij wydarzenie, aby je przenieść, a jego dolną krawędź, aby zmienić czas trwania.
Nowe wydarzenia otwierają się w zadokowanym oknie jak nowa wiadomość: zminimalizuj je, gdy wybierasz termin, albo rozwiń, aby uzupełnić
szczegóły. Zminimalizowanie zachowuje formularz; zamknięcie wypełnionego wydarzenia pyta przed odrzuceniem zmian.

## Wydarzenia cykliczne

Wybierz powtarzanie w panelu wydarzenia. Zmiana lub usunięcie jednego wystąpienia pyta, czy dotyczy **tego wydarzenia**,
**tego i kolejnych** czy **wszystkich wydarzeń**. Godziny są liczone w strefie czasowej wydarzenia, więc spotkanie o 9:00 zostaje o 9:00 po
zmianie czasu.

## Zaproszenia

Dodaj osoby w polu **Goście**. Współpracownicy od razu widzą wydarzenie w swoim kalendarzu i odpowiadają tam. Osoby spoza
Twojej organizacji dostają zaproszenie e-mailem z Twojej skrzynki, które Gmail, Outlook i Apple Mail pokazują z przyciskami
Przyjmij / Odrzuć; ich odpowiedzi aktualizują listę gości. Zmiany i odwołania docierają do nich w ten sam sposób.

Zaproszenia, które dostajesz z Google lub Outlooka, trafiają do Twojego kalendarza jako „bez odpowiedzi”, a wiadomość pokazuje
przyciski Przyjmij, Może i Odrzuć.

## Strefy czasowe i współpracownicy

W ustawieniach kalendarza wybierz swoją strefę czasową i do dwóch dodatkowych: pokazują się obok siebie przy godzinach.
Otwórz **Ustawienia kalendarza** z zębatki na pasku narzędzi, aby wybrać zegar **24-godzinny** lub **12-godzinny**.
Preferencja jest zapisywana na Twoim koncie i obowiązuje w siatce, etykietach wydarzeń, godzinach wschodu i zachodu słońca oraz skopiowanej dostępności.
Dodaj współpracownika w sekcji **Osoby**, aby zobaczyć jego kalendarz nad swoim; wydarzenia, których nie możesz otworzyć, są pokazane jako zajęte.

## Udostępnianie dostępności

Naciśnij `a` lub wybierz **Dostępność**. W widoku miesiąca lub roku otworzy to siatkę tygodnia. Kliknij, aby zaznaczyć 30 minut, albo przeciągnij,
aby zaznaczyć dłuższy zakres. Zajęte wydarzenia w widocznych kalendarzach (także nałożonych kalendarzach współpracowników) są wykluczone;
wydarzenia oznaczone jako wolne, wydarzenia odwołane i zaproszenia odrzucone przez Ciebie nie blokują zaznaczenia.

Nakładające się lub sąsiadujące zaznaczenia łączą się. Przechodź między dniami lub tygodniami, aby dodać kolejne terminy. Kliknij zaznaczony blok
lub jego przycisk w zadokowanym oknie Dostępności, aby go usunąć, albo **Wyczyść**, aby zacząć od nowa. Okno można zminimalizować do dolnej zakładki, gdy zaznaczasz kolejne terminy. Pokazuje podgląd dokładnego tekstu w
wybranej strefie czasowej; **Kopiuj dostępność** kopiuje go do e-maila. **Gotowe** lub `Esc` kończy ten tryb.

Te terminy to propozycje: nie tworzą wydarzeń ani nie rezerwują czasu. Linki do rezerwacji są planowane osobno.

## Link do subskrypcji i import

**Subskrybuj** w ustawieniach kalendarza daje prywatny link `.ics` dla Kalendarza Google, Kalendarza Apple lub
Outlooka (tylko do odczytu; odświeżają go co kilka godzin). Każdy, kto ma link, widzi Twoje wydarzenia, więc **Nowy link** sprawia,
że stary przestaje działać. **Import** wczytuje plik `.ics` (na przykład eksport z Kalendarza Google) do kalendarza;
ponowny import tego samego pliku aktualizuje te same wydarzenia.

Nie ma jeszcze synchronizacji CalDAV, więc aplikacje kalendarza na telefonie mogą subskrybować, ale nie edytować.

## Przypomnienia

Wydarzenia domyślnie przypominają o sobie 10 minut wcześniej (zmienisz to dla wydarzenia lub w ustawieniach). Przypomnienia przychodzą jako
powiadomienia w przeglądarce: włącz je w ustawieniach powiadomień Poczty.

## Aplikacje AI i API

Claude i ChatGPT mogą wyświetlać Twoje wydarzenia, znajdować termin pasujący Tobie i współpracownikom oraz dodawać wydarzenia
([Aplikacje AI](/pl/docs/mcp)). Zaproszenia dla osób spoza organizacji są wysyłane wyłącznie z aplikacji. REST API
udostępnia `/api/v1/calendar/events` ([API](/pl/docs/api)).
