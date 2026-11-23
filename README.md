# The False Positive

Personal security writeups, blog posts, and archived study notes by vaLak. Built with Astro and adapted from the MIT-licensed [Nayuta theme](https://github.com/yuanzui-cf/nayuta).

## Local development

Use Node.js 22 and npm. The dependency lockfile is committed.

```sh
npm ci
npm run dev
```

Astro prints the local preview URL. Use the `localhost` URL for music playback. In local testing, the same YouTube uploads failed under `127.0.0.1` and played under `localhost`.

To check the production output:

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

Add music in `src/theme/music.ts` using YouTube video IDs. No account, API key, downloaded audio, or extra player dependency is needed:

```ts
export const musicTracks: MusicTrack[] = [
  { title: 'Track title', youtubeId: 'heaCjasEZAk', channel: 'Channel name' },
];
```

The Music panel is a compact nonmodal player with a slowly rotating record, play/pause, previous/next, seeking, and volume. Its four-track playlist is collapsed by default and opens through the Playlist row. Clicking outside the panel or pressing Escape hides it without stopping music. It attempts audible playback at 10% when a page becomes visible. Browsers may refuse automatic sound; a first genuine click outside the music tools triggers one additional playback attempt. The tools tip also offers Play. The tip keeps one stable message for ten seconds of visible reading time, pausing its countdown while the tab is hidden or the tip is hovered or focused. Its dismissal, the user's pause choice, and volume are remembered in session storage. Pausing music prevents automatic restarts on subsequent pages during that visit. Existing sessions using the old 30% default migrate to 10%; later explicit volume choices stay saved.

YouTube’s IFrame Player API and an offscreen privacy-enhanced iframe load automatically for the playback attempt unless music was paused in this session. The initial URL includes the selected video ID, `enablejsapi=1`, and the page origin. The iframe sets `allow="autoplay; encrypted-media"` and `referrerpolicy="strict-origin-when-cross-origin"` before loading. It still streams YouTube video internally; the site does not extract, download, or host audio. Switching away from the browser tab pauses music at its current position; returning resumes the same track unless the user paused it. Internal links use Astro’s client router: only `#site-page` is replaced, keeping the body, tools, SDK and YouTube iframe connected so playback continues without rebuilding the stream. The current page’s menus close and reading preferences are reapplied after navigation. Writeup filters, Toolkit controls and News initialize for each new page; News cancels pending fetches and refresh timers when leaving. The selected track and position remain saved for full navigation, refreshes and Back/Forward restoration. Player failures display YouTube’s exact error code to distinguish upload restrictions from browser identification errors.

The production CSP permits YouTube’s IFrame API script and its normal and privacy-enhanced iframe origins. The `/privacy` page explains third-party playback and browser preferences. Use authorized uploads that permit embedding; availability and region restrictions remain under YouTube’s control. This offscreen-player approach follows the requested audio-style interface, but conflicts with [YouTube’s visibility and background-player policies](https://developers.google.com/youtube/terms/developer-policies). It is not an officially supported audio-only YouTube mode.

## Checks

Player regression checks run without a network connection or browser:

```powershell
node --test tests/music-player.test.mjs tests/site-navigation.test.mjs
```

They exercise the component scripts against a controlled YouTube player and clock, including tab visibility, uninterrupted internal navigation, full navigation restoration, delayed events, pause choices, tip timing, panel dismissal, and News cleanup on navigation. Live YouTube availability and browser autoplay rules still require a browser check.

## Attribution

Nayuta's MIT license is retained in `src/theme/LICENSE.txt`. Artwork prompts and the generation mode are recorded in `docs/artwork/`. User-supplied reference wallpapers are not duplicated in this repository.
