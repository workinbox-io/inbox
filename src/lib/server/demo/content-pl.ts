/**
 * The demo story in Polish: content.ts translated, the same exports and the same shape (seed.ts's `Story` type and
 * test/demo.test.ts check it). Picked by /demo for visitors from the Polish site or with a Polish browser.
 */
import type { FieldInput } from "@/lib/collections/fields";
import type { DemoMail } from "./content";
import { fileBodies } from "./files";

export { pdf } from "./files";
export type { DemoMail, Person, PersonKey } from "./content";
import type { Person, PersonKey } from "./content";

export const PEOPLE: Record<PersonKey, Person> = {
  anna: { local: "anna", name: "Anna Kowalska", role: "member", title: "Opiekunka klienta" },
  marek: { local: "marek", name: "Marek Zieliński", role: "owner", title: "Założyciel" },
  diana: { local: "diana", name: "Diana Nowak", role: "member", title: "Projektantka" },
  tomasz: { local: "tomasz", name: "Tomasz Wiśniewski", role: "member", title: "Kierownik projektu" },
};

export const ORG_NAME = "Acme Studio";
export const SUPPORT = "support";

export const BRIEF_FILE = "Brief kampanii wiosennej.pdf";
export const CONTRACT_FILE = "Podpisana umowa.pdf";

export const CONTRACT_SUBJECT = "Umowa na kampanię wiosenną";
export const SUPPORT_SUBJECT = "Pytanie o wspólne skrzynki";

export const MAIL: DemoMail[] = [
  {
    fromName: "Marta Kaczmarek", from: "marta@brightloop.io", to: "anna", subject: CONTRACT_SUBJECT, ago: 9, unread: true, starred: true,
    label: "Brightloop", attach: CONTRACT_FILE,
    text: "Cześć Anno,\n\nw załączniku podpisana umowa na kampanię wiosenną. Czy możesz potwierdzić termin kickoffu? Chcielibyśmy zacząć 18., jeśli Wam to pasuje.\n\nDzięki,\nMarta",
  },
  {
    fromName: "Oliver Smith", from: "oliver@northwind.co", to: SUPPORT, subject: "Nie mogę się zalogować po zmianie hasła", ago: 24, unread: true,
    text: "Dzień dobry,\n\nrano zresetowałem hasło, ale nowe nie działa. Próbowałem dwa razy. Możecie pomóc?\n\nOliver",
  },
  {
    fromName: "Lena Weber", from: "lena.weber@fjord.de", to: SUPPORT, subject: "Faktura 2026-114 ma zły numer VAT", ago: 52, unread: true,
    text: "Dzień dobry,\n\nna fakturze 2026-114 w naszym numerze VAT brakuje prefiksu DE. Czy możecie przesłać poprawioną kopię?\n\nPozdrawiam,\nLena",
  },
  {
    fromName: "Tomasz Wiśniewski", from: "tomasz", to: "anna", subject: "Notatki z rozmowy z klientem", ago: 75,
    text: "Aniu, notatki z dzisiejszej rozmowy są we wspólnej notatce \"Rozmowa z klientem: Brightloop\". Na dole dwa otwarte pytania.\n\nT.",
  },
  {
    fromName: "GitHub", from: "noreply@github.com", to: "anna", subject: "[acme/web] Pull request #482 merged", ago: 130,
    text: "Diana merged pull request #482: new pricing page.",
  },
  {
    fromName: "Sofía García", from: "sofia@casa-garcia.es", to: SUPPORT, subject: SUPPORT_SUBJECT, ago: 190,
    text: "Cześć! Czy dwie osoby mogą odpowiadać z tego samego adresu support@? Jest nas czworo i chcemy przestać przekazywać sobie maile.\n\nGracias,\nSofía",
    reply: { ago: 170, text: "Cześć Sofío,\n\ntak: wspólną skrzynkę jak support@ czytają i obsługują wszyscy, którym dasz dostęp, a odpowiedzi wychodzą z support@. Każdy widzi, kto właśnie pisze odpowiedź, więc nikt nie odpisze dwa razy.\n\nPozdrawiam,\nAnna" },
  },
  {
    fromName: "Diana Nowak", from: "diana", to: "anna", subject: "Przegląd projektu przeniesiony na czwartek", ago: 260,
    text: "Przeniosłam przegląd projektu na czwartek 11:00, ta sama sala. Agenda jest w notatkach.",
  },
  {
    fromName: "Felix Wagner", from: "felix@studio-wagner.de", to: "anna", subject: "Re: Oferta na nową stronę", ago: 410, label: "Klienci",
    text: "Dzięki Anno, oferta wygląda dobrze. Jedno pytanie o harmonogram: czy pierwsza wersja może być gotowa przed świętami?\n\nFelix",
    reply: { ago: 380, text: "Cześć Feliksie,\n\ntak, pierwsza wersja będzie gotowa do 19 grudnia. Szczegółowy harmonogram wyślę jutro.\n\nAnna" },
  },
  {
    fromName: "Cloudflare", from: "noreply@notify.cloudflare.com", to: "anna", subject: "Your monthly usage summary", ago: 900,
    text: "Workers requests, R2 storage and Email Routing usage for October.",
  },
  {
    fromName: "Crypto Wins", from: "promo@crypto-wins.biz", to: "anna", subject: "Zostałeś wybrany do bonusu 500%", ago: 300, spam: true,
    text: "Odbierz bonus teraz! Oferta ograniczona, działaj dziś.",
  },
];

