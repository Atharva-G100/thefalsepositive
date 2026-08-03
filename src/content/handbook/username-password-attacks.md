---
title: "Username & Password Attacks"
section: "Web Authentication & Session Security"
order: 1
description: "How username enumeration, brute force, and password reset flaws work - and why authentication is almost always the weakest link."
tags: ["enumeration", "brute-force", "password-reset", "osint", "ffuf", "hydra"]
---

Authentication is the first gate. It is also the most attacked - not because it is technically complex, but because developers consistently make the same implementation mistakes. Before an attacker brute forces passwords, they do something cheaper: they figure out which usernames actually exist.

---

## Why User Enumeration Matters

Brute forcing a login with a list of 10,000 usernames and 100 passwords means 1,000,000 requests. If you can first narrow down valid usernames to just 5, that is 500 requests - two orders of magnitude less noise, less time, and less chance of triggering lockouts.

The root cause is almost always **differential responses** - the application leaking whether a username is valid through something slightly different in its response. This can be:

**Message differences** - the most obvious kind. An app that says "Email does not exist" for invalid users and "Incorrect password" for valid ones is directly handing you the user database. Both messages look like login failures to the user, but they mean completely different things to an attacker.

**Timing differences** - subtler and harder to fix. When a valid username is entered, most apps go on to compute a password hash (bcrypt, argon2 - these are slow by design, taking ~100ms+). When the username is invalid, the app short-circuits immediately - no user found, no hash computed, fail fast. The response time difference might only be 50-200ms, but it is consistent and measurable at scale.

**Response size differences** - even when the error message text is identical, the HTML structure of the response can differ. A valid-user response might include a hidden field, a different redirect, or a differently structured error block.

The mistake is that developers think about login as a single endpoint. In reality, `/forgot-password` and `/register` are also enumeration surfaces - apps often properly harden `/login` but forget that `/forgot-password` will happily tell you "no account with that email" and `/register` will say "email already in use."

---

## Password Reset Logic - Where the Real Flaws Live

Password reset is one of the most dangerous features in a web application because it is designed to bypass authentication. It is the emergency exit - and emergency exits that are not properly secured are how attackers walk in.

### Token Quality

The security of a reset flow depends entirely on the token. A properly implemented reset token should be:

- **Cryptographically random** - not derived from the username, timestamp, or any predictable value
- **Long enough** - at minimum 128 bits of entropy (32 hex characters)
- **Single-use** - using the token once should invalidate it immediately
- **Short-lived** - 15 minutes maximum, not hours

The classic failure is tokens generated from `time()` or a counter. If the token is the Unix timestamp at the moment of request, and an attacker knows roughly when the victim requested the reset, the search space collapses from billions to a few thousand values - easily brute-forced in seconds.

### Host Header Injection

This is one of the more elegant bugs. When an app builds a password reset link, it typically needs to know its own domain name. The naive approach is to read the `Host` request header - which is attacker-controlled:

```
POST /forgot-password
Host: attacker.com
body: email=victim@target.com
```

The server generates `https://attacker.com/reset?token=abc123` and emails it to the victim. The victim gets a legitimate-looking email, clicks the link - and sends the reset token to the attacker's server. Full account takeover, zero password needed.

The fix is to hardcode the application's own domain in the config, never derive it from the request.

### Token Invalidation Gaps

Even properly generated tokens frequently have lifetime issues:

- Token not invalidated after use - replay is possible
- Token not invalidated when a new reset is requested - multiple valid tokens for the same account
- Password change does not invalidate other active sessions - the attacker who stole a session keeps it even after the victim resets their password

---

## HTTP Basic Authentication

Basic Auth sends credentials on every single request as a Base64-encoded `username:password` string in the `Authorization` header. Base64 is encoding, not encryption. It is reversible in milliseconds with no key. The reason it exists is format compatibility, not security.

```
Authorization: Basic dXNlcjpwYXNzd29yZA==
                       ↑ trivially decoded: "user:password"
```

Without HTTPS, every request is in plaintext on the wire. Even with HTTPS, the protection stops at the TLS layer - the credentials are still being transmitted on every request, meaning every logged packet, proxy log, or middleware log potentially contains them.

Basic Auth has no concept of sessions, rate limiting, or lockout built into the HTTP spec - that is entirely up to the application server to implement. Many do not bother, which is why routers, IoT panels, and legacy admin interfaces are almost always trivially brute-forceable with a tool like Hydra.

The other persistent problem is default credentials. Manufacturers ship devices with `admin:admin` or `admin:password` and most users never change them. Checking default creds takes five seconds and succeeds surprisingly often - always do this before brute forcing.

---

## OSINT Before You Touch the Target

The cheapest attack is the one where the credentials already exist somewhere public. Before sending a single request to the target, it is worth checking what is already out there.

**Historical URL discovery** uses services like the Wayback Machine and Common Crawl to find URLs that no longer exist on the live site but were indexed in the past. Development environments, backup files, old admin panels, swagger docs - they get removed from the site but not from the archive. Tools like `waybackurls` and `gau` automate pulling these.

**Google dorks** are specific search operators that narrow results to a target domain and file type. `site:target.com filetype:env` has found production `.env` files containing database credentials. `filetype:sql "INSERT INTO users"` has found database dumps. The Google Hacking Database at exploit-db.com catalogs thousands of proven dork patterns.

**GitHub dork searching** is often more effective than Google for credentials because developers commit secrets to repos far more often than you would expect. API keys in `.env` files, hardcoded passwords in config files, AWS credentials in deployment scripts - all committed, all searchable. Tools like `trufflehog` and `gitleaks` automate scanning repos for secret patterns.

**Shodan and Censys** index devices and services, not web pages. They will find the target's exposed admin panels, development servers running on non-standard ports, and services that are not linked from the public site but are accessible from the internet.

The principle: the cheaper the path in, the more likely it is the right one to try first. An exposed `.env` file is a zero-effort complete compromise. Always check before generating noise with active attacks.

---

## Tools

| Tool | What It Does |
|---|---|
| **ffuf** | Fast HTTP fuzzing - usernames, parameters, endpoints |
| **Hydra** | Protocol-level brute force - HTTP, SSH, FTP, SMB |
| **Burp Intruder** | Targeted HTTP attacks with full response analysis |
| **crunch** | Custom wordlist generation by pattern |
| **waybackurls** | Pull historical URLs from Wayback Machine |
| **gau** | Multi-source URL harvesting (Wayback + Common Crawl + OTX) |
| **trufflehog / gitleaks** | Automated secret scanning in git repos |

```bash
# Username enumeration via response matching
ffuf -w usernames.txt -X POST \
     -d "username=FUZZ&password=wrongpass" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -u http://target/login -mr "Invalid password"

# Brute force HTTP Basic Auth
hydra -l admin -P /usr/share/wordlists/rockyou.txt http-get://target/admin

# Historical URL harvest
waybackurls target.com | grep -E "\.(env|sql|bak|config|json)$"
```

---

## Real-World CVEs

- **CVE-2018-15473** - OpenSSH user enumeration via timing. A valid username caused a measurably different delay in the authentication handshake. Fixed in 7.8.
- **CVE-2016-0783** - Apache OpenMeetings generated password reset tokens from the current timestamp. Trivially predictable.
- **CVE-2023-0968** - Watu Quiz (WordPress): reset tokens not invalidated after use. Valid indefinitely until explicitly expired.
