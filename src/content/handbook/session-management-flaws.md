---
title: "Session Management Flaws"
section: "Web Authentication & Session Security"
order: 2
description: "How sessions work at a fundamental level, what breaks at each phase, and the real-world impact of fixation, escalation, and improper termination."
tags: ["session", "cookies", "session-fixation", "csrf", "privilege-escalation", "http-only", "samesite"]
---

HTTP is a stateless protocol - every request is independent, with no memory of previous ones. Sessions exist to paper over this limitation by creating a shared secret between the browser and server that persists across requests. Understanding how sessions fail means understanding both the mechanism and all the ways that shared secret can end up in the wrong hands.

---

## What a Session Actually Is

After a successful login, the server creates a session record - typically a row in a database or an in-memory store like Redis - keyed by a randomly generated session ID. That ID is handed to the browser, usually as a cookie. From that point forward, every request from that browser includes the cookie, and the server looks up the session record to know who's making the request and what they're allowed to do.

The session ID is effectively a temporary password. It has all the power of the user's credentials while it's valid, which is exactly why it's such a high-value target.

**The four lifecycle phases - a vulnerability in any one breaks the whole chain:**

| Phase | What Happens | The Risk |
|---|---|---|
| **Creation** | Server generates ID and stores session after login | Weak entropy, fixation, insecure transmission |
| **Tracking** | Browser submits ID; server validates per request | Hijacking, access control failures |
| **Expiry** | Session times out after inactivity or hard limit | Excessive lifetime, no geographic binding |
| **Termination** | Logout destroys session server-side | Client-only deletion, no blocklist for tokens |

---

## The IAAA Model

Authentication and sessions map directly onto a four-step security model:

**Identification** - claiming an identity ("I am user@example.com"). No proof yet, just assertion.

**Authentication** - proving that identity (password, biometric). This is where the session gets *created*.

**Authorisation** - checking what that identity is allowed to do. This happens on *every request*, using the session to look up permissions. Authorisation isn't a one-time check at login - a common mistake is granting permissions at login and assuming they're valid forever without rechecking.

**Accountability** - recording what happened. This matters for incident response: a hijacked session looks completely legitimate in logs (valid session ID, valid user, valid IP), so logging session IDs alongside actions is how you eventually detect anomalous behaviour.

---

## Cookie Security Attributes

Cookies are the most common session transport mechanism. The browser's security behaviour around cookies is entirely controlled by attributes set by the server - and missing attributes translate directly into attack vectors.

**`HttpOnly`** - prevents JavaScript from reading the cookie via `document.cookie`. This is the primary defence against XSS-based session theft. Without it, a single XSS injection point is enough to steal every active session cookie on the page.

**`Secure`** - cookie only transmitted over HTTPS. Without it, the session ID travels in plaintext over any HTTP request - visible to anyone on the same network segment, any man-in-the-middle proxy, and any network logging device.

**`SameSite`** - controls when browsers include the cookie in cross-site requests. This is the main CSRF mitigation at the cookie level:
- `Strict` - never sent cross-site. Most secure, can break some legitimate flows (e.g. OAuth callbacks).
- `Lax` - sent on top-level navigations (clicking a link) but not on subresource loads (images, scripts from cross-origin). Safe for most apps.
- `None` - always sent cross-site. Requires `Secure`. Needed for third-party cookie use cases. Essentially opts out of CSRF protection.

**`Domain`** - too broad a domain setting (e.g. `.target.com`) means every subdomain receives the cookie. A compromised or attacker-controlled subdomain gets the session.

The absent attribute is always the interesting one during a security assessment.

---

## Session Creation Failures

### Weak Session IDs

A session ID needs to be unpredictable. "Unpredictable" has a precise meaning: an attacker who sees any number of session IDs should not be able to predict the next one or reverse-engineer the generation algorithm.

Weak implementations include:
- Sequential numbers (`1001`, `1002`, `1003`)
- Base64 of the username or email
- MD5/SHA1 of username + timestamp (deterministic + low entropy input)
- Short numeric IDs - a 6-digit session ID has only 1 million possible values

The correct approach is a cryptographically secure random number generator with at least 128 bits of entropy.

