---
title: "Common Network Protocols"
section: "Network Recon"
order: 3
description: "How Telnet, HTTP, FTP, SMTP, POP3, and IMAP work and why their cleartext design makes them useful during enumeration."
tags: ["protocols", "ftp", "smtp", "http", "telnet", "pop3", "imap", "enumeration"]
---

Most legacy protocols were built before security was a concern. They send credentials and data in cleartext. Understanding them lets you find and exploit misconfigurations quickly.

---

## Telnet

Remote terminal access on **TCP port 23**. Everything including credentials is sent as plaintext.

Where you find it: embedded systems, old routers, industrial devices, legacy internal infrastructure.

```bash
telnet TARGET_IP            # Remote terminal
telnet TARGET_IP PORT       # Banner grab any service
```

If port 23 is open, connect and read the banner before authenticating. It often reveals device type and firmware version.

---

## HTTP

The core web protocol on **TCP port 80**. Stateless - every request is independent. Apps use cookies and tokens to fake continuity across requests.

**HTTPS** is HTTP wrapped in TLS on port 443.

**HTTP Methods:**

| Method | What it does | Why it matters |
|--------|-------------|----------------|
| GET | Fetch resource | Params in URL, visible in logs |
| POST | Send data | Login forms, file uploads |
| PUT | Replace resource | Can overwrite files on REST APIs |
| DELETE | Remove resource | Can delete data if unauthenticated |
| HEAD | Headers only, no body | Check if resource exists without downloading |

**Status Codes:**

| Range | Meaning | Key codes |
|-------|---------|-----------|
| 2xx | Success | 200 OK |
| 3xx | Redirect | 301 permanent, 302 temporary |
| 4xx | Client error | 401 no auth, 403 forbidden, 404 not found |
| 5xx | Server error | 500 backend crash |

A 403 is more interesting than a 404. The resource exists, you just lack permission.

```bash
curl -I http://TARGET_IP          # Headers only, get server version
curl -v http://TARGET_IP          # Full verbose request and response
```

---

## FTP

File transfer protocol on **TCP port 21** (control) and **TCP port 20** (data). Credentials and file contents sent in cleartext.

**Always check for anonymous login first:**

```
Username: anonymous
Password: (blank or any email string)
```

```bash
ftp TARGET_IP
binary                    # Switch to binary mode before transferring files
get filename              # Download a file
put filename              # Upload (test write access)
```

Look for: read access to sensitive directories, write access anywhere, config files or backups in the root.

---

## SMTP

Handles sending and routing outgoing email.

**Ports:** 25 (unencrypted relay), 587 (TLS/submission), 465 (implicit SSL)

**SMTP commands for user enumeration:**

```bash
nc -vn TARGET_IP 25
```

Once connected:

```
VRFY username         # 250 = user exists, 550 = does not
EXPN mailing-list     # Expands list to individual addresses
RCPT TO:<user@domain> # Alternative if VRFY is disabled, still leaks user validity
```

Practical use: before password spraying, enumerate valid usernames via VRFY or RCPT TO.

---

## POP3

Email retrieval on **TCP port 110** (cleartext) or **port 995** (SSL).

Downloads mail to your device and deletes it from the server by default. No sync across devices.

```bash
nc -vn TARGET_IP 110

USER username
PASS password
STAT              # Count + size of mailbox
LIST              # Message IDs and sizes
RETR 1            # Read full email 1
```

---

## IMAP

Modern email retrieval on **TCP port 143** (cleartext) or **port 993** (SSL).

Emails stay on the server. Client syncs state across multiple devices. Port 143 sends credentials without encryption unless STARTTLS is negotiated.

---

## Cleartext Protocol Reference

| Protocol | Port | Encrypted Version | Port |
|---------|------|------------------|------|
| Telnet | 23 | SSH | 22 |
| HTTP | 80 | HTTPS | 443 |
| FTP | 21 | SFTP / FTPS | 22 / 990 |
| SMTP | 25 | SMTP+TLS | 587 / 465 |
| POP3 | 110 | POP3S | 995 |
| IMAP | 143 | IMAPS | 993 |

Finding any left-column port open means credentials may be flowing in the clear.

---

## Cheat Sheet

```bash
# TELNET
telnet TARGET_IP 23
telnet TARGET_IP PORT       # Banner grab

# HTTP
curl -I http://TARGET_IP    # Headers
curl -v http://TARGET_IP    # Full verbose

# FTP
ftp TARGET_IP               # Try: anonymous / (blank)
binary
get filename
put filename

# SMTP (user enum)
nc -vn TARGET_IP 25
VRFY username
EXPN listname
RCPT TO:<user@domain>

# POP3
nc -vn TARGET_IP 110
USER username
PASS password
STAT
LIST
RETR 1
```
