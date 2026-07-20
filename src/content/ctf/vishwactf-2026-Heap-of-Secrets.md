---
title: "Heap of Secrets"
ctf: "Vishwa CTF 2026"
date: "2026-04-04"
description: "Extracting secrets from browser memory using Heap Snapshots"
points: 500
tags: ["Web", "Client-Side"]
---

## tl;dr

The challenge hint said the flag was already in the browser and suggested taking a snapshot. The frontend JavaScript allocates session objects in memory and stores a decoded token in one of them. That token is the flag.

**Challenge points:** 500

---

## Recon

Loading the homepage source showed a large inline script. The relevant part:

- `initSession()` calls `fetch("/api/init")`
- The response contains `session_seed` and `trace_vector`
- The code decodes the token with XOR:

```js
const decoded = data.trace_vector.map(b => b ^ key);
const token   = decoded.map(c => String.fromCharCode(c)).join("");
```

- The decoded value is stored in `session.license_token`

This matches the hint: the secret is not rendered directly, but it is allocated in browser-side objects and would appear in a heap snapshot.

---

## Relevant JavaScript

```js
const res  = await fetch("/api/init");
const data = await res.json();

const key     = data.session_seed;
const decoded = data.trace_vector.map(b => b ^ key);
const token   = decoded.map(c => String.fromCharCode(c)).join("");

session.license_token = token;
```

---

## API Response

**Request:** `GET /api/init`

**Response:**

```json
{
  "ts": 1775226941,
  "node": "edge-7",
  "session_seed": 56,
  "trace_vector": [110,81,75,80,79,89,123,108,126,67,80,11,12,72,103,13,86,12,72,13,80,8,76,103,9,75,103,124,11,93,72,103,117,11,85,8,74,65,69],
  "build": "prod-eu-west-3",
  "version": "2.4.1"
}
```

---

## Solve

XOR each element of `trace_vector` with `session_seed = 56`, then convert the resulting bytes to characters.

```python
trace = [110,81,75,80,79,89,123,108,126,67,80,11,12,72,103,13,86,12,72,13,80,8,76,103,9,75,103,124,11,93,72,103,117,11,85,8,74,65,69]
key = 56
print(''.join(chr(b ^ key) for b in trace))
```

**Output:**

```
VishwaCTF{h34p_5n4p5h0t_1s_D3ep_M3m0ry}
```

---

## Verification

Submitting the decoded value to `/api/submit` returned:

```json
{"ok": true, "msg": "🎉 Correct! Flag accepted."}
```

---

## Flag

```
VishwaCTF{h34p_5n4p5h0t_1s_D3ep_M3m0ry}
```
