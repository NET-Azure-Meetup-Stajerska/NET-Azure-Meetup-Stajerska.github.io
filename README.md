# .NET & Azure Meetup Štajerska

Website of the [.NET & Azure Meetup Štajerska](https://net-azure-meetup-stajerska.github.io/) community. It is plain static HTML, CSS and JS on GitHub Pages, served from the root of `main`. There is no framework and no CI, and the site sets no cookies and has no analytics.

The site has a home page, an [events](https://net-azure-meetup-stajerska.github.io/events/) section with one page per event, a [gallery](https://net-azure-meetup-stajerska.github.io/gallery/), a [community](https://net-azure-meetup-stajerska.github.io/community/) section with one profile per member, and a privacy page.

## How it works

`node tools/build.mjs` (Node 18+, no dependencies) reads `data/*.json` and generates the HTML. The generated files are committed, so publishing means build, commit and `git push`.

You edit these by hand: `data/*.json`, `assets/css/site.css`, `assets/js/*`, `tools/build.mjs` and everything under `images/`.

These are generated, so don't touch them: `index.html`, `404.html`, `events/**`, `gallery/**`, `community/**`, `privacy/**`, `sitemap.xml` and `robots.txt`.

`googleaa0d831523091495.html` is the Google Search Console verification file. Leave it in the root.

```
data/
  site.json         name, tagline, Discord and LinkedIn links, URL
  events.json       every event (the file you edit most)
  community.json    community members
  sessionize/       cached Sessionize snapshots, refreshed on each build
images/
  <YYYYMMDD>/       event photos (~1600px wide JPEG, under 500 KB)
  community/        member portraits (square, ~480px)
  stickers/         participation stickers
```

Speakers and agenda come from [Sessionize](https://sessionize.com/). They are baked into the HTML at build time and refreshed in the browser. The browser also decides whether an event is upcoming or past, so events move to "past" without a rebuild. The community cards are shuffled in the browser on every visit.

## Common tasks

After any of these, run `node tools/build.mjs`, then `git add -A`, commit and `git push`.

### Add an event

Add an object to `data/events.json`, copying an existing one. The fields are `slug`, `name`, `sessionizeId`, `startsAt` and `endsAt`, `description`, `ticketsUrl`, `location` (or `"online": true`) and `photos`. Partner events also take `organizer`, `externalUrl` and `speakers`. Photos need alt text, written as `{ "src": "/images/...jpg", "alt": "what the photo shows" }`.

### Add a community member

Add an object to `data/community.json`:

```json
{ "slug": "name-surname", "name": "Name Surname", "photo": "/images/community/name-surname.jpg",
  "bio": ["First paragraph", "Second paragraph"], "topics": [".NET", "Azure"],
  "links": ["https://www.linkedin.com/in/...", "https://github.com/..."] }
```

The slug becomes the URL (`/community/name-surname/`) and must be ASCII. Save the portrait in `images/community/` instead of linking to it: the Content-Security-Policy blocks images from other sites, and some URLs (LinkedIn's, for one) expire. Each link gets the icon for its network automatically.

### Issue a participation sticker

Put the image in `images/stickers/`, then add this to the event in `data/events.json`:

```json
"sticker": { "name": "Sticker name", "src": "/images/stickers/<slug>.png", "alt": "what the sticker shows" },
"attendees": ["name-surname", "other-name"]
```

The sticker shows on the event page and in each attendee's "Stickers collection", where it links back to the event. Attendees are community member slugs, so add people to `community.json` first.

## Preview

```bash
node tools/build.mjs --serve    # http://localhost:8080
```

## Rules to keep

- No cookies and no analytics. The only third parties are GitHub (hosting), Sessionize (speaker data) and OpenStreetMap (venue map). A strict Content-Security-Policy in `tools/build.mjs` limits what can load. If you add an external service, update the policy and the privacy page, and check whether it sets cookies. Don't use a Google Maps embed.
- Photos and stickers need alt text, and text contrast must stay at WCAG 2.2 AA in both the light and dark themes.
- Every page gets a canonical URL, Open Graph and Twitter tags, JSON-LD and a sitemap entry. The 404 page is `noindex`.

`CLAUDE.md` has the same workflow written for Claude Code, which can do all of this for you.