### Session Fixation

This attack exploits apps that issue a session ID before login and don't rotate it after authentication succeeds.

Here's the mental model: the session ID starts as an *anonymous* identifier. It becomes an *authenticated* identifier when the user logs in. The vulnerability is treating these as the same thing when they shouldn't be.

**Attack flow:**
1. Attacker obtains a valid pre-authentication session ID from the app (just visit the site - it hands one out)
2. Attacker tricks the victim into using this known session ID (via URL parameter if the app supports it, or via cookie injection on a shared/subdomained environment)
3. Victim authenticates - the app accepts the login and marks *this session ID* as authenticated
4. Attacker, who knows the session ID, now has a fully authenticated session

The fix is always: regenerate the session ID the moment authentication succeeds.

---

## Session Tracking Failures

### Broken Access Control

This is the most common and impactful session tracking failure. The session correctly identifies *who* the user is - but the application doesn't consistently check *what* they're allowed to do.

**Vertical privilege escalation** - a regular user accessing functionality reserved for admins. The session exists and is valid; the problem is the server doesn't verify the user's role before returning admin data.

**Horizontal privilege escalation** - a user accessing another user's data at the same privilege level. This is subtler and harder to catch. The user has a valid session and legitimate access to *their own* data. The failure is missing ownership checks - `GET /api/orders/12345` should verify that order 12345 belongs to the requesting user, not just that the request has a valid session.

The IDOR (Insecure Direct Object Reference) class of vulnerabilities is almost entirely horizontal escalation - guessable IDs in URLs or request parameters pointing to resources the requester doesn't own.

---

## Session Expiry Failures

Every session should have two timeouts:

**Idle timeout** - if there's been no activity for N minutes, expire the session. 15–30 minutes is typical for sensitive apps.

**Absolute timeout** - regardless of activity, the session expires after a hard limit. Without this, an active attacker who compromises a session before an idle timeout can keep it alive indefinitely by making requests.

Long-lived sessions also create a geographic binding problem. A session that was created from India and suddenly makes requests from Russia 6 hours later is suspicious. Without flagging and requiring re-authentication, that anomaly goes undetected.

---

## Session Termination Failures

### Client-Side Only Logout

The most common implementation mistake: logout deletes the session cookie from the browser but doesn't invalidate the session record on the server.

From the user's perspective, they're logged out. From the server's perspective, the session still exists - it's just not currently being submitted. Any attacker who captured the session ID before logout can still use it.

The correct behaviour: logout must destroy the server-side session record. The cookie deletion is cosmetic; the server-side destruction is the actual security action.

### Password Change Without Session Invalidation

When a user changes their password - especially after a suspected compromise - the expected behaviour is that all active sessions are terminated. If the attacker has already stolen a session token, a password reset that doesn't kill sessions doesn't actually remove their access.

All sessions should be invalidated on:
- Password change
- Email change
- Account security settings changes
- Explicit logout

### JWT-Specific: No Revocation

JWTs are stateless - the server doesn't store a session record. The token is self-contained and valid as long as the signature is correct and the `exp` claim hasn't passed. This means you can't "delete" a JWT like you delete a session record.

The workaround is a blocklist: store revoked token IDs (the `jti` claim) in Redis or a database, and check every incoming token against it. Short token lifetimes (5–15 minutes) reduce the window where a stolen token is valid even without a blocklist. This is covered in more detail in the JWT chapter.

---

## Why Horizontal Escalation Is Harder to Catch

Vertical escalation is usually caught in code review or basic testing - you try to access `/admin` as a regular user and either it works (bug) or it doesn't. The check is binary and obvious.

Horizontal escalation requires thinking about data ownership, not just role checks. The code might look correct:

```
authenticated? ✓
user role = standard? ✓ (appropriate for this endpoint)
return data for order ID from URL parameter
```

The missing check is: does this order belong to this user? That requires a database join or a field comparison that's easy to omit, especially in CRUD-heavy apps with many resources.

This is why horizontal escalation shows up repeatedly in bug bounty programmes - it's subtle, it requires understanding the business logic, and it doesn't trigger automated scanners the way vertical escalation does.
