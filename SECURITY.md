# Security Policy

MUSICA takes the security and privacy of its users seriously. As an open-source client running on personal devices, we are committed to safeguarding user data, credentials, and API communication.

---

## Supported Versions

| Version | Supported |
| :--- | :--- |
| 1.1.x | :white_check_mark: |
| < 1.1.0 | :x: |

---

## Reporting a Vulnerability

If you discover a security vulnerability within MUSICA, please do **not** open a public issue.

Instead, please send a private security report to the maintainer:
- **Email**: `adharshm38@gmail.com`
- **Subject**: `[SECURITY VULNERABILITY] MUSICA - <Short Description>`

Please include in your report:
1. A clear description of the vulnerability.
2. Steps to reproduce the issue (proof of concept or sample payload).
3. Potential impact of the issue.
4. Suggested fix or mitigation, if known.

### Response Timeline
- **Initial Response**: Within 48 hours acknowledging receipt.
- **Assessment & Triage**: Within 5 business days.
- **Fix & Disclosure**: Coordinated disclosure after a patched build is verified and released.

---

## Security Principles in MUSICA

1. **Zero Tracking**: MUSICA contains no third-party telemetry, ads, or analytics tracking SDKs.
2. **On-Device Storage**: Listening statistics, playlists, and history are kept exclusively on your local device.
3. **No Credential Exposure**: Private tokens, session cookies, and API keys are stored encrypted in private internal app storage (`EncryptedSharedPreferences` / private app sandbox) and never transmitted to unauthorized third parties.
