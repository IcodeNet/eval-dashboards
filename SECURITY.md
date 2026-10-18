# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. Include the version, the command you ran, and the smallest input that shows the problem.

You can expect an acknowledgement within 7 days. We aim to ship a fix, or a clear mitigation, within 90 days, and we will credit you in the release notes if you want.

## Supported versions

While the package is below 1.0, only the latest release gets security fixes.

## What is in scope

- Writing files outside the folders a command is meant to use (path traversal).
- Report output that runs script (HTML injection) when built from untrusted artifact files.
- `publish --redact` leaving evidence in the published output.
- Secrets or private data written to logs, reports or the npm package.

## What is out of scope

- Problems that need an attacker to already control your machine or your CI secrets.
- Content you choose to put in free-text fields that `--redact` does not remove (row names and run tags).
- Development-only dependency advisories that do not reach the installed package.