export const LABELS = ["Brightloop", "Klienci"];

export const NOTES: { title: string; markdown: string; folder?: string }[] = [
  {
    title: "Rozmowa z klientem: Brightloop",
    folder: "Klienci",
    markdown: `Rozmowa z **Martą Kaczmarek** (Brightloop) o kampanii wiosennej.

## Ustalenia
- Kickoff 18., cotygodniowe spotkania w poniedziałki
- Brightloop przysyła materiały marki do piątku
- My robimy landing page i sekwencję maili

## Do zrobienia
- [x] Wysłać podpisaną umowę do księgowości
- [ ] Rozpisać harmonogram (Tomasz)
- [ ] Zarezerwować salę na kickoff

## Otwarte pytania
1. Czy landing page ma być też po niemiecku?
2. Kto u nich zatwierdza ostateczne teksty?`,
  },
  { title: "Lista na start", markdown: "- [x] Skrzynka i hasło\n- [x] Dostęp do support@\n- [ ] Przeczytać księgę znaku\n- [ ] Podłączyć telefon (Ustawienia → Programy pocztowe)" },
  { title: "Planowanie Q4", markdown: "## Cele\n- Dwóch nowych klientów na abonament\n- Start kampanii Brightloop\n\n## Budżet\nZobacz **Budżet Q4.csv** na Dysku.\n\n## Rekrutacja\nJeszcze jedna osoba do projektowania od stycznia." },
  { title: "Odpowiedzi do supportu", markdown: "### Reset hasła\nUżyj \"Nie pamiętasz hasła?\" na stronie logowania; link jest ważny godzinę.\n\n### Faktury\nPoprawione faktury księgowość wysyła w ciągu dnia." },
];
export const CLIENT_NOTE = NOTES[0]!.title;

/** Address book: name, company, title, email, phone. */
export const CONTACTS: [string, string, string, string, string][] = [
  ["Marta Kaczmarek", "Brightloop", "Szefowa marketingu", "marta@brightloop.io", "+48 601 234 567"],
  ["Felix Wagner", "Studio Wagner", "Założyciel", "felix@studio-wagner.de", "+49 30 1234 5678"],
  ["Lena Weber", "Fjord", "Finanse", "lena.weber@fjord.de", ""],
  ["Oliver Smith", "Northwind", "Operacje", "oliver@northwind.co", ""],
  ["Sofía García", "Casa García", "Właścicielka", "sofia@casa-garcia.es", "+34 612 345 678"],
];
export const CONTACT_GROUP = "Partnerzy";

export const FOLDERS = ["Brightloop", "Materiały marki", "Umowy", "Finanse", "Na start"];
export const FILES: [string, string | null][] = [
  [BRIEF_FILE, null],
  ["Budżet Q4.csv", null],
  ["Agenda kickoffu.txt", null],
  [CONTRACT_FILE, "Brightloop"],
  ["Plan mediowy.csv", "Brightloop"],
  ["Księga znaku.pdf", "Materiały marki"],
  ["Witaj.txt", "Na start"],
];
export const SHARED_FOLDER = "Materiały marki";
export const PROJECT_FOLDER = "Brightloop";

