# ribosome docs site

The [ribosome.medullaflow.org](https://ribosome.medullaflow.org) docs site —
an [Astro](https://astro.build) + [Starlight](https://starlight.astro.build)
project, kept separate from the root `package.json`/lockfile (see
[D49](../ARCHITECTURE.md#design-decisions)) so its dependency tree stays out
of the way for anyone only working on `src/`/`test/`.

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
