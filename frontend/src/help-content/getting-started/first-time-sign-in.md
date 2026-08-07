---
title: First-Time Sign-In
section: Getting Started
order: 2
roles: [all]
public: true
keywords: [invitation, temporary password, first login, change password, MFA setup, two-factor, welcome email, forced password change, new user, pf number, personal file number, employee number, pf]
summary: Complete your first sign-in using your work email or PF number and the temporary password from your invitation email, then set a permanent password and configure MFA if required.
---

# First-Time Sign-In

> **Role:** New users (any role)

## Overview

When HR creates your account, the platform sends you an invitation email containing a temporary password. The first time you sign in with that temporary password, the platform immediately asks you to choose a permanent one. If your organisation enforces Two-Factor Authentication (MFA), you will also be guided through a one-time MFA setup before reaching your dashboard. This page walks you through every step.

## Steps

### Step 1: Open the sign-in page

Go to the platform URL provided in your invitation email. The sign-in page loads.

![MINCOM Appraisal sign-in page showing empty Email or PF Number and Password fields](../../screenshots/employee/10-login-empty.png)

### Step 2: Enter your identifier and temporary password

1. Type your work email address **or** your Personal File (PF) number into the **Email or PF Number** field. Your invitation email from HR will tell you which to use, but either works:
   - **Work email** — for example, `a.mensah@mincom.gov.gh`
   - **PF number** — for example, `MIN1234`
2. Open your invitation email and copy the temporary password. Paste it into the **Password** field.
3. Click **Sign in**.

> ⚠️ **Warning:** Temporary passwords expire after 72 hours. If your invitation email is older than three days, ask your HR administrator to resend it.

> 💡 **Tip:** Your Personal File (PF) number is the unique employee identifier printed on your payslip and staff ID card. If you are unsure what yours is, check your payslip or ask your HR administrator.

![Sign-in page with Email or PF Number and temporary password filled in, Sign in button highlighted](../../screenshots/employee/10-login-credentials-filled.png)

### Step 3: Set your permanent password

Because this is your first sign-in, the platform detects your account has a temporary password and redirects you to the **Change Your Password** page. You cannot skip this step.

![Change Your Password page with empty fields and the four password requirements shown](../../screenshots/employee/11-force-change-password-empty.png)

The page shows four password requirements beneath the **New Password** field. Each requirement shows a tick mark ("— met") once you satisfy it as you type:

- At least 8 characters
- Not entirely numeric
- At least one special character (e.g., `! @ # $ %`)
- At least one uppercase letter

1. Type your temporary password into **Current Password**.
2. Type a strong new password into **New Password**. Watch the requirement list — all four items must show "— met" before you can proceed.
3. Type the same new password again into **Confirm New Password**.
4. Click **Update Password**.

> 💡 **Tip:** Choose a password you have not used anywhere else. A passphrase made of three or four random words works well — it is easy to remember and hard to guess.

> ⚠️ **Warning:** Once you click **Update Password** your temporary password is deactivated immediately. Make a note of your new password before continuing.

![Change Your Password page with all four password requirements showing met status](../../screenshots/employee/11-force-change-password.png)

### Step 4: MFA setup (if enabled by your organisation)

If your organisation requires Two-Factor Authentication, the platform shows an MFA setup screen immediately after you set your password. You will see a QR code and a text field for a 6-digit code.

1. Open an authenticator app on your phone (Google Authenticator, Authy, Microsoft Authenticator, or 1Password all work).
2. Tap the **+** button in your app and choose **Scan QR code**.
3. Point your phone camera at the QR code on screen.
4. Your app generates a 6-digit code — type it into the **Verification Code** field on screen.
5. Click **Confirm**.
6. Save the recovery codes shown on the next screen. Store them somewhere secure (for example, a password manager). You will need one if you ever lose access to your phone.

> 💡 **Tip:** If your camera cannot scan the QR code, tap **Enter key manually** in your authenticator app and type the 32-character secret displayed below the QR code instead.

> ⚠️ **Warning:** MFA setup is a one-time step. Once you leave this screen without saving your recovery codes, they cannot be shown again. If you lose your phone without recovery codes, you must ask HR to reset your MFA.

If MFA is not enabled by your organisation, this step is skipped and you land on the dashboard directly.

### Step 5: Land on your dashboard

After a successful password change (and MFA setup, if applicable), the platform takes you to the **Appraisals** page — your default landing page. You can see your name, email address, and role label in the left sidebar.

![Appraisals dashboard after first sign-in, showing the HR Director role label in the sidebar](../../screenshots/employee/13-dashboard-after-first-signin.png)

## What Happens Next

- All future sign-ins use your new permanent password, not the temporary one from the invitation email.
- If MFA is enabled, you will be prompted for a 6-digit code from your authenticator app on every sign-in.
- To change your password again at any time, go to **Settings** in the left sidebar. See [Account Settings and Password](account-settings.md).
- To manage MFA (enable, disable, or reset recovery codes), go to **Settings** > **Two-Factor Authentication**. See [Account Settings and Password](account-settings.md).
- Your session lasts up to 8 hours of continuous use, or 15 minutes of inactivity, whichever comes first.

## Common Questions

**Q: I did not receive an invitation email.**
A: Check your spam or junk folder first. Search for an email from the MINCOM Appraisal system. If you find nothing, contact your HR administrator and ask them to resend the invitation. HR admins can resend invitations from the **Users** section of the admin panel.

**Q: My temporary password is not working.**
A: Temporary passwords expire 72 hours after the invitation email is sent. Ask your HR administrator to resend the invitation, which generates a fresh temporary password. Also check that you are copying the password exactly — avoid leading or trailing spaces when pasting.

**Q: I lost my MFA device — how do I reset it?**
A: Contact your HR administrator. They can reset MFA on your account from the **Users** section of the admin panel. Once reset, the next time you sign in you will be taken through the MFA setup process again. If you saved your recovery codes, you can also use one of those on the MFA prompt screen to bypass the authenticator app temporarily.

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| "Invalid credentials" on first sign-in | Typo, wrong identifier, or expired temp password | Copy the temporary password directly from the invitation email. If you used your email, try your PF number instead (or vice versa). Ask HR to resend the invitation if the password is expired |
| Password requirements not all met | Missing uppercase, special character, or length | Check each requirement in the list; all four must show "— met" before you can submit |
| "Passwords do not match" error | Confirm New Password does not match New Password | Retype both password fields carefully |
| MFA code rejected | Phone clock out of sync | Enable automatic time in your phone's date and time settings |
| Account locked after too many attempts | 5 failed sign-in attempts | Wait 30 minutes for the lockout to clear, or ask HR to unlock immediately |