const CSV: Record<string, string> = {
  "Budżet Q4.csv": "Pozycja,Osoba,Budżet (EUR),Wydane (EUR)\nKampania Brightloop,Anna,24000,8200\nNowa strona (Studio Wagner),Anna,12000,3100\nNarzędzia projektowe,Diana,1800,1650\nWyjazd firmowy,Marek,6500,0\nRekrutacja,Marek,9000,2500\n",
  "Plan mediowy.csv": "Tydzień,Kanał,Wydatki (EUR),Cel\n1,LinkedIn,2500,Zasięg\n1,Newsletter,0,Start\n2,Google Ads,3000,Rejestracje\n3,Instagram,2000,Zasięg\n4,Retargeting,1500,Rejestracje\n",
};
const TEXT: Record<string, string> = {
  "Agenda kickoffu.txt": "Kickoff: kampania wiosenna Brightloop\n\n1. Przedstawienie się (5 min)\n2. Cele i mierniki sukcesu (15 min)\n3. Harmonogram i kamienie milowe (20 min)\n4. Materiały marki i akceptacje (15 min)\n5. Kolejne kroki (5 min)\n",
  "Witaj.txt": "Witaj w Acme Studio!\n\nPoczta, czat, notatki, kalendarz, pliki i kontakty są w jednym miejscu.\nO dostęp do tablic projektów poproś Tomasza.\n",
};
const PDF_LINES: Record<string, string[]> = {
  [BRIEF_FILE]: ["Klient: Brightloop", "Cel: 5000 rejestracji w sześć tygodni", "Kanały: landing page, sekwencja maili, LinkedIn, Google Ads", "Kickoff: 18."],
  [CONTRACT_FILE]: ["Między Brightloop sp. z o.o. a Acme Studio", "Zakres: kampania wiosenna (landing page, maile, reklamy)", "Wynagrodzenie: 24 000 EUR", "Podpisała Marta Kaczmarek"],
  "Księga znaku.pdf": ["Kolory: ink #1d1d1f, coral #ff6b5b", "Kroje: Inter do tekstu, Funnel Display do nagłówków", "Logo: 16 px wolnego miejsca wokół"],
};

export const fileBody = fileBodies(CSV, TEXT, PDF_LINES);

export const CHANNEL = "kampania-wiosenna";

export const EVENTS: { title: string; day: number; from: number; to: number; rrule?: string; location?: string; team?: boolean; by?: PersonKey; notes?: boolean }[] = [
  { title: "Cotygodniowe spotkanie", day: 0, from: 10, to: 10.5, rrule: "FREQ=WEEKLY;BYDAY=MO", team: true },
  { title: "Skupienie: landing page", day: 1, from: 9, to: 12 },
  { title: "Kickoff: kampania wiosenna Brightloop", day: 2, from: 11, to: 12.5, location: "Sala 2 / wideo", team: true, notes: true },
  { title: "Lunch z Martą", day: 2, from: 13, to: 14, location: "Bistro Wola" },
  { title: "Przegląd projektu", day: 3, from: 11, to: 12, team: true, by: "diana" },
  { title: "Dyżur na supporcie", day: 3, from: 15, to: 17 },
  { title: "Planowanie Q4", day: 4, from: 14, to: 15.5, team: true, by: "marek" },
];
export const KICKOFF = EVENTS[2]!.title;

