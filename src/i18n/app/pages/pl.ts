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
} satisfies Record<string, string>;
