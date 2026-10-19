# docs-site

Astro project that builds the public docs and publishes them to GitHub Pages at
`https://icodenet.github.io/eval-dashboards/`.

## What it publishes

- `/docs/...`: one page per Markdown file in `../docs/`. The Markdown is read in place, so editing a file in `docs/` is the only step. Links between docs become site links. A link to a file outside `docs/` becomes a GitHub link.
- `/v1/...` and `/`: the hand-written pages that existed before the Astro build, kept byte for byte in `public/` so their addresses do not change.

## Commands

Run from the repo root. Astro 7 needs Node 22.22 or newer.

```sh
pnpm docs:build   # builds docs-site/dist
pnpm docs:check   # fails on a broken internal link or asset in docs-site/dist
```

`pnpm --filter @icodenet/eval-dashboards-docs-site dev` starts a local dev server.

## Publish

`.github/workflows/docs-site-pages.yml` builds the site, runs the link check, and only then deploys `docs-site/dist`. CI runs the same build and check on every pull request.

`docs-site/` is not part of the npm package (`package.json` `files` does not list it).
