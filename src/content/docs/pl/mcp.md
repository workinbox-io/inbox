---
title: Aplikacje AI (MCP)
description: Używaj swoich danych z Claude, ChatGPT, Claude Code i Cursora.
section: Guides
order: 2
updated: 2026-11-17
---

Połącz aplikację AI i poproś ją, aby przeszukała Twoją pocztę, przeczytała wątek, napisała szkic odpowiedzi albo znalazła, napisała i zaktualizowała
notatki i kontakty, zarządzała folderami i plikami tekstowymi na dysku albo czytała wydarzenia kalendarza i nimi zarządzała. Aplikacja łączy się z serwerem MCP pod adresem `https://workinbox.io/mcp` (self-hosted: Twój własny adres plus `/mcp`). Adres URL i krótkie
instrukcje konfiguracji znajdziesz w **Ustawienia → Aplikacje AI**.

## Claude

W Claude otwórz **Ustawienia → Konektory**, wybierz **Dodaj własny konektor**, wklej adres URL serwera
i kliknij **Połącz**. Zaloguj się, wybierz organizację, jeśli jesteś w kilku, i zezwól na dostęp.

## ChatGPT

W ChatGPT otwórz **Ustawienia → Aplikacje → Ustawienia zaawansowane** i włącz tryb deweloperski. Wybierz
**Utwórz aplikację**, wklej adres URL serwera, wybierz OAuth, a potem zaloguj się i zezwól na dostęp.

## Claude Code, Cursor i inne narzędzia

```sh
claude mcp add --transport http workinbox https://workinbox.io/mcp
```

Potem uruchom `/mcp` w Claude Code, aby się zalogować. Narzędzia bez procesu logowania mogą zamiast tego wysłać klucz API
organizacji jako `Authorization: Bearer sk_…` (zob. [API](/pl/docs/api)).

## Co może zrobić aplikacja

Aplikacja działa w jednej organizacji, z Twoją rolą w niej. Widzi to, co Ty, i może zmieniać dane tylko wtedy,
gdy zezwolisz na **Tworzy, zmienia i usuwa dane w Twoim imieniu**. Każda zmiana pojawia się w dzienniku zdarzeń
pod Twoim nazwiskiem, razem z aplikacją, przez którą została wykonana.

Czytanie działa na każdym planie. Zmiany (notatki, kontakty, kolekcje, wysyłanie poczty) wymagają planu Pro lub Business.
Odłącz aplikację w **Ustawienia → Aplikacje AI**; traci dostęp natychmiast.

## Wysyłanie poczty

Zapisane wersje robocze można wyświetlić przez `mail_list_drafts` i odczytać przez `mail_get_draft`.
Użyj `mail_update_draft`, aby edytować istniejącą wersję roboczą na miejscu, albo `mail_delete_draft`, aby ją odrzucić.
Oba wymagają dostępu do zapisu i najnowszej wartości `updatedAt` jako `expectedUpdatedAt`, dzięki czemu zmiany
wprowadzone od odczytania wersji roboczej są chronione. Aktualizacje zachowują pominięte pola; listy odbiorców
zastępują dotychczasowe listy. Usunięcie wersji roboczej jest trwałe. Te narzędzia mają dostęp tylko do Twoich własnych wersji roboczych
w skrzynkach, które nadal możesz otworzyć; klucze API organizacji nie mają osobistych wersji roboczych.

Claude i ChatGPT nigdy nie wysyłają poczty na własną rękę. Gdy poprosisz o odpowiedź, aplikacja pokazuje kartę z szkicem:
sprawdź ją, w razie potrzeby zmień i kliknij **Wyślij**. Masz 10 sekund na cofnięcie. Instrukcje
ukryte w e-mailu nie mogą sprawić, że AI cokolwiek wyśle, bo wysyła tylko Twoje kliknięcie. Skrypty używające
klucza API wywołują `mail_send` bezpośrednio.


## Wyszukiwanie i synchronizacja poczty

`mail_search` przyjmuje opcjonalny adres `mailbox` i `folder` (`inbox`, `sent`, `archived`,
`trash`, `spam`, `starred`, `snoozed`). Jawnie podany folder ogranicza też wyniki wyszukiwania. Bez
folderu niepuste `q` przeszukuje wszystkie nieusunięte wątki; puste zapytanie wyświetla Odebrane.

