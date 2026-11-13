# Contributing to DeviceDeck

Thanks for your interest! Bug reports, ideas and pull requests are all welcome.

## Report a bug or ask for a feature

Open an [issue](../../issues) and include:

- your system (Windows / macOS / Linux and version) and the DeviceDeck version,
- the website and device you were testing, if it matters,
- what you expected and what happened instead (a screenshot helps).

Security problems: please don't open a public issue. Use GitHub's private vulnerability reporting (Security tab → "Report a vulnerability").

## Send a pull request

1. Fork the repository and create a branch from `main`.
2. Build and try your change (see [Build from source](README.md#build-from-source)):
   ```bash
   npm ci
   npm run desktop
   ```
3. Keep the change focused: one fix or feature per pull request.
4. Open the pull request with a short description of what changed and why. The CI check must pass on Windows, macOS and Linux.

Large changes: open an issue first so we can agree on the approach before you spend time on it.

## License of contributions

DeviceDeck is source-available, not open source: it is free for private use, and public use needs permission (see [LICENSE](LICENSE)). By submitting a contribution you agree that it becomes part of DeviceDeck under that license, as described in section 3 of the [LICENSE](LICENSE). Your fork is for proposing changes back here; please don't publish or distribute it separately.