export const TASKS = "Zadania";
export const TASK_FIELDS: FieldInput[] = [
  { name: "Status", type: "select", style: "status", options: ["Backlog", "Do zrobienia", "W toku", "Do przeglądu", "Gotowe", "Anulowane"] },
  { name: "Osoba", type: "person" },
  { name: "Termin", type: "date" },
  { name: "Priorytet", type: "select", style: "priority", options: ["Pilne", "Wysoki", "Średni", "Niski"] },
  { name: "Etykiety", type: "multiselect", options: ["Błąd", "Funkcja", "Ulepszenie"] },
  { name: "Szacunek", type: "number" },
];
export const TASK_ROWS: [string, string, PersonKey, number, string, string[]][] = [
  ["Prezentacja na kickoff z Brightloop", "Gotowe", "anna", -3, "Wysoki", ["Funkcja"]],
  ["Zarezerwować studio na sesję", "Gotowe", "tomasz", -1, "Średni", []],
  ["Teksty na landing page", "Do przeglądu", "anna", 1, "Wysoki", ["Funkcja"]],
  ["Posty na pierwszy tydzień", "W toku", "tomasz", 3, "Średni", []],
  ["Grafiki hero, trzy wersje", "W toku", "diana", 4, "Wysoki", ["Funkcja"]],
  ["Naprawić zepsuty link w stopce newslettera", "Do zrobienia", "diana", 2, "Pilne", ["Błąd"]],
  ["Plan mediowy i budżet", "Do zrobienia", "anna", 6, "Wysoki", []],
  ["Zapowiedź w newsletterze", "Do zrobienia", "tomasz", 9, "Niski", []],
  ["Szablon raportu po starcie", "Backlog", "diana", 14, "Niski", ["Ulepszenie"]],
];

export const DEALS = "Szanse sprzedaży";
export const DEAL_FIELDS: FieldInput[] = [
  { name: "Etap", type: "select", style: "status", options: ["Lead", "Kwalifikacja", "Oferta", "Wygrane", "Przegrane"] },
  { name: "Firma", type: "text" },
  { name: "Wartość", type: "number" },
  { name: "Opiekun", type: "person" },
  { name: "Kontakt", type: "email" },
  { name: "Data zamknięcia", type: "date" },
];
export const DEAL_ROWS: [string, string, string, number, PersonKey, string][] = [
  ["Kampania wiosenna", "Wygrane", "Brightloop", 24000, "anna", "marta@brightloop.io"],
  ["Nowa strona", "Oferta", "Studio Wagner", 12000, "anna", "felix@studio-wagner.de"],
  ["Abonament na wsparcie", "Kwalifikacja", "Northwind", 6000, "marek", "oliver@northwind.co"],
  ["Nowy sklep", "Lead", "Casa García", 9000, "marek", "sofia@casa-garcia.es"],
];

export const RENTALS = "Wypożyczalnia sprzętu";
export const RENTAL_FIELDS: FieldInput[] = [
  { name: "Status", type: "select", style: "plain", options: ["Dostępny", "Zarezerwowany", "Wypożyczony", "W naprawie"] },
  { name: "Kategoria", type: "select", options: ["Aparat", "Obiektyw", "Oświetlenie", "Audio", "Dron"] },
  { name: "Obsługuje", type: "person" },
  { name: "Klient", type: "text" },
  { name: "Zwrot do", type: "date" },
  { name: "Stawka dzienna", type: "number" },
  { name: "Numer seryjny", type: "text" },
];
export const RENTAL_ROWS: [string, string, string, PersonKey | null, string, number | null, number, string][] = [
  ["Zestaw Sony FX3", "Zarezerwowany", "Aparat", "tomasz", "Acme: sesja Brightloop", 4, 90, "FX3-41827"],
  ["Canon R5, korpus", "Wypożyczony", "Aparat", "diana", "Studio Wagner", 2, 80, "R5-20931"],
  ["Sigma 24-70 f/2.8", "Wypożyczony", "Obiektyw", "diana", "Studio Wagner", 2, 25, "SG-77310"],
  ["Lampa Aputure 600d", "Dostępny", "Oświetlenie", null, "", null, 45, "AP6-11205"],
  ["Panele LED, komplet 3 szt.", "Zarezerwowany", "Oświetlenie", "tomasz", "Acme: sesja Brightloop", 4, 40, "LP3-09812"],
  ["Rode Wireless GO II", "Dostępny", "Audio", null, "", null, 15, "RWG-55102"],
  ["Rejestrator Zoom H6", "W naprawie", "Audio", "marek", "", null, 20, "ZH6-30417"],
  ["DJI Mini 4 Pro", "Wypożyczony", "Dron", "anna", "Casa García", -1, 60, "DJI-88420"],
];