`mail_list_drafts` przyjmuje `q`, `limit` (domyślnie 50, maksymalnie 200) i nieprzejrzysty `cursor`.
Podążaj za `nextCursor`, dopóki `hasMore` jest prawdziwe. Przeglądarka pobiera każdą stronę, zanim wykryje
zdalne usunięcia, i synchronizuje się po przejściu na kartę oraz co 30 sekund, gdy poczta jest widoczna.
Czyste edytory wczytują zdalne zmiany bez ich autozapisu. Konflikty zachowują Twój tekst i pozwalają
wczytać wersję z serwera albo jawnie zapisać Twoją wersję. Aplikacja i karta szkicu sprawdzają
zapisaną wersję przed wysłaniem; użyj **Wczytaj najnowszą zapisaną wersję roboczą**, gdy karta jest nieaktualna.

API wersji roboczych aplikacji używa `expectedUpdatedAt: null` przy tworzeniu i numerycznej wersji przy edycji.
Usunięcie też wymaga tej numerycznej wersji. Nieaktualne edycje, usunięcia i wysłania zwracają `409`.
Po wdrożeniu tego kontraktu odśwież otwarte już klienty w przeglądarce.

## Załączniki wersji roboczych

Użyj `mail_attach_draft` z kluczem wersji roboczej, jej najnowszym `expectedUpdatedAt` i `source`:
`{ driveId }` dla dostępnego pliku z Dysku albo `{ messageId, attachmentIndex }` dla załącznika
wymienionego przez `mail_read_thread`. Przyjmuje identyfikatory źródeł, nigdy dowolnych adresów URL.
`mail_remove_draft_attachment` usuwa załącznik według jego indeksu liczonego od zera. Załączniki pozostają
w wersjach roboczych podczas edycji i synchronizacji. Aplikacja i karta pokazują nazwy i przyciski usuwania.
Dozwolone jest do 5 plików po 10 MB; dostęp do źródła i jego dostępność są sprawdzane ponownie przy zapisie
i wysyłaniu. Usunięcie załącznika wersji roboczej zachowuje oryginalny plik.

## Zmiany w kalendarzu

`calendar_get_event`, `calendar_update_event` i `calendar_delete_event` działają na dostępnych wydarzeniach.
Wyniki wskazują `id`, `seriesId` i pierwotny czas `occurrence`. W przypadku wydarzenia cyklicznego jawnie
wybierz `scope: "this"`, `"following"` lub `"all"`; dwa pierwsze wymagają też `occurrence` w formacie ISO.
Aktualizacje przyjmują `changes` z polami API kalendarza (`start` i `end` w milisekundach).
Zewnętrzni uczestnicy lub organizatorzy w dowolnym miejscu serii, także w wyjątkach lub wśród proponowanych uczestników,
powodują zwrócenie linku do aplikacji **bez zmiany danych i bez wysyłania powiadomień**.

## Kolekcje

`collections_list` zwraca kolekcje organizacji wraz z ich polami (id, nazwa, typ, opcje wyboru)
i liczbą rekordów. Narzędzia przyjmują kolekcję według id lub nazwy, a wartości jako `{ id lub nazwa pola: wartość }`;
pole osoby przyjmuje e-mail kogoś z organizacji, a `null` czyści wartość.
`collection_records_search` dopasowuje `q` do tytułów i wartości, a `filter` według równych wartości, np.
`{ "Status": "In stock" }`. `collection_record_create`, `collection_record_update` i
`collection_record_delete` zmieniają rekordy; `collection_create` (z szablonu: `crm`, `equipment`,
`inventory`, `projects`, lub z `fields`) i `collection_update` są dla właścicieli i administratorów.
Automatyzacje: `collection_automations_list`, `collection_automation_create` (`field` i `to` według nazwy, potem
`emailPeople` według e-maila lub nazwy, albo `postInChannel` według nazwy kanału; działa jako Ty, więc klucze API nie mogą jej dodać) oraz
`collection_automation_update` (`enabled` lub `delete: true`), dla każdego, kto może zmieniać kolekcję.
Wyłączone aplikacje (Konsola administratora → Aplikacje) nie mają narzędzi.

## Zmiany na dysku

`drive_create_folder` przyjmuje `name` i opcjonalne `parentId`. `drive_create_text_file` przyjmuje też
`content`, do 50 000 znaków, zapisane jako zwykły tekst UTF-8. Zduplikowane nazwy dostają wolną nazwę;
istniejące pliki nigdy nie są nadpisywane. `drive_update_item` przyjmuje `id` i `changes` zawierające
`name`, `parentId` (null dla Mojego dysku) lub `trashed` (true, aby przenieść do kosza, false, aby przywrócić).
Obowiązują istniejące uprawnienia, limity miejsca i dziennik zdarzeń. Te narzędzia nie usuwają plików trwale,
nie tworzą linków publicznych, nie wyodrębniają treści z dokumentów binarnych ani nie wykonują OCR.
