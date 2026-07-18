# ribosome docs site

[![CI](https://github.com/medullaflow/ribosome/actions/workflows/ci.yml/badge.svg)](https://github.com/medullaflow/ribosome/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@medullaflow/ribosome)](https://www.npmjs.com/package/@medullaflow/ribosome)
[![npm downloads](https://img.shields.io/npm/dm/@medullaflow/ribosome)](https://www.npmjs.com/package/@medullaflow/ribosome)
[![License: MPL 2.0](https://img.shields.io/badge/License-MPL--2.0-blue.svg)](https://www.mozilla.org/en-US/MPL/2.0/)

The [ribosome.medullaflow.org](https://ribosome.medullaflow.org) docs site —
an [Astro](https://astro.build) + [Starlight](https://starlight.astro.build)
project, kept separate from the root `package.json`/lockfile so its dependency
tree stays out of the way for anyone only working on `src/`/`test/`.

```sh
bun install
bun run dev       # local dev server at localhost:4321
bun run build     # production build to ./dist/
bun run preview   # preview a production build locally
```

Content lives under `src/content/docs/` — each `.md`/`.mdx` file is exposed
as a route based on its path. Sidebar structure and site-wide config are in
`astro.config.mjs`. Static assets (e.g. `CNAME`, `robots.txt`) live in
`public/` and copy through to the build output unchanged.

Deployed by [`.github/workflows/docs.yml`](../../.github/workflows/docs.yml)
on every push to `main` that touches this directory.
