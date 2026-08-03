---
title: "MFA Bypass"
section: "Web Authentication & Session Security"
order: 5
description: "How MFA mechanisms work at a technical level, why they fail, and which attacks defeat each type - from OTP logic flaws to AiTM phishing that bypasses everything short of passkeys."
tags: ["mfa", "2fa", "otp", "totp", "mfa-fatigue", "evilginx", "sim-swapping", "aitm-phishing", "passkeys", "fido2"]
---

Multi-factor authentication adds a second verification requirement after the password. Its security depends entirely on two things: the mechanism chosen and how correctly the server implements the flow around it. MFA doesn't add security by existing - it adds security when it's implemented without logic flaws, brute-force vulnerabilities, or bypassable session handling.

> 2FA is a subset of MFA using exactly two factors. MFA can chain three or more. The distinction matters in high-security environments (government, finance) but in practice the terms are used interchangeably.

---

## The Five Factor Categories

| Factor | Type | Examples | Core Weakness |
|---|---|---|---|
| Something you know | Knowledge | Password, PIN, security question | Phishable, guessable, database-leaked |
| Something you have | Possession | TOTP app, YubiKey, SMS-capable phone | SIM swap, device theft, interception |
| Something you are | Inherence | Fingerprint, face, iris | Non-revocable; false positive/negative rates |
| Somewhere you are | Location | IP geolocation, network zone | VPN, IP spoofing |
| Something you do | Behavioural | Typing cadence, mouse movement | High compute cost; easier to spoof than biometrics |

Genuine MFA requires factors from *different categories*. A password + security question is two knowledge factors - both are phishable simultaneously, so this isn't meaningful MFA.

---

## How TOTP Actually Works

TOTP (Time-based One-Time Password, RFC 6238) is the most secure widely-deployed software MFA mechanism. Understanding it mechanically makes it easier to understand why certain attacks work and others don't.

During setup, the server generates a shared secret - typically 20 bytes of random data, encoded as a Base32 string for the QR code. The user's authenticator app stores this secret. From this point, neither the code nor the secret is ever transmitted during authentication.

Code generation:
```
code = HOTP(shared_secret, floor(unix_time / 30))
```

HOTP is an HMAC-SHA1 construction that produces a 6-digit truncated output. The server and the app compute this independently using the same secret and the same time window. If they agree, authentication succeeds - no network transmission of the code, no server-side storage of the OTP.

This is why network interception doesn't break TOTP. Sniffing a TOTP code from network traffic doesn't help because it expires in 30 seconds and can't be reused. The attacks against TOTP work at a different level.

---

## Bypass 1 - OTP Leakage in API Response

This is the most embarrassing vulnerability class: the server generates the OTP and then includes it in the HTTP response that triggers its delivery. An attacker who intercepts or inspects that response gets the OTP directly - no interception of SMS, no compromising the authenticator app.

It happens because of debug code left in production. A developer logging the OTP for debugging purposes forgets to strip the log statement before shipping. Or the API layer returns more fields than intended, and the OTP ends up in a JSON response body alongside a success status.

Open DevTools → Network tab → submit login credentials → watch the XHR requests triggered on the MFA page load. Look at every response body. A response like `{"status": "sent", "otp": "491823"}` is a complete bypass.

The correct response to an OTP generation endpoint is just `{"status": "success"}` - the OTP should never appear on the wire from the server to the client.

---

## Bypass 2 - Logic Flaw (Premature Authentication)

This vulnerability is architectural. The login flow has two steps - password check, then OTP check - but the server grants a fully authenticated session after *step one*.

The implementation mistake: `authenticated = true` is set in the session when the password is validated, before the OTP has been checked. The OTP page is just a page the user is redirected to; it's not enforced by the session state. Navigating directly to the dashboard URL while holding the half-completed session works because the server only checks `authenticated == true`.

The correct design uses a two-state session model:

```
after password check:    session.partial_auth = true
                         user can ONLY access /mfa endpoint
                         
after OTP check:         session.authenticated = true
                         session.partial_auth removed
                         user can access all authenticated resources
```

Every protected endpoint should check `authenticated == true`, not just `session exists`. The MFA endpoint should additionally check `partial_auth == true` before accepting OTP submissions - otherwise an attacker with a fully authenticated session can also submit arbitrary OTPs.

---

## Bypass 3 - OTP Brute Force

The OTP search space is small by design - it needs to be human-typeable. A 6-digit numeric OTP has 1,000,000 possible values. At 100 requests per second with no lockout:

| OTP Length | Possibilities | Time to exhaust |
|---|---|---|
| 4 digits | 10,000 | ~1.7 minutes |
| 6 digits | 1,000,000 | ~2.8 hours |
| 8 digits | 100,000,000 | ~11.5 days |

The 30-second expiry window on TOTP codes doesn't significantly help if the brute force is fast enough - test 100 codes in 30 seconds, repeat on each new code window.

The defences are rate limiting, lockout, and captcha - all on the OTP submission endpoint, not just the login endpoint. Apps that protect their password endpoint but forget the OTP endpoint are vulnerable.

One specific edge case: some apps auto-logout after a failed OTP attempt to prevent brute force. A fresh session is required for each attempt. This sounds protective but only raises the cost slightly - an automated script that re-authenticates from scratch before every OTP guess bypasses this completely.

---

## Bypass 4 - MFA Fatigue

