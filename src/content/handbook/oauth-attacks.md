---
title: "OAuth 2.0 Attacks"
section: "Web Authentication & Session Security"
order: 4
description: "How OAuth 2.0 actually works under the hood, why its complexity makes it prone to implementation bugs, and what happens when those bugs exist."
tags: ["oauth", "oauth2", "redirect-uri", "state-parameter", "csrf", "pkce", "authorization-code", "implicit-flow"]
---

OAuth 2.0 is an authorization framework, not an authentication protocol. The distinction matters: OAuth answers "what is this app allowed to do on your behalf?" - not "who are you?" OpenID Connect (OIDC) is the identity layer built on top of OAuth that adds the authentication piece. Most "Login with Google" flows use both.

OAuth's complexity is its main weakness. The flow involves multiple parties, multiple redirects, multiple token types, and a large number of parameters that need to be validated correctly at every step. Each validation that's missing or weak is a potential attack.

---

## The Core Actors

**Resource Owner** - the user. They own the data and decide what access to grant.

**Client** - the third-party application requesting access. It doesn't get the user's credentials - it gets an access token with scoped permissions.

**Authorization Server** - the service that handles authentication and issues tokens (Google, GitHub, Auth0, Okta). This is the trusted intermediary.

**Resource Server** - the API that holds the actual data. It validates access tokens and returns data if they're valid.

---

## The Authorization Code Flow (The One That Matters)

There are several OAuth grant types, but Authorization Code is the most secure and most common. Understanding it precisely is necessary to understand the attacks against it.

```
1. User clicks "Login with GitHub" on the client app

2. Client redirects user's browser to the authorization server:
   /authorize?response_type=code
             &client_id=APP123
             &redirect_uri=https://myapp.com/callback
             &scope=read:user
             &state=RANDOM_UNGUESSABLE_VALUE

3. User authenticates on the authorization server and grants consent

4. Authorization server redirects back to the client's redirect_uri:
   https://myapp.com/callback?code=AUTH_CODE_HERE&state=SAME_RANDOM_VALUE

5. Client verifies the state value matches what it sent (CSRF check)

6. Client's backend exchanges the code for tokens:
   POST /token
   grant_type=authorization_code
   &code=AUTH_CODE_HERE
   &redirect_uri=https://myapp.com/callback
   &client_id=APP123
   &client_secret=SECRET

7. Authorization server returns access_token (+ refresh_token)

8. Client uses access_token to call the Resource Server API
```

The key architectural feature: the authorization code is exchanged for the access token in a server-to-server request (step 6). The actual token never touches the browser. The authorization code is short-lived and single-use. Even if the code is intercepted (e.g. in a Referer header), it's useless without the client secret.

### PKCE - For Apps That Can't Keep Secrets

Single-page applications and mobile apps can't securely store a `client_secret` - it would be embedded in client-side code or a downloadable app binary, where anyone can extract it. PKCE (Proof Key for Code Exchange) solves this by replacing the static secret with a dynamically generated proof:

1. Client generates a random `code_verifier`
2. Client computes `code_challenge = SHA256(code_verifier)`
3. Authorization request includes `code_challenge`
4. Token exchange includes `code_verifier` - the server verifies that `SHA256(verifier) == challenge`

The proof can only be known by the party that generated it in that specific flow. OAuth 2.1 mandates PKCE for all clients.

### Implicit Flow - Why It Died

The older Implicit flow returned the access token directly in the URL fragment after the redirect (`#access_token=XYZ`). This was designed for SPAs before PKCE existed. The problem: URLs end up in browser history, server logs, Referer headers, and are readable by any JavaScript on the page. Implicit flow is deprecated; Authorization Code + PKCE is the replacement.

---

## Attack 1 - Redirect URI Manipulation

The authorization server is supposed to validate the `redirect_uri` against a registered allowlist for the client. If an attacker can get the authorization code redirected somewhere they control, they can exchange it for a token and take over the account.

Weak validation is the issue. Rather than exact matching, some servers use:

**Substring/prefix matching** - `https://legit.com` as the registered URI, and `https://legit.com.evil.com` passes the check.

**Wildcard subdomain matching** - `*.legit.com` allows `https://attacker.legit.com` if the attacker can create or compromise a subdomain.

**Path traversal** - `https://legit.com/callback/../evil` matches `legit.com` as the domain but navigates to a different path after the redirect.

