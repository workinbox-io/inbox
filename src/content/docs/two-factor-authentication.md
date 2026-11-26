---
title: Two-factor authentication
description: Protect password sign-in with an authenticator app, save backup codes and move to a new phone without switching protection off.
section: Account
order: 2
updated: 2026-11-12
---

Two-factor authentication (2FA) adds a code from an authenticator app to password sign-in.
It is optional and available on every plan, including free and self-hosted installations.
Each person configures it for their own account; administrators cannot require it for the organization yet.

## Turn on 2FA

1. Open **Settings → Account → Two-factor authentication** and choose **Turn on 2FA**.
2. Confirm your current password.
3. Scan the QR code with an authenticator app, such as Google Authenticator, Microsoft Authenticator or 1Password. If you cannot scan it, enter the setup key manually.
4. Enter the six-digit code shown by the app. Protection only becomes active after this code is accepted.
5. Copy or download your backup codes and save them outside Work Inbox, for example in your password manager. Confirm that you saved them.

Treat the QR code, setup key and backup codes as secrets. Never send them to support or include them in screenshots.
If you cancel before verifying the first code, 2FA is not enabled. You can start again from Account settings.

## Sign in

Enter your email and password, then the current code from your app. You can paste the code.
If the code fails, check your phone's automatic date and time and try the next code.
After an expired challenge or too many attempts, start sign-in again. Repeated failures can temporarily lock verification.

**Trust this personal device** skips the code on subsequent password sign-ins in that browser.
The 30-day trust period refreshes after each successful trusted sign-in. Leave it unchecked on shared or public computers.
Clearing browser cookies removes trust from that browser.

## Lost your phone?

Choose **Lost your device? Use a backup code** at the code prompt. Enter one of your saved backup codes after your password.
Each backup code works once.

After signing in, change your authenticator. You can confirm that change using another unused backup code if you no longer have the old phone.

A password reset does **not** turn off 2FA. Your recovery email recovers your password; it does not replace an authenticator or backup code.
If you have lost both your authenticator and all backup codes, there is no automatic recovery link that disables 2FA.
Contact [support](mailto:support@workinbox.io) to discuss your options; access recovery is not guaranteed and administrators cannot switch off another person's 2FA from the dashboard.

## Move to a new phone

1. In **Settings → Account → Two-factor authentication**, choose **Change authenticator**.
2. Confirm your password and a code from your existing authenticator, or an unused backup code.
3. Scan the new QR code with the new app and enter its current code within 10 minutes.

Your existing app keeps working until the new code is accepted. After confirmation, its old setup key stops working,
other sessions are signed out and remembered devices must verify again. Your unused backup codes remain valid.
If you cancel or setup expires, your existing authenticator keeps working.

## Generate new backup codes

Choose **New backup codes** and confirm your password plus an authenticator or unused backup code.
The previous set stops working immediately. Save the new set outside Work Inbox before closing the dialog.
If you close the browser before saving, generate a new set using your authenticator.

## Turn off 2FA

Choose **Turn off** and confirm your password plus an authenticator or unused backup code.
Your authenticator setup and backup codes stop working. Password sign-in will no longer ask for an authenticator code.
We send security notifications when you enable, disable or change your authenticator, or regenerate backup codes.
Notifications go to your account address and, if you have one, your verified recovery address.

## Signing in with Google

Work Inbox's authenticator prompt applies to **email and password sign-in**.
Signing in with Google uses Google's security settings, even if your Work Inbox account also has a password and 2FA enabled.
Enable two-step verification in your Google account separately. Work Inbox does not enforce Google's two-step verification policy.

## API keys and connected AI apps

2FA protects password sign-in. It does not ask for a fresh code on every API request or invalidate existing API keys and OAuth grants.
Review and revoke keys and connected apps separately in Settings. Shared mailboxes use each person's account and mailbox permissions;
there is no separate shared 2FA secret for support@ or sales@.

Learn more about [Work Inbox security](/security).
