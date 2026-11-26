---
title: Uwierzytelnianie dwuskładnikowe
description: Chroń logowanie hasłem aplikacją uwierzytelniającą, zapisz kody zapasowe i przejdź na nowy telefon bez wyłączania ochrony.
section: Account
order: 2
updated: 2026-11-17
---

Uwierzytelnianie dwuskładnikowe (2FA) dodaje do logowania hasłem kod z aplikacji uwierzytelniającej.
Jest opcjonalne i dostępne na każdym planie, także bezpłatnym i w instalacjach self-hosted.
Każda osoba konfiguruje je dla własnego konta; administratorzy nie mogą jeszcze wymagać go w całej organizacji.

## Włącz 2FA

1. Otwórz **Ustawienia → Konto → Uwierzytelnianie dwuskładnikowe** i wybierz **Włącz 2FA**.
2. Potwierdź swoje aktualne hasło.
3. Zeskanuj kod QR aplikacją uwierzytelniającą, na przykład Google Authenticator, Microsoft Authenticator lub 1Password. Jeśli nie możesz zeskanować, wpisz klucz konfiguracji ręcznie.
4. Wpisz sześciocyfrowy kod pokazany przez aplikację. Ochrona włącza się dopiero po zaakceptowaniu tego kodu.
5. Skopiuj lub pobierz kody zapasowe i zapisz je poza Work Inbox, na przykład w menedżerze haseł. Potwierdź, że je zapisano.

Traktuj kod QR, klucz konfiguracji i kody zapasowe jak tajemnice. Nigdy nie wysyłaj ich do wsparcia ani nie umieszczaj na zrzutach ekranu.
Jeśli anulujesz przed zweryfikowaniem pierwszego kodu, 2FA nie zostanie włączone. Możesz zacząć od nowa w ustawieniach konta.

## Logowanie

Wpisz e-mail i hasło, a potem aktualny kod z aplikacji. Możesz go wkleić.
Jeśli kod nie działa, sprawdź automatyczną datę i godzinę w telefonie i spróbuj następnego kodu.
Po wygaśnięciu weryfikacji lub zbyt wielu próbach zacznij logowanie od początku. Powtarzające się błędy mogą tymczasowo zablokować weryfikację.

**Ufaj temu urządzeniu przez 30 dni od logowania** pomija kod przy kolejnych logowaniach hasłem w tej przeglądarce.
30-dniowy okres zaufania odnawia się po każdym udanym logowaniu na zaufanym urządzeniu. Nie zaznaczaj tego na wspólnych ani publicznych komputerach.
Wyczyszczenie ciasteczek przeglądarki usuwa zaufanie dla tej przeglądarki.

## Nie masz telefonu?

Przy prośbie o kod wybierz **Nie masz urządzenia? Użyj kodu zapasowego**. Po haśle wpisz jeden z zapisanych kodów zapasowych.
Każdy kod zapasowy działa tylko raz.

Po zalogowaniu zmień aplikację uwierzytelniającą. Możesz potwierdzić tę zmianę innym niewykorzystanym kodem zapasowym, jeśli nie masz już starego telefonu.

Zresetowanie hasła **nie** wyłącza 2FA. Adres odzyskiwania służy do odzyskania hasła; nie zastępuje aplikacji uwierzytelniającej ani kodu zapasowego.
Jeśli utracono zarówno aplikację uwierzytelniającą, jak i wszystkie kody zapasowe, nie ma automatycznego linku, który wyłącza 2FA.
Skontaktuj się ze [wsparciem](mailto:support@workinbox.io), aby omówić opcje; odzyskanie dostępu nie jest gwarantowane, a administratorzy nie mogą wyłączyć 2FA innej osoby z panelu.

## Przejście na nowy telefon

1. W **Ustawienia → Konto → Uwierzytelnianie dwuskładnikowe** wybierz **Zmień aplikację uwierzytelniającą**.
2. Potwierdź hasło i kod z dotychczasowej aplikacji uwierzytelniającej albo niewykorzystany kod zapasowy.
3. Zeskanuj nowy kod QR nową aplikacją i w ciągu 10 minut wpisz jej aktualny kod.

Dotychczasowa aplikacja działa, dopóki nowy kod nie zostanie zaakceptowany. Po potwierdzeniu jej stary klucz konfiguracji przestaje działać,
pozostałe sesje są wylogowywane, a zapamiętane urządzenia muszą przejść weryfikację ponownie. Niewykorzystane kody zapasowe zachowują ważność.
Jeśli anulujesz lub konfiguracja wygaśnie, dotychczasowa aplikacja uwierzytelniająca nadal działa.

## Wygeneruj nowe kody zapasowe

Wybierz **Nowe kody zapasowe** i potwierdź hasło oraz kod z aplikacji lub niewykorzystany kod zapasowy.
Poprzedni zestaw przestaje działać natychmiast. Zapisz nowy zestaw poza Work Inbox, zanim zamkniesz okno.
Jeśli zamkniesz przeglądarkę przed zapisaniem, wygeneruj nowy zestaw za pomocą aplikacji uwierzytelniającej.

## Wyłącz 2FA

Wybierz **Wyłącz** i potwierdź hasło oraz kod z aplikacji lub niewykorzystany kod zapasowy.
Konfiguracja aplikacji uwierzytelniającej i kody zapasowe przestają działać. Logowanie hasłem nie będzie już pytać o kod z aplikacji.
Wysyłamy powiadomienia o bezpieczeństwie, gdy włączysz lub wyłączysz 2FA, zmienisz aplikację uwierzytelniającą albo wygenerujesz nowe kody zapasowe.
Powiadomienia trafiają na adres Twojego konta oraz, jeśli go masz, na zweryfikowany adres odzyskiwania.

## Logowanie przez Google

Monit o kod z aplikacji w Work Inbox dotyczy **logowania e-mailem i hasłem**.
Logowanie przez Google korzysta z ustawień zabezpieczeń Google, nawet jeśli Twoje konto w Work Inbox ma też hasło i włączone 2FA.
Włącz weryfikację dwuetapową na koncie Google osobno. Work Inbox nie egzekwuje zasad weryfikacji dwuetapowej Google.

## Klucze API i połączone aplikacje AI

2FA chroni logowanie hasłem. Nie wymaga nowego kodu przy każdym żądaniu API ani nie unieważnia istniejących kluczy API i zgód OAuth.
Klucze i połączone aplikacje przeglądaj i unieważniaj osobno w Ustawieniach. Skrzynki wspólne korzystają z kont i uprawnień poszczególnych osób;
nie ma osobnego wspólnego sekretu 2FA dla support@ czy sales@.

Dowiedz się więcej o [bezpieczeństwie Work Inbox](/security).
