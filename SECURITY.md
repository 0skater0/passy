# Security policy

## Supported versions

Only the latest release is supported. Fixes land on `master` and ship in
the next semver release.

## Reporting

Please report security-relevant findings privately through GitHub
Security Advisories:

https://github.com/0skater0/passy/security/advisories/new

Do not open a public issue for security topics. The advisory form lets
us work on a fix privately, request a CVE, and coordinate disclosure.

### What helps

- A short description of the problem and its impact.
- Steps to reproduce or a minimal proof-of-concept.
- The Passy version or commit SHA you tested against.
- A suggested fix, if you have one.

### What to expect

- Acknowledgement within a few days.
- A fix timeline that depends on severity — high-severity issues get
  priority, lower-severity ones land in the next scheduled release.
- Credit in the release notes, if you want it.

## Out of scope

- Findings that depend on a compromised host or stolen admin credentials.
- Traffic-volume issues from a single source — rate limiting is tuned
  for normal usage, not unlimited adversarial traffic.
- Reports produced purely by automated scanners without a demonstrated
  impact path.
