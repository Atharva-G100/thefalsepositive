---
title: "Passive Reconnaissance"
section: "Network Recon"
order: 1
description: "OSINT techniques: WHOIS, DNS lookups, subdomain discovery, and Shodan fingerprinting without touching the target."
tags: ["osint", "whois", "dns", "dig", "shodan", "recon"]
---

Passive recon means collecting information from public sources without sending a single packet to the target. They never see you. Do as much of this as possible before going active.

---

## WHOIS

Queries registrar databases for domain ownership info. Runs on TCP port 43.

```bash
whois target.com
```

**What to extract:**

- **Registrar** - who they bought the domain from (Namecheap, GoDaddy, Cloudflare)
- **Creation Date** - recently registered domains are suspicious (could be phishing infra)
- **Expiry Date** - expired domains can be bought and weaponized
- **Name Servers** - Cloudflare NS often means the real origin IP is hidden behind a CDN
- **Registrant Contact** - usually redacted post-GDPR, but sometimes exposes real names or emails

---

## DNS Record Types

DNS maps domain names to IPs and defines mail routing rules.

| Record | Purpose |
|--------|---------|
| **A** | Domain to IPv4 address |
| **AAAA** | Domain to IPv6 address |
| **CNAME** | Alias - one name points to another |
| **MX** | Mail servers for the domain |
| **NS** | Authoritative name servers |
| **TXT** | SPF, DMARC, site verification tokens |
| **SOA** | Admin zone metadata |

---

## nslookup

```bash
nslookup target.com                   # A records (default)
nslookup -type=MX target.com          # Mail servers
nslookup -type=TXT target.com         # TXT records
nslookup -type=NS target.com          # Name servers
nslookup target.com 1.1.1.1           # Query via Cloudflare DNS
nslookup target.com 8.8.8.8           # Query via Google DNS
```

Use a specific resolver when your ISP DNS returns stale/cached records.

---

## dig

More detailed and flexible than nslookup. Preferred on Linux.

```bash
dig target.com A
dig target.com MX
dig target.com TXT
dig target.com ANY              # All record types (may be rate-limited)
dig @1.1.1.1 target.com A      # Query via Cloudflare
dig @8.8.8.8 target.com MX     # Query via Google
dig +short target.com           # Clean output, IPs only
```

---

## Subdomain Discovery

Standard DNS won't enumerate unadvertised subdomains. Use these instead:

**DNSDumpster** (`dnsdumpster.com`)
Queries public DNS records and maps subdomains, MX servers, and IP relationships visually.

**Certificate Transparency Logs** (`crt.sh`)
Every TLS certificate issued gets logged publicly. Search `%.target.com` to find every subdomain that has ever had a cert - including dev, staging, and admin subdomains - without sending anything to the target.

---

## Shodan

Search engine for internet-connected devices. Crawls and indexes open ports, banners, and software versions.

```
hostname:target.com
org:"Company Name"
net:192.168.1.0/24
port:3389                       # RDP exposed
http.component:"WordPress"
country:US
```

Combine filters: `org:"Company" port:3389` finds RDP-exposed machines at that org immediately.

---

## Cheat Sheet

```bash
# WHOIS
whois target.com

# NSLOOKUP
nslookup target.com
nslookup -type=MX target.com
nslookup -type=TXT target.com
nslookup target.com 8.8.8.8

# DIG
dig target.com A
dig target.com MX
dig target.com TXT
dig target.com ANY
dig @1.1.1.1 target.com
dig +short target.com

# PASSIVE SUBDOMAIN DISCOVERY
# https://dnsdumpster.com
# https://crt.sh/?q=%.target.com

# SHODAN FILTERS
hostname:target.com
org:"Target Org"
net:TARGET_IP/24
port:443 org:"Target Org"
```
