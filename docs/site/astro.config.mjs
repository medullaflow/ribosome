// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors
// @ts-check
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	// Custom domain (public/CNAME), served at its own root -- not a
	// project-pages subpath -- so `base` stays the default '/'. Needed for
	// @astrojs/sitemap and Starlight's canonical URLs to emit the real
	// production URL rather than a placeholder.
	site: 'https://ribosome.medullaflow.org',
	integrations: [
		starlight({
			title: 'ribosome',
			description:
				'The MCP package manager — declare language runtimes and MCP servers in one manifest, resolved together and pinned into a reproducible lockfile before any workflow runs.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/medullaflow/ribosome' },
			],
			editLink: {
				baseUrl: 'https://github.com/medullaflow/ribosome/edit/main/docs/site/',
			},
			sidebar: [
				{
					label: 'Guides',
					items: [{ label: 'Quickstart', slug: 'guides/quickstart' }],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'CLI', slug: 'reference/cli' },
						{ label: 'Manifest (ribosome.json)', slug: 'reference/manifest' },
						{ label: 'Library API', slug: 'reference/api' },
						{ label: 'MCP server schema', slug: 'reference/schema' },
					],
				},
				{
					label: 'Architecture',
					items: [{ label: 'How ribosome works', slug: 'architecture' }],
				},
			],
		}),
		sitemap(),
	],
});
