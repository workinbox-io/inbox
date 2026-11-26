/** Polish: public pages (shared file and note links, forwarding confirmation, checkout) and server texts outside the apps. Keys = English text (lib/i18n/panel.ts). */
export default {
  // Shared links: /s/<token>, /n/<token>
  "Link not found": "Nie znaleziono linku",
  "Download all": "Pobierz wszystko",
  "This link doesn't work": "Ten link nie działa",
  "It may have expired or been removed. Ask the person who sent it for a new one.": "Mógł wygasnąć albo zostać usunięty. Poproś osobę, która go wysłała, o nowy.",
  "This link is protected. Enter the password you were given.": "Ten link jest chroniony. Wpisz hasło, które otrzymano razem z nim.",
  "That password isn't right.": "To hasło jest nieprawidłowe.",
  "This folder is empty.": "Ten folder jest pusty.",
  "No preview for this kind of file. Download it to open it.": "Brak podglądu dla tego typu pliku. Pobierz go, aby otworzyć.",

  // Forwarding confirmation: the e-mail and /mail/verify-forward
  "Confirm mail forwarding": "Potwierdź przekierowanie poczty",
  "Confirm forwarding from {address}: {url}": "Potwierdź przekierowanie z adresu {address}: {url}",
  "Confirm mail forwarding using this link:": "Potwierdź przekierowanie poczty, klikając ten link:",
  "Confirm forwarding": "Potwierdź przekierowanie",
  "Open the confirmation link from your email.": "Otwórz link potwierdzający z wiadomości e-mail.",
  "Forwarding address confirmed. You may close this page.": "Adres przekierowania potwierdzony. Możesz zamknąć tę stronę.",
  "This confirmation link is invalid or expired.": "Ten link potwierdzający jest nieprawidłowy lub wygasł.",
  "Confirm this forwarding address": "Potwierdź ten adres przekierowania",

  // Push and notifications
  "New mail": "Nowa wiadomość",
  "Direct message": "Wiadomość prywatna",
  "Thread in #{name}": "Wątek na kanale #{name}",

  // Settings dialog
  "Please wait for the current save to finish.": "Poczekaj, aż zakończy się bieżące zapisywanie.",

  // Checkout: /pay
  "Checkout": "Płatność",
  "Back to billing": "Wróć do płatności",
  "Order summary": "Podsumowanie zamówienia",
  "Your {product} subscription": "Twoja subskrypcja {product}",
  "Billed every year. Cancel any time from the Billing page.": "Płatność co rok. Możesz zrezygnować w każdej chwili na stronie Płatności.",
  "Billed every month. Cancel any time from the Billing page.": "Płatność co miesiąc. Możesz zrezygnować w każdej chwili na stronie Płatności.",
  "Tax": "Podatek",
  "Due today": "Do zapłaty dziś",
  "Payments are processed by Paddle.com, our reseller and merchant of record. They handle VAT and send your invoices. Tax is calculated from your billing country.":
    "Płatności obsługuje Paddle.com, nasz sprzedawca i podmiot rozliczający transakcje. Paddle nalicza VAT i wysyła faktury. Podatek zależy od kraju podanego w danych rozliczeniowych.",
  "Payment": "Płatność",
  "The checkout didn't load.": "Formularz płatności się nie wczytał.",

  // Usage tiles on the overview ("12 of 50", "12 of unlimited")
  "of unlimited": "/ bez limitu",
  "usage|of": "z",
  "What you get": "Co dostajesz",
  "Good to know": "Warto wiedzieć",
  "A week at Acme Studio, already under way": "Tydzień w Acme Studio, już w toku",
  "You are Anna, an account manager. The studio just signed Brightloop for its spring campaign, and every app holds a piece of that story.": "Jesteś Anną, opiekunką klienta. Studio właśnie podpisało umowę z Brightloop na wiosenną kampanię, a w każdej aplikacji jest kawałek tej historii.",
  "Threads with the signed Brightloop contract, a question to support@, and a colleague's draft you can take over.": "Wątki z podpisaną umową Brightloop, pytanie do support@ i wersja robocza koleżanki lub kolegi, którą możesz przejąć.",
  "Channels and DMs with @mentions of files, notes and events, so the bell has something in it.": "Kanały i wiadomości prywatne z @wzmiankami plików, notatek i wydarzeń, więc w dzwonku coś już jest.",
  "Shared notes, including the client call, written with the meeting's attendees.": "Wspólne notatki, w tym ze spotkania z klientem, tworzone z uczestnikami spotkania.",
  "The week's meetings, with the kickoff and a meeting note linked to it.": "Spotkania tygodnia, z kickoffem i powiązaną notatką ze spotkania.",
  "The campaign brief and the signed contract, attachable to mail.": "Brief kampanii i podpisana umowa, które można dołączyć do poczty.",
  "An address book, and Tasks, Deals and Equipment rental lists you can edit.": "Książka adresowa oraz listy Zadania, Transakcje i Wypożyczalnia sprzętu, które możesz edytować.",
  "Contacts and collections": "Kontakty i kolekcje",
  "Nothing to sign up for, nothing left behind": "Bez rejestracji, bez śladu po sobie",
  "No signup, no card.": "Bez rejestracji i karty.",
  "Mail is never sent out of the demo.": "Poczta nigdy nie wychodzi poza demo.",
  "The workspace is deleted after 24 hours.": "Przestrzeń robocza jest usuwana po 24 godzinach.",
} satisfies Record<string, string>;
