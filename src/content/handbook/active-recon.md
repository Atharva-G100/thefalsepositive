---
title: "Active Reconnaissance"
section: "Network Recon"
order: 2
description: "Directly probing targets to map live hosts, OS types, network paths, and open services using ping, traceroute, telnet, and netcat."
tags: ["ping", "traceroute", "netcat", "telnet", "banner-grabbing", "recon"]
---

Active recon means sending packets directly to the target. They can see you now. Only do this on authorized engagements.

The trade-off: you get real, live data from the actual system right now.

---

## Browser DevTools (F12)

You can gather a lot before opening a terminal. Hit F12 on any target web app.

**Network Tab:**
- Watch live HTTP requests and responses
- Look for `Server: nginx/1.18` or `X-Powered-By: PHP/7.4` in response headers (version info = attack surface)
- Spot internal API endpoints JavaScript calls
- Check cookie flags: no `HttpOnly` = XSS risk, no `Secure` = sent over HTTP too

**Elements / Inspector Tab:**
- Read the HTML source for `<!-- comments -->` left by developers
- Look for hidden form fields (`<input type="hidden" value="role=user">`) - try changing the value
- Check for API keys hardcoded in inline scripts

**SSL Certificate (click the padlock):**
- Check Subject Alternative Names (SANs)
- A cert for `*.company.com` reveals the subdomain structure
- You might find `dev`, `staging`, or `vpn` listed - no scanner needed

---

## ping

Sends an ICMP Echo Request and waits for a reply. Confirms if a host is alive.

```bash
ping -c 4 TARGET_IP       # Linux: stop after 4 packets
ping TARGET_IP            # Windows: 4 packets by default
```

**TTL Fingerprinting:**

Each router hop subtracts 1 from the TTL. The starting value hints at the OS:

| TTL Received | Likely OS |
|---|---|
| ~60-64 | Linux / Unix / macOS |
| ~120-128 | Windows |
| ~250-255 | Cisco / Network devices |

If you get `TTL=61`, the target is a Linux host 3 hops away (64 - 3 = 61).

Note: many targets block ICMP. No ping response does not mean the host is down.

---

## traceroute

Maps every router hop between you and the target. Useful for understanding network topology.

```bash
traceroute TARGET_IP         # Linux (UDP by default)
tracert TARGET_IP            # Windows (ICMP)
traceroute -I TARGET_IP      # Linux, force ICMP
traceroute -T TARGET_IP      # Linux, force TCP SYN (better against firewalls)
```

**Reading the output:**

```
1   192.168.1.1    1.2 ms   - your router
2   10.0.0.1       8.4 ms   - ISP gateway
3   * * *                   - hop dropping traceroute packets
4   TARGET_IP     24.8 ms   - destination
```

`* * *` means that router is silently dropping traceroute. The destination can still be reachable.

---

## telnet (Banner Grabbing)

Designed for remote terminal access, everything is cleartext. Used in recon to connect directly to a port and read what the service announces.

```bash
telnet TARGET_IP 22         # SSH banner
telnet TARGET_IP 21         # FTP banner
telnet TARGET_IP 80         # Web server
```

After connecting to port 80, manually send an HTTP request:

```http
GET / HTTP/1.1
Host: target.com

```
(Press Enter twice. You get the raw response headers including `Server:` version.)

---

## netcat (nc)

More flexible than telnet. Works on TCP and UDP, can scan ports, grab banners, and transfer files.

```bash
nc -v TARGET_IP PORT              # Connect + show connection status
nc -z -v TARGET_IP 20-100         # Port scan without sending data
nc -u TARGET_IP PORT              # UDP mode
```

**Netcat vs Telnet:**

| Task | Use |
|------|-----|
| Quick banner grab | Either |
| Scripting / piping | nc |
| File transfers | nc |
| UDP services | nc only |

In practice, use `nc`. Telnet is good to know because it is available everywhere by default.

---

## Cheat Sheet

```bash
# BROWSER
# F12 > Network Tab    - headers, cookies, API endpoints
# F12 > Elements Tab   - comments, hidden fields
# Padlock > Certificate - Subject Alternative Names

# PING
ping -c 4 TARGET              # Linux
ping TARGET                   # Windows
# TTL ~64 = Linux | TTL ~128 = Windows | TTL ~255 = Cisco

# TRACEROUTE
traceroute TARGET             # Linux UDP
tracert TARGET                # Windows ICMP
traceroute -I TARGET          # Linux ICMP
traceroute -T TARGET          # Linux TCP SYN (bypass firewalls)

# TELNET
telnet TARGET_IP 22           # SSH banner
telnet TARGET_IP 21           # FTP banner
telnet TARGET_IP 80           # Then: GET / HTTP/1.1 + Host: + Enter x2

# NETCAT
nc -v TARGET PORT             # Connect + status
nc -z -v TARGET 20-100        # Port scan
nc -u TARGET PORT             # UDP
```
