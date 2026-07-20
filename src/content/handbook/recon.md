---
title: "Recon — Nmap & Service Enumeration"
section: "Red-Teaming"
order: 2
tags: ["nmap", "recon", "enumeration"]
---

# Recon — Nmap & Service Enumeration

> Write your own notes here. This is a starter template.

## Nmap Basics

```bash
# Full TCP scan with service/version detection
nmap -sC -sV -oA nmap/full -p- <TARGET_IP>

# Fast scan (top 1000 ports)
nmap -T4 -F <TARGET_IP>

# UDP scan (slow, use for specific services)
nmap -sU --top-ports 100 <TARGET_IP>
```

## Service Enumeration

### HTTP/HTTPS (80/443)

```bash
# Directory brute force
gobuster dir -u http://<TARGET> -w /usr/share/wordlists/dirb/common.txt

# Nikto web scan
nikto -h http://<TARGET>
```

### SMB (445)

```bash
# List shares
smbclient -L //<TARGET> -N

# Enumerate with crackmapexec
crackmapexec smb <TARGET>
```

> **L's Note:** Always scan for all ports (`-p-`). Many CTF boxes hide services on non-standard ports.