export const COPY_TASK = "Teksty na landing page";
export const SUBTASKS: [string, string][] = [["Propozycje nagłówków", "Gotowe"], ["Weryfikacja prawna obietnic", "Do zrobienia"]];
export const BLOCKED: [string, string] = ["Posty na pierwszy tydzień", "Grafiki hero, trzy wersje"];
export const TASK_COMMENTS: [PersonKey, string][] = [
  ["diana", "@anna drugi nagłówek lepiej wygląda na telefonie, bierzemy go?"],
  ["tomasz", "Marta chce to zobaczyć do czwartku."],
];

export const SUPPORT_NAME = `${ORG_NAME} Wsparcie`;
export const SIGNATURE_FOOTER = `${ORG_NAME} · ul. Prosta 20, Warszawa`;
export const FILTER_NAME = "Poczta od Brightloop";
export const TEMPLATES = {
  support: { name: "Reset hasła", subject: "", text: "Dzień dobry,\n\nproszę użyć \"Nie pamiętasz hasła?\" na stronie logowania i kliknąć link z maila; jest ważny godzinę. Jeśli nie dotrze, warto sprawdzić folder spam.\n\nPozdrawiam," },
  anna: { name: "Po kickoffie", subject: "Kolejne kroki po kickoffie", text: "Dziękuję za dzisiejsze spotkanie! Tak jak ustaliliśmy:\n\n- \n\nHarmonogram wyślę do piątku." },
};
export const DRAFTS = {
  own: { to: "felix@studio-wagner.de", subject: "Harmonogram nowej strony", text: "Cześć Feliksie,\n\noto harmonogram, o którym rozmawialiśmy:\n\n- 1 grudnia: makiety\n- 19 grudnia: pierwsza wersja\n- 9 stycznia: start\n" },
  ai: { to: "marta@brightloop.io", subject: "Kickoff 18.: potwierdzone", text: "Cześć Marto,\n\n18. nam pasuje. Wysłałam zaproszenie na 11:00, a agenda jest w wydarzeniu w kalendarzu.\n\nDo zobaczenia,\nAnna" },
  support: { thread: "Nie mogę się zalogować po zmianie hasła", to: "oliver@northwind.co", text: "Dzień dobry,\n\nprzepraszam za kłopot. Wysłałam nowy link do resetu; czy może Pan spróbować w oknie prywatnym?\n\nDiana" },
};

export const NOTE_LINKS = { heading: "Linki", contract: "Umowa", kickoff: "Kickoff", task: "Zadanie" };
export const DIANA_NOTE = {
  title: "Grafiki hero: proszę o opinię",
  markdown: "Trzy kierunki dla hero, makiety na Dysku → Brightloop.\n\n1. Zdjęcie z produktem\n2. Ilustracja pikselowa\n3. Sama duża typografia\n\nKtóry najbardziej pasuje do Brightloop?",
};

export const CHAT = {
  topic: "Kampania wiosenna Brightloop: kickoff 18.",
  generalTopic: "Wszystko o Acme",
  welcome: "Witajcie na czacie zespołu 👋 Projekty mają swoje kanały, cała reszta trafia tutaj.",
  closed: "W piątek po południu biuro jest zamknięte, o 14 przychodzi sprzątanie.",
  signed: "Brightloop podpisał umowę 🎉 Kickoff 18., notatki z rozmowy: {note}",
  assets: "Super! @anna mamy już ich materiały marki? Chciałabym zacząć landing page.",
  friday: "Marta przyśle je do piątku. Wrzucę je na Dysk → Brightloop.",
  questions: "Rozpisuję dziś harmonogram. Dwa pytania na kickoff:\n1. Landing page też po niemiecku?\n2. Kto u nich zatwierdza ostateczne teksty?",
  german: "Niemiecki to jakiś tydzień więcej, zostawiłabym go na drugą fazę.",
  approver: "@anna zapytasz Martę, kto zatwierdza?",
  brief: "Brief jest tutaj, jeśli potrzebujecie: {file}. Pierwsza wersja hero jest we wspólnym folderze, czekam na uwagi 👀",
  dm: "Masz 5 minut po lunchu? Chcę, żebyś zerknęła na hero, zanim je wyślę.",
};
