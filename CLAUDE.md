# .NET & Azure Meetup Štajerska — community website

Static site on GitHub Pages, served from the repo root of `main`. **Publishing = commit + `git push`.**
There is no framework: `node tools/build.mjs` (Node 18+, zero dependencies) generates the HTML from `data/*.json`,
and the generated files are committed.

## Adding / updating an event (the common task)
1. Edit `data/events.json` — add an object (copy an existing one). Fields: `slug` (URL: `/events/<slug>/`), `name`,
   `sessionizeId` (from the Sessionize API URL, or `null`), `startsAt`/`endsAt` (ISO with `+01:00`/`+02:00` offset),
   `description`, `ticketsUrl`, `callForPapersUrl` (or `null`), `location` (omit and set `"online": true` for online events; name, address, mapsUrl, embedUrl, parkings[]),
   `banner` (optional share image, `/images/banners/<slug>.png`), `photos` (array of `/images/<YYYYMMDD>/<file>.jpg`).
2. Photos go in `images/<YYYYMMDD>/`. Prefer ~1600px wide JPEGs (<500 KB each).
3. Run `node tools/build.mjs` (also refreshes the Sessionize snapshot in `data/sessionize/`).
4. Preview with `node tools/build.mjs --serve` → http://localhost:8080 (optional).
5. Commit **everything** (sources + generated files) and `git push`.

Site-wide text/links (tagline, Discord, LinkedIn, URL) live in `data/site.json`.

## How it works
- Generated (never hand-edit): `index.html`, `404.html`, `events/**`, `gallery/**`, `sitemap.xml`, `robots.txt`.
- Hand-edited: `assets/css/site.css`, `assets/js/*`, `tools/build.mjs`, `data/*`.
- Speakers and agenda come from Sessionize: baked into the HTML at build time (SEO) and refreshed live in the browser
  by `assets/js/site.js`. Both use the same renderer, `assets/js/sessionize.mjs`.
- Upcoming/past is decided at build time and re-evaluated in the browser, so events flip to "past" without a rebuild.
- Always run the build before committing, or the generated HTML goes stale.

## Partner / external events (e.g. Microsoft Reactor)
Same file, extra optional fields: `organizer: {name, url, logo}` (`logo: "microsoft"` shows the unaltered Microsoft logo; only for events the company actually organizes) (shows a tag on the card and an "Organized by" line),
`externalUrl` (button to the organizer's own event page), and `speakers: [{name, tagLine, talk, photo, links}]` for
events without Sessionize (leave `sessionizeId` null; the agenda section is then omitted).
Use text only for third-party brands — no logos.

## Accessibility, SEO, privacy (keep these true when editing)
- **Photos need alt text.** In `photos`, use `{ "src": "/images/...jpg", "alt": "what the photo shows" }` (plain strings still work but get a generic alt). Describe people/actions/slides, don't repeat the event name.
- No cookies, no analytics, no third-party requests before the visitor acts (Google Maps loads on click). A strict Content-Security-Policy in `tools/build.mjs` enforces this — if you add a new external service, it must be added there *and* disclosed on the privacy page (`/privacy/`, in `tools/build.mjs`). That is why there is no cookie banner; adding any tracker/analytics/cookie changes that.
- Text colors were checked with axe-core (WCAG 2.2 AA, light + dark): keep contrast when changing the palette.
- Every page gets canonical URL, Open Graph/Twitter tags, JSON-LD (Organization/WebSite, Event, BreadcrumbList), sitemap entry; the 404 is `noindex`. Descriptions are auto-trimmed to ~158 chars.
