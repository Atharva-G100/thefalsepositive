---
title: "JWT Attacks"
section: "Web Authentication & Session Security"
order: 3
description: "JWT internals, signing algorithms, and why self-contained tokens create a fundamentally different trust model - plus every major way that model breaks."
tags: ["jwt", "json-web-token", "none-algorithm", "algorithm-confusion", "kid-injection", "jku", "hashcat"]
---

JSON Web Tokens are self-contained credentials. Unlike a session cookie, a JWT doesn't require the server to look anything up - all the information needed to trust the token (who the user is, what they can do, when it expires) is embedded in the token itself, cryptographically signed by the issuer. This is both the feature and the attack surface.

---

## What's Actually in a JWT

A JWT is three Base64Url-encoded strings joined by dots:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
.
eyJ1c2VybmFtZSI6InVzZXIiLCJhZG1pbiI6MCwiZXhwIjoxNjk5OTk5OTk5fQ
.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

- **Header** - metadata about the token: the algorithm used to sign it (`alg`) and the token type (`typ: JWT`)
- **Payload** - the claims: who the user is, their permissions, when the token expires
- **Signature** - the cryptographic proof that the header and payload haven't been tampered with

The critical point about Base64Url: it's encoding, not encryption. Paste any JWT into [jwt.io](https://jwt.io) and you can read every claim in plaintext. The signature proves the *integrity* of the data (it hasn't been modified), not its *confidentiality* (it's readable by anyone). If you need confidentiality, the standard is JWE (JSON Web Encryption) - a separate spec that most implementations don't use.

**Standard payload claims:**

| Claim | Meaning |
|---|---|
| `iss` | Issuer - who created the token |
| `sub` | Subject - the user or entity the token is about |
| `aud` | Audience - which service(s) this token is valid for |
| `exp` | Expiration - Unix timestamp after which the token is invalid |
| `iat` | Issued At - when the token was created |
| `jti` | JWT ID - a unique identifier, used for revocation blocklists |

---

## The Signing Algorithm Problem

The algorithm that signs the JWT is specified in the header - which the attacker controls. This is structurally problematic.

### Symmetric algorithms (HMAC)

`HS256`, `HS384`, `HS512` - these use a single shared secret for both signing and verification. The server signs the token with the secret when issuing it, and verifies it by recomputing the signature with the same secret when it's submitted.

The weakness: the secret is shared. Any service that verifies tokens must also know the secret, which makes it harder to safely distribute across microservices. And if the secret is weak or default, it can be cracked offline from a captured token.

### Asymmetric algorithms (RSA/EC)

`RS256`, `ES256` and their variants use a key pair. The private key signs - only the issuer has it. The public key verifies - it can be freely distributed to any service that needs to validate tokens.

This is a better model for multi-service architectures. But it introduces a new attack surface: the public key is often published at a known endpoint (`/jwks.json`, `/.well-known/jwks.json`), and its relationship to the verification process can be exploited.

### `none` - no algorithm

The JWT spec defines `alg: none` for use in pre-authenticated pipelines where the token has already been verified by an upstream process. In practice, vulnerable libraries that don't explicitly block it will accept unsigned tokens with `alg: none`, treating them as valid without checking any signature.

---

## Attack 1 - Signature Not Verified

Some services - especially internal APIs and microservice endpoints - decode the JWT payload and use the claims without ever actually verifying the signature. This is usually an oversight during development ("we'll add verification later") that ships to production.

Testing is simple: take a JWT, modify a claim in the payload (base64-decode, change the value, re-encode), and send it with the original signature. If the server accepts the modified token, verification is missing entirely.

---

## Attack 2 - Algorithm Downgrade to `none`

If a server's JWT library doesn't explicitly reject `alg: none`, an attacker can:
1. Take a valid token they received after login
2. Change `alg` in the header to `none`
3. Modify the payload (e.g. set `admin: 1`)
4. Remove the signature entirely, keeping the trailing dot: `header.payload.`

The server that doesn't block `none` treats this as valid.

The fix is straightforward but requires explicit implementation: never read the algorithm from the token's own header when verifying. Always specify the expected algorithm in your verification code:

```python
# Correct - algorithm is hardcoded, not read from token
payload = jwt.decode(token, secret, algorithms=["HS256"])
```

Case variations matter here - try `"None"`, `"NONE"`, `"nOnE"` as some libraries do string comparison without normalising.

---

## Attack 3 - Weak Secret (Offline Cracking)

HMAC-signed JWTs are verifiable by anyone who knows the secret. If you capture a valid token, you can attempt to crack the secret offline with no interaction with the server - no lockouts, no rate limiting, no noise in logs.

The token itself contains everything needed to verify guesses. Hashcat mode `16500` handles JWT cracking directly:

```bash
hashcat -m 16500 -a 0 captured.jwt /usr/share/wordlists/rockyou.txt
```

A weak secret like `secret`, `password`, `changeme`, or any common word will crack in seconds. A cryptographically random 256-bit secret would take longer than the age of the universe. The difference is entirely in how the secret was generated.

Once you have the secret, you can sign your own tokens with elevated claims. The server has no way to distinguish your forged token from a legitimate one - both have valid signatures from the same secret.

---

## Attack 4 - Algorithm Confusion (RS256 → HS256)

This is one of the more intellectually interesting JWT attacks because it exploits the type system of the algorithms rather than a simple implementation mistake.

The setup: a server accepts both `RS256` (asymmetric) and `HS256` (symmetric) tokens. When it sees `HS256`, it verifies using the HMAC secret. When it sees `RS256`, it verifies using the RSA public key.

The attack: the RSA public key is publicly available (that's the point - it's meant to be shared). An attacker changes the `alg` claim to `HS256` and signs the forged token using the RSA public key as the HMAC secret. A vulnerable library, when it sees `HS256`, will attempt HMAC verification with whatever key it has - and if that key happens to be the public key, the verification passes.

```python
# Public key used as HMAC secret
public_key = open("public.pem").read()
forged = jwt.encode({"username": "user", "admin": 1}, public_key, algorithm="HS256")
```

The fix requires strict separation between algorithm families in the verification logic - a token claiming `HS256` should only be verified with the HMAC secret, never with the RSA key. The two code paths need to be completely separate.

---

## Attack 5 - `kid` Header Injection

The `kid` (Key ID) claim is meant to indicate which key the server should use when it has multiple signing keys (key rotation scenarios). The server looks up the key by ID and uses it to verify the signature.

If that lookup uses the `kid` value directly in a database query without sanitisation, it's SQL injectable:

```json
{"alg": "HS256", "kid": "' UNION SELECT 'attacker_secret' -- "}
```

The server executes something like `SELECT key FROM signing_keys WHERE id = '<kid>'`. The injected payload makes it return `attacker_secret`. The attacker signs their forged token with `attacker_secret` - the server verifies it using the same value the query returned - signature check passes.

If the server reads the key from a file path based on `kid`, path traversal becomes possible:

```json
{"alg": "HS256", "kid": "../../dev/null"}
```

`/dev/null` reads as empty. An HMAC signature computed with an empty key is still a valid signature - just one computed with an empty secret. Sign your forged token with an empty string, and verification passes.

---

## Attack 6 - `jku` / `x5u` Header Injection

The `jku` claim tells the server where to fetch the JWK Set - the set of public keys used for signature verification. This is a legitimate feature for key rotation: rather than hardcoding public keys, the server fetches them dynamically.

The vulnerability: if the server doesn't validate the `jku` domain against an allowlist, the attacker can point it anywhere:

```json
{"alg": "RS256", "jku": "https://attacker.com/jwks.json"}
```

The attacker generates their own RSA key pair, hosts the public key at that URL in JWK format, signs the forged token with the corresponding private key, and injects the `jku` claim. The server fetches the attacker's JWK set, verifies the signature using the attacker's public key - and it passes, because the signature genuinely was made by the corresponding private key.

The attacker effectively replaced the issuer's signing keys with their own.

---

## The Revocation Problem

Server-side sessions can be instantly invalidated by deleting the session record. JWTs cannot. The token is self-validating - the server doesn't need to store anything to verify it. This means that once a JWT is issued, it's valid until it expires, regardless of what happens in the interim (logout, password change, account suspension).

The workarounds are all imperfect:

**Blocklist by `jti`** - store the JWT's unique ID in Redis on logout, check it on every request. Effectively turns stateless JWT auth into stateful auth - defeats much of the point of JWTs but is necessary for proper revocation.

**Short expiry + refresh tokens** - access tokens expire in 5–15 minutes. A separate, longer-lived refresh token (stored securely, checked server-side) generates new access tokens. A stolen access token is only valid for its short lifetime.

**Key rotation** - changing the signing key invalidates all tokens at once. Useful as a nuclear option in a confirmed breach but disruptive to legitimate users.

There's no perfect solution. Short expiry is the most practical mitigation for most applications.

---

## Quick Reference - Attacks and Fixes

| Attack | Root Cause | How to Test | Fix |
|---|---|---|---|
| No signature verification | Developer oversight | Modify payload, keep old signature | Enforce verification in all paths |
| `none` algorithm | Library doesn't reject it | Set `alg: none`, remove signature | Allowlist algorithms explicitly |
| Weak HMAC secret | Poor secret generation | Hashcat `-m 16500` offline | 256-bit cryptographically random secret |
| Algorithm confusion | Mixed algorithm handling | Sign with public key via HS256 | Strict separation of algorithm families |
| `kid` injection | Unsanitised DB/file lookup | Inject SQL or path traversal into kid | Sanitise; never use kid in queries directly |
| `jku` spoofing | No URL validation | Point jku to attacker-controlled JWK set | Strict domain allowlist for jku |
| No revocation | Stateless design | Logout and replay token | Blocklist + short expiry |

### Real-World CVEs

| CVE | Target | What Happened |
|---|---|---|
| CVE-2015-9235 | `jsonwebtoken` (Node.js) | `none` algorithm accepted; fixed in v4.2.2 |
| CVE-2016-5431 | `python-jose` | Algorithm confusion RS256 → HS256 |
| CVE-2022-21449 | Java 15–18 (ECDSA) | "Psychic Signatures" - blank ECDSA signature accepted as valid by Java's crypto library |
| CVE-2022-23529 | `jsonwebtoken` (Node.js) | `secretOrPublicKey` parameter allowed path traversal via header injection |
