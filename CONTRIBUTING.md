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

DeviceDeck is licensed under the [GNU AGPL v3.0](LICENSE), and is also offered under a separate commercial license. So that both stay possible, by submitting a contribution you confirm that:

1. you wrote it yourself (or otherwise have the right to submit it), and
2. you license it under the AGPL v3.0, **and** you grant Dhia Mahdaoui a perpetual, worldwide, royalty-free, irrevocable right to use, modify and relicense it, including under the commercial license.

You keep the copyright to your contribution.
