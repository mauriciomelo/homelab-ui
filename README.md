# Homelab UI Proof of Concept

> [!WARNING]
> **This is an experimental project and should be treated as a Proof of Concept only.**
>
> This code is likely insecure and is not representative of my usual code quality standards. It was created for demonstration purposes, and **I do not intend to maintain or provide support for it.** Please use it at your own risk.

## Install (server)

```sh
curl -sfL https://raw.githubusercontent.com/mauriciomelo/homelab-ui/refs/heads/main/install.sh | sh -s -
```

## Production

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

## Visual tests

Test commands require Docker. Vitest runs locally; Chromium runs in a pinned Linux/AMD64 container, also used in CI.

```sh
pnpm test:visual
pnpm test:visual:update # Update the single baseline per test; review the image diff.
```

Failure images and diffs: `apps/web/.vitest-attachments/visual/`. Apple Silicon uses AMD64 emulation.