**Open redirect chaining** - the registered domain is valid, but it has an open redirect on it. `https://legit.com/redirect?url=https://attacker.com` sends the code to the attacker after the redirect lands on legit.com.

The authorization code also leaks silently through the **Referer header**. If the callback page loads any external resources (analytics scripts, CDN fonts, tracking pixels), the browser sends the current URL - including the `?code=` parameter - as the Referer to those external servers. This doesn't require any URI manipulation.

OAuth 2.1 requires exact URI matching. No substring checks, no wildcards.

---

## Attack 2 - Missing or Weak `state` (OAuth CSRF)

The `state` parameter is a CSRF token that ties the authorization request to the user's session. It needs to be:
- Generated fresh for each OAuth flow
- Tied to the user's current session (stored server-side, not just in the URL)
- Verified by the client after the redirect returns

When `state` is absent or predictable, an attacker can perform an account-linking CSRF attack:

1. Attacker initiates an OAuth flow to connect *their own* external account (e.g. their GitHub) to their account on the target app
2. Attacker captures the callback URL - `https://target.com/callback?code=ATTACKER_CODE&state=...`
3. Attacker stops before the callback completes and sends that callback URL to the victim
4. Victim (already logged in to target.com) visits the URL
5. Target app processes the callback, links the attacker's external account to the victim's target.com session
6. Attacker now logs into target.com via their GitHub account - and gets the victim's account

This is a CSRF attack specific to OAuth's multi-step redirect flow. The impact is full account takeover without ever knowing the victim's password.

---

## Attack 3 - Authorization Code Replay

The authorization code should be single-use. RFC 6749 explicitly states that if a code is used more than once, the authorization server should revoke all tokens previously issued from that code and treat it as a potential attack.

Many implementations skip this. A captured authorization code - from a Referer header leak, a logged URL, or a XSS payload - can be replayed to obtain a token even after it's already been legitimately exchanged.

---

## Attack 4 - Insecure Token Storage

The access token is equivalent to a session cookie. Where it's stored determines how it can be stolen.

`localStorage` and `sessionStorage` are accessible to any JavaScript running on the page. A single XSS vulnerability anywhere on the domain can exfiltrate every stored token. This is a significant problem because SPAs frequently use `localStorage` for convenience.

The URL fragment (`#access_token=...`) from Implicit flow gets saved in browser history and sent in Referer headers.

Secure storage means an `HttpOnly` cookie: inaccessible to JavaScript, only sent over HTTPS, with `SameSite=Strict`. The tradeoff is that this makes CSRF protection necessary - but CSRF is a solvable problem; XSS-based token theft from `localStorage` is much harder to prevent.

---

## Identifying OAuth in a Target

Beyond the visual "Login with X" buttons, OAuth flows leave identifiable traces in traffic:

- Authorization requests with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`
- Callbacks with `?code=` parameters
- Token requests to endpoints named `/token`, `/oauth/token`, `/oauth2/token`
- Bearer token usage in `Authorization: Bearer <token>` headers to API endpoints

Framework-specific endpoint patterns: Django OAuth Toolkit uses `/o/authorize/`, Spring Security uses `/oauth/authorize`, IdentityServer uses `/connect/authorize`. Error messages on bad `client_id` values often reveal the OAuth library and its version.

---

## OAuth 2.1 Changes

OAuth 2.1 is a consolidation of best practices into formal requirements:

| What Changed | Why |
|---|---|
| Implicit grant removed | URL fragment token exposure - replaced by Auth Code + PKCE |
| ROPC grant removed | Client handles raw credentials - no legitimate modern use case |
| `state` mandatory | CSRF protection is non-negotiable |
| PKCE mandatory for all clients | Even confidential clients must use it |
| Exact URI matching required | Substring and wildcard matching caused too many exploits |

---

## Real-World CVEs

| CVE | Target | What Broke |
|---|---|---|
| CVE-2022-24785 | Passport.js | `redirect_uri` validation bypass - auth code could be redirected to attacker |
| CVE-2021-27582 | Microsoft identity platform | PKCE could be stripped from requests - downgrade to PKCE-less flow |
| CVE-2020-7692 | Google OAuth client (Java) | Missing `state` validation - CSRF account takeover |
| CVE-2014-8671 | Multiple providers | "Covert redirect" - open redirect on registered domain chained with OAuth to steal codes |