Push-based MFA (Duo, Microsoft Authenticator, Okta Verify) sends an "Approve / Deny" prompt to the user's device. The security model relies on the user only approving prompts they initiated.

MFA fatigue exploits approval as the path of least resistance. An attacker with valid credentials (stolen via phishing, data breach, or credential stuffing) repeatedly attempts login, triggering push after push until the victim approves one - out of confusion, exhaustion, or the belief that the prompts are a system bug.

This gets significantly more effective when combined with social engineering. The attacker calls or messages the victim, impersonates IT support, and explains that the push notifications are a known issue they need to resolve - "just approve one so we can clear the queue." The victim who wouldn't approve random unknown pushes will approve one from what appears to be their IT department.

The Uber 2022 breach followed this exact pattern: credential stuffing to get the password, MFA fatigue for persistence, and a WhatsApp message from the "attacker acting as Uber IT" to get the approval.

**Defences that actually work:**

Number matching - the login screen displays a 2-digit code that the user must type into the push app. Eliminates blind approval entirely.

Push throttling - cap the number of push notifications in a time window. After 3 failed pushes, lock the account or require a different factor.

FIDO2/WebAuthn - eliminates push-based MFA entirely in favour of cryptographic challenge-response.

---

## Bypass 5 - Adversary-in-the-Middle Phishing (AiTM)

This is the most technically sophisticated bypass and the most important to understand because it's fundamentally different from the others. AiTM phishing doesn't break MFA - it bypasses it entirely by operating *after* authentication completes.

Traditional phishing steals credentials. AiTM phishing steals the session cookie that's issued after successful login - including successful MFA. The attacker operates a reverse proxy that sits between the victim and the real site. Every request and response is forwarded through the attacker's infrastructure, allowing them to inspect and capture everything.

The flow:
1. Attacker sets up Evilginx (or similar) at a convincing phishing domain
2. Victim receives a phishing link and lands on the attacker's proxy
3. The victim sees and interacts with the legitimate login page - it's a real-time proxy of the actual site
4. Victim enters credentials → proxy forwards them to the real site
5. Real site challenges for MFA → proxy forwards the challenge to the victim
6. Victim enters the OTP → proxy forwards it to the real site
7. Real site issues a session cookie → proxy intercepts it before forwarding it to the victim's browser
8. Attacker now has a valid, fully authenticated session cookie

The victim successfully completed MFA. The attacker has the post-authentication session. MFA as implemented by any SMS/TOTP/push mechanism doesn't defend against this because the session theft happens after authentication, not during it.

**The only defence is FIDO2/WebAuthn.** The cryptographic handshake in WebAuthn binds the credential to the origin domain. The browser generates the authentication proof using the expected domain (`accounts.google.com`), and that proof is only valid for that exact domain. Even if the attacker's proxy forwards the WebAuthn challenge, the browser generates a response cryptographically tied to `accounts.google.com` - which fails verification if submitted to `accounts.g00gle.com` (the phishing proxy). The victim's browser refuses to authenticate to a different origin, regardless of how convincing the proxy looks.

---

## Bypass 6 - SIM Swapping

SMS OTP uses the phone number as the "something you have" factor. SIM swapping attacks the carrier's identity verification process to transfer the phone number to a SIM card the attacker controls.

Mobile carriers allow number transfers for legitimate reasons (upgrading a device, switching phones). The verification process relies on personal information - name, account PIN, last 4 of SSN, billing address - all of which is often findable via OSINT or previous data breaches. A convincing attacker calling customer support can socially engineer a SIM transfer.

Once the number is transferred:
- The victim's phone shows "No Service"
- Every SMS intended for the victim - including OTPs - now goes to the attacker's SIM
- The attacker initiates password resets and 2FA challenges, intercepts the SMS codes, and completes account takeover

The fundamental weakness is that phone numbers as authentication factors depend on the security of the carrier's customer service process, which is outside the application's control.

Mitigation: don't use SMS for MFA in applications where account takeover has serious consequences. TOTP apps don't rely on phone numbers - the shared secret is stored on the device, not associated with a number. Hardware tokens are even more robust.

---

## Which MFA Defeats Which Attack

| Attack | TOTP | SMS | Push | FIDO2/WebAuthn |
|---|---|---|---|---|
| OTP brute force | Vulnerable (if no rate limit) | Vulnerable | N/A (no code) | Immune |
| Logic flaw (premature auth) | Vulnerable | Vulnerable | Vulnerable | Vulnerable |
| OTP leakage | Vulnerable | Vulnerable | N/A | Immune |
| MFA fatigue | N/A | N/A | Vulnerable | Immune |
| AiTM phishing | Vulnerable | Vulnerable | Vulnerable | **Immune** |
| SIM swapping | Immune | **Vulnerable** | Immune | Immune |

FIDO2/WebAuthn is the only mechanism that defeats AiTM phishing. It's phishing-resistant by cryptographic construction. Everything else is a speed bump for a sufficiently motivated attacker.

---

## Real-World Incidents

| Incident | MFA Type | Bypass Method |
|---|---|---|
| Uber (2022) | Push (Duo) | MFA fatigue + WhatsApp social engineering |
| Twitter employees (2020) | SMS | SIM swapping targeting specific employees |
| Twilio (2022) | SMS OTP (Authy) | SMS phishing → OTP interception at scale |
| Cisco (2022) | Push (Duo) | MFA fatigue after credential phishing |
