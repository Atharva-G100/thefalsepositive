# The False Positive

Personal security writeups, blog posts, and archived study notes by vaLak. Built with Astro and adapted from the MIT-licensed [Nayuta theme](https://github.com/yuanzui-cf/nayuta).

## Local development

Use Node.js 22 and npm. The dependency lockfile is committed.

```sh
npm ci
npm run dev
```

Astro prints the local preview URL. To check the production output:

```sh
npm run build
npm run preview
```

`npm run deploy` builds and publishes to Cloudflare Pages. Run it only when publication is intended. The Cloudflare project is configured in `wrangler.toml`; deployment headers live in `public/_headers`.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/content/ctf/` | Full CTF and machine writeups |
| `src/content/blog/` | Blog posts; intentionally empty until the first post |
| `src/content/handbook/` | Original archived study notes |
| `src/pages/` | Routes, content rendering, and the search endpoint |
| `src/layouts/` | Shared layout adapter and floating reading/music tools |
| `src/theme/` | Nayuta layout, components, styles, utilities, and license |
| `src/assets/` | Emblem, banner, and category artwork optimized by Astro |
| `public/` | Directly served news/toolkit styles, news script, and headers |
| `docs/artwork/` | Artwork generation prompts and provenance |

`node_modules/`, `.astro/`, and `dist/` are generated locally and ignored by Git. Source files use LF line endings through `.gitattributes`.

## Writing

Writeups live in `src/content/ctf/`. A CTF entry uses this frontmatter:

```yaml
---
title: "Challenge title"
date: "2026-11-23"
category: "ctf"
ctf: "Competition name"
description: "A short introduction to the writeup."
tags: [Web]
---
```

Use `category: "machine"` for a machine walkthrough. Machines share one list; CTF entries are grouped by competition. Existing article URLs remain `/ctf/<slug>`. Keep the full writeup beneath the frontmatter.

Blog posts use `title`, `date`, optional `description`, `tags`, and optional `draft: true`. They render at `/blog/<slug>`. All collection fields are defined in `src/content/config.ts`.

The handbook remains available at `/pentest`. Its source notes are preserved in `src/content/handbook/`.

## Site settings and music

Edit identity, navigation links, and the theme in `src/theme/config.ts`. The floating tools menu provides reading preferences saved in the reader's browser, plus top/bottom navigation.

Music is intentionally empty. When tracks are ready, put audio files in `public/music/` and add entries to `src/theme/music.ts`:

```ts
export const musicTracks: MusicTrack[] = [
  { title: 'Track title', src: '/music/track.mp3' },
];
```

The player uses native audio controls, loads audio on request, and does not autoplay. Playback belongs to the current page and stops on full-page navigation.

## Attribution

Nayuta's MIT license is retained in `src/theme/LICENSE.txt`. Artwork prompts and the generation mode are recorded in `docs/artwork/`. User-supplied reference wallpapers are not duplicated in this repository.
