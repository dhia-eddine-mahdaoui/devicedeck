# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

> **Status:** application in progress. Until it is approved, release installers are not signed.

## What is signed

Only the Windows installers (`.exe` and `.msi`) of official DeviceDeck releases. They are built from this repository's source code by the [Release workflow](.github/workflows/release.yml) on GitHub Actions; no file built on a personal computer is ever signed.

## Team roles

| Role | Who |
| --- | --- |
| Committers and reviewers | [Dhia Mahdaoui](https://github.com/dhia-eddine-mahdaoui) |
| Approvers (approve each signing request) | [Dhia Mahdaoui](https://github.com/dhia-eddine-mahdaoui) |

Changes from other contributors arrive as pull requests and are reviewed by a committer before they are merged. All team members use two-factor authentication on GitHub.

## Privacy

DeviceDeck does not collect or send any personal data. It has no accounts, no telemetry and no analytics. The websites you open in it are loaded directly from those websites, as in any browser. Its local MCP server listens only on your own computer (`127.0.0.1`) and is never reachable from other machines.
