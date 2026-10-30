#!/usr/bin/env node
// Generates the static site (HTML, sitemap, ...) from data/*.json. Zero dependencies, Node 18+.
//   node tools/build.mjs            build everything
//   node tools/build.mjs --serve    build, then preview on http://localhost:8080
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { esc, renderSpeakers, renderAgenda, socialLink, BRAND } from '../assets/js/sessionize.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p) => JSON.parse((await readFile(join(ROOT, p), 'utf8')).replace(/^\uFEFF/, ''));

const site = await readJson('data/site.json');
const people = await readJson('data/community.json');
const events = (await readJson('data/events.json')).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));

// ---------- helpers ----------
const now = new Date();
const isPast = (ev) => new Date(ev.endsAt) < now;
const fmt = (d, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: site.timeZone, ...opts }).format(new Date(d));
const day = (ev) => fmt(ev.startsAt, { day: 'numeric' });
const mon = (ev) => fmt(ev.startsAt, { month: 'short' }).toUpperCase();
const year = (ev) => fmt(ev.startsAt, { year: 'numeric' });
const longDate = (ev) => fmt(ev.startsAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeRange = (ev) =>
  `${fmt(ev.startsAt, { hour: '2-digit', minute: '2-digit' })} – ${fmt(ev.endsAt, { hour: '2-digit', minute: '2-digit' })}`;
const abs = (path) => site.url + path;
// photos may be "/images/x.jpg" or { src, alt } — alt text matters for blind visitors, so prefer the object form.
const photosOf = (ev) => (ev.photos ?? []).map((p) => (typeof p === 'string' ? { src: p } : p));
const clip = (s, n = 158) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
// Tell assistive tech (and everyone) that a link opens a new tab.
const NEW_TAB = ' (opens in a new tab)';
function markNewTabLinks(html) {
  return html.replace(/<a ([^>]*target="_blank"[^>]*)>([\s\S]*?)<\/a>/g, (m, attrs, inner) =>
    /aria-label="/.test(attrs)
      ? `<a ${attrs.replace(/aria-label="([^"]*)"/, (mm, l) => `aria-label="${l}${NEW_TAB}"`)}>${inner}</a>`
      : `<a ${attrs}>${inner}<span class="sr-only">${NEW_TAB}</span></a>`
  );
}

const svg = (paths) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const icons = {
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  pin: svg('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/>'),
  ticket: svg('<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M13 6v12" stroke-dasharray="2 3"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  chat: svg('<path d="M21 12a8 8 0 0 1-11.600 7.100L4 20l1-4.600A8 8 0 1 1 21 12z"/>'),
  car: svg('<path d="M5 16l1.500-6h11L19 16M4 16h16v3h-2v-1.500H6V19H4z"/><circle cx="8" cy="13.500" r=".5"/><circle cx="16" cy="13.500" r=".5"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.500 3 14.500 0 18M12 3c-3 3.500-3 14.500 0 18"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
};

// Brand marks for well-known ticketing / CFP sites, chosen from the link's host (Simple Icons paths).
const discordIcon = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${BRAND.discord}"/></svg>`;
const linkedinIcon = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${BRAND.linkedin}"/></svg>`;
const brandSvg = (d) => `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
const sites = [
  [/(^|\.)eventbrite\.[a-z.]+$/, 'Eventbrite', brandSvg('M10.542 5.81c2.653-.6 5.3.487 6.775 2.54L5.591 11c.405-2.479 2.298-4.591 4.951-5.19zm6.84 9.746a6.47 6.47 0 0 1-3.919 2.634c-2.67.604-5.335-.501-6.804-2.582l11.763-2.657 1.915-.433L24 11.691a11.57 11.57 0 0 0-.305-2.333C22.205 3.04 15.76-.9 9.303.558 2.846 2.017-1.18 8.322.31 14.642c1.491 6.319 7.935 10.259 14.392 8.8 3.805-.86 6.765-3.402 8.25-6.638z')],
  [/(^|\.)sessionize\.com$/, 'Sessionize', brandSvg('M12 0c6.628 0 12 5.372 12 12v10c0 1.097-.903 2-2 2h-7.5l-.001-.169c-.049-2.894-1.347-4.902-3.709-5.96L24 12l-.32-.109c-2.858-.999-5.251-2.462-7.18-4.391-1.928-1.928-3.392-4.322-4.391-7.181L12 0 4 18c0 .667.167 1.167.5 1.5.334.334.834.5 1.5.5l.187.001c3.771.04 5.313 1.295 5.313 3.999H2c-1.097 0-2-.903-2-2V2C0 .903.903 0 2 0h10Zm7.207 4.793c-.781-.781-1.73-1.097-2.121-.707-.39.39-.074 1.34.707 2.121.781.781 1.731 1.098 2.121.707.391-.39.074-1.34-.707-2.121Z')],
];
function siteOf(url) {
  try { const h = new URL(url).hostname; return sites.find(([re]) => re.test(h)); } catch { return undefined; }
}

// Third-party logos, only for events organized by that company (set organizer.logo in events.json). Keep them unaltered.
const logos = {
  microsoft: '<svg class="brand-logo" viewBox="0 0 23 23" role="img" aria-label="Microsoft"><path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#7fba00" d="M12 1h10v10H12z"/><path fill="#00a4ef" d="M1 12h10v10H1z"/><path fill="#ffb900" d="M12 12h10v10H12z"/></svg>',
};
const logoOf = (ev) => logos[ev.organizer?.logo] ?? '';

// ---------- Sessionize snapshot (build-time, cached so an offline build still works) ----------
async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
async function snapshot(ev) {
  if (!ev.sessionizeId) return { all: null, grid: null };
  const cache = join(ROOT, 'data/sessionize', `${ev.sessionizeId}.json`);
  try {
    const [all, grid] = await Promise.all([
      getJson(`https://sessionize.com/api/v2/${ev.sessionizeId}/view/All`),
      getJson(`https://sessionize.com/api/v2/${ev.sessionizeId}/view/GridSmart`),
    ]);
    await mkdir(dirname(cache), { recursive: true });
    await writeFile(cache, JSON.stringify({ all, grid }, null, 1));
    return { all, grid };
  } catch (e) {
    console.warn(`! Sessionize fetch failed for ${ev.slug} (${e.message}); using cached snapshot if any`);
    return existsSync(cache) ? JSON.parse(await readFile(cache, 'utf8')) : { all: null, grid: null };
  }
}

// ---------- page shell ----------
function page({ title, description, path, body, image, imageAlt, jsonLd, bodyAttrs = '', noindex = false, ogType = 'website' }) {
  const fullTitle = path === '/' ? `${site.name} — .NET, Azure & the community` : `${title} · ${site.name}`;
  const img = abs(image ?? site.ogImage);
  description = clip(description);
  const nav = [
    ['/events/', 'Events'],
    ['/gallery/', 'Gallery'],
    ['/community/', 'Community'],
  ];
  const cfp = events.filter((e) => !isPast(e) && e.callForPapersUrl)[0];
  return markNewTabLinks(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' https://cdn.sessionize.com data:; connect-src https://sessionize.com; frame-src https://www.openstreetmap.org; script-src 'self'; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="canonical" href="${abs(path)}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${abs(path)}">
<meta property="og:locale" content="en_GB">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:alt" content="${esc(imageAlt ?? site.name)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(img)}">
<meta name="twitter:image:alt" content="${esc(imageAlt ?? site.name)}">
<meta name="theme-color" content="#0f1226">
<link rel="icon" type="image/png" href="/assets/img/favicon.png">
<link rel="apple-touch-icon" href="/assets/img/icon-192.png">
<script src="/assets/js/theme.js"></script>
<link rel="stylesheet" href="/assets/css/site.css">
${[jsonLd].flat().filter(Boolean).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body${bodyAttrs}>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container bar">
    <a class="brand" href="/"><span class="brand-mark">.NET <em>&amp;</em> Azure</span> <span class="brand-sub">Meetup Štajerska</span></a>
    <nav aria-label="Main">
      ${nav.map(([h, t]) => `<a href="${h}"${path.startsWith(h) ? ' aria-current="page"' : ''}>${t}</a>`).join('\n      ')}
      ${cfp ? `<a href="${esc(cfp.callForPapersUrl)}" target="_blank" rel="noopener noreferrer" data-hide-when-past="${cfp.endsAt}">Call for speakers</a>` : ''}
      <button type="button" id="theme-toggle" class="theme-toggle" data-target="dark" aria-label="Switch to dark theme" hidden>
        <svg class="i-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg class="i-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
      </button>
      <a class="nav-cta" href="${esc(site.discord)}" target="_blank" rel="noopener noreferrer">${discordIcon}Join us</a>
    </nav>
  </div>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="site-footer">
  <div class="container">
    <p class="hashtag">#NETAzureMeetupStajerska</p>
    <p class="social">
      <a href="${esc(site.linkedin)}" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn group" title="LinkedIn group"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${BRAND.linkedin}"/></svg></a>
      <a href="${esc(site.discord)}" target="_blank" rel="noopener noreferrer" aria-label="Discord community" title="Discord community">${discordIcon}</a>
    </p>
    <p>© ${now.getFullYear()} ${esc(site.name)} · <a href="/privacy/">Privacy</a></p>
    <p>Original site design by <a href="https://github.com/fullstackgenerator" target="_blank" rel="noopener noreferrer">Simon Hojnik</a></p>
  </div>
</footer>
<script type="module" src="/assets/js/site.js"></script>
</body>
</html>
`);
}

// ---------- components ----------
// OpenStreetMap embed: no cookies, unlike Google Maps. Marker at the venue, small bounding box around it.
const osmEmbed = ({ lat, lon }) =>
  `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.004},${lat - 0.0018},${lon + 0.004},${lat + 0.0018}&layer=mapnik&marker=${lat},${lon}`;
const osmLink = ({ lat, lon }) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;

// Online events set "online": true and need no "location".
const placeName = (ev) => (ev.online ? 'Online' : ev.location.name);
const placeIcon = (ev) => (ev.online ? icons.globe : icons.pin);

function eventCard(ev) {
  const past = isPast(ev);
  return `<article class="event-card${past ? ' is-past' : ''}" data-start="${ev.startsAt}" data-end="${ev.endsAt}">
  <div class="date-chip" aria-hidden="true"><span class="d">${day(ev)}</span><span class="m">${mon(ev)}</span><span class="y">${year(ev)}</span></div>
  <div class="event-main">
    <h3><a href="/events/${ev.slug}/">${esc(ev.name)}</a>${ev.organizer ? `<span class="tag">${logoOf(ev)}${esc(ev.organizer.name)}</span>` : ''}</h3>
    <p class="meta"><span>${icons.clock}<time datetime="${ev.startsAt}"><span class="sr-only">${longDate(ev)}, </span>${timeRange(ev)}</time></span><span>${placeIcon(ev)}${esc(placeName(ev))}</span></p>
    <p class="desc">${esc(ev.description)}</p>
  </div>
  <a class="btn btn-ghost" href="/events/${ev.slug}/" aria-label="Details for ${esc(ev.name)}">Details ${icons.arrow}</a>
</article>`;
}

function eventLists() {
  const up = events.filter((e) => !isPast(e));
  const past = events.filter(isPast).reverse();
  return `<section class="block" data-section="upcoming">
  <h2>Upcoming events</h2>
  <div class="event-list" data-list="upcoming">${up.map(eventCard).join('\n')}</div>
  <p class="empty muted" data-empty="upcoming"${up.length ? ' hidden' : ''}>No upcoming events at the moment — check back soon, or join our Discord to hear first.</p>
</section>
<section class="block" data-section="past"${past.length ? '' : ' hidden'}>
  <h2>Past events</h2>
  <div class="event-list" data-list="past">${past.map(eventCard).join('\n')}</div>
</section>`;
}

function gallery(ev) {
  const list = photosOf(ev);
  return `<div class="photo-grid">${list
    .map(
      (p, i) =>
        `<a href="${esc(p.src)}" data-lightbox="${ev.slug}" aria-label="Open photo ${i + 1} of ${list.length}: ${esc(p.alt ?? 'event photo')}"><img src="${esc(p.src)}" alt="${esc(p.alt ?? `Photo ${i + 1} from ${ev.name}`)}" loading="lazy" decoding="async"></a>`
    )
    .join('\n')}</div>`;
}

// Community members: card for lists (bio clipped), full profile on /community/<slug>/.
const personCard = (p, n = 140) => `<article class="person-card">
  <img class="speaker-photo" src="${esc(p.photo)}" alt="" loading="lazy" width="104" height="104">
  <h3><a href="/community/${p.slug}/">${esc(p.name)}</a></h3>
  <p class="muted">${esc(clip(p.bio[0], n))}</p>
  <p class="tags">${(p.topics ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</p>
  <p class="speaker-links">${(p.links ?? []).map((url) => socialLink({ url })).join('')}</p>
</article>`;
// Participation stickers: an event with "sticker" + "attendees" (person slugs) issues it to those people.
const stickersOf = (p) => events.filter((ev) => ev.sticker && ev.attendees?.includes(p.slug));
const attendeesOf = (ev) => people.filter((p) => ev.attendees?.includes(p.slug));
const peopleGrid = (n, cls = "") => `<div class="speaker-grid${cls}" data-shuffle>${people.map((p) => personCard(p, n)).join('\n')}</div>`;

const breadcrumbs = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(p) })),
});

// ---------- pages ----------
const out = new Map(); // path -> html

// Home
out.set(
  '/index.html',
  page({
    title: site.name,
    path: '/',
    description: site.tagline,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'Organization', name: site.name, url: site.url, logo: abs('/assets/img/icon-192.png'), sameAs: [site.discord, site.linkedin] },
      { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: site.url, inLanguage: 'en' },
    ],
    body: `<section class="hero">
  <div class="container hero-inner">
    <p class="eyebrow">Štajerska · Slovenia</p>
    <h1><span>.NET &amp; Azure</span><span class="accent">Meetup</span><span>Štajerska</span></h1>
    <div class="hero-rule"></div>
    <p class="lead">${esc(site.tagline)}</p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="${esc(site.discord)}" target="_blank" rel="noopener noreferrer">${discordIcon}Join us on Discord</a>
      <a class="btn btn-light" href="${esc(site.linkedin)}" target="_blank" rel="noopener noreferrer">${linkedinIcon}Follow on LinkedIn</a>
      <a class="btn btn-light" href="/events/">Browse events</a>
    </div>
    <p class="hashtag">#NETAzureMeetupStajerska</p>
  </div>
</section>
<div class="container">
${eventLists()}
<section class="block">
  <h2><a href="/community/">Community</a></h2>
  ${peopleGrid(70, " cols-3")}
</section>
</div>`,
  })
);

// Events index
out.set(
  '/events/index.html',
  page({
    title: 'Events',
    path: '/events/',
    jsonLd: breadcrumbs([['Home', '/'], ['Events', '/events/']]),
    description: `All upcoming and past events of ${site.name}.`,
    body: `<div class="container page-head"><h1>Events</h1></div>\n<div class="container">${eventLists()}</div>`,
  })
);

// Community
out.set(
  '/community/index.html',
  page({
    title: 'Community',
    path: '/community/',
    jsonLd: breadcrumbs([['Home', '/'], ['Community', '/community/']]),
    description: `The people behind ${site.name}: organizers, speakers and community members.`,
    body: `<div class="container page-head"><h1>Community</h1></div>\n<div class="container"><section class="block">${peopleGrid(undefined, " cols-3")}</section></div>`,
  })
);
for (const p of people) {
  const path = `/community/${p.slug}/`;
  out.set(
    `${path}index.html`,
    page({
      title: p.name,
      path,
      ogType: 'profile',
      description: p.bio.join(' '),
      image: p.photo,
      imageAlt: p.name,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: p.name,
          url: abs(path),
          image: abs(p.photo),
          description: p.bio.join(' '),
          knowsAbout: p.topics,
          sameAs: p.links,
          memberOf: { '@type': 'Organization', name: site.name, url: site.url },
        },
        breadcrumbs([['Home', '/'], ['Community', '/community/'], [p.name, path]]),
      ],
      body: `<div class="container">
<section class="block person">
  <img class="person-photo" src="${esc(p.photo)}" alt="Portrait of ${esc(p.name)}" width="200" height="200">
  <div>
    <p class="eyebrow"><a href="/community/">Community</a></p>
    <h1>${esc(p.name)}</h1>
    ${p.bio.map((t) => `<p>${esc(t)}</p>`).join('\n    ')}
    <p class="tags">${(p.topics ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</p>
    <p class="speaker-links person-links">${(p.links ?? []).map((url) => socialLink({ url })).join('')}</p>
  </div>
</section>
${stickersOf(p).length ? `<section class="block" id="stickers">
  <h2>Stickers collection</h2>
  <ul class="sticker-grid">${stickersOf(p).map((ev) => `<li><a class="sticker" href="/events/${ev.slug}/"><img src="${esc(ev.sticker.src)}" alt="${esc(ev.sticker.alt ?? ev.sticker.name)}" width="160" height="160" loading="lazy"><span class="sticker-name">${esc(ev.sticker.name)}</span><span class="sticker-event muted">${esc(ev.name)}</span></a></li>`).join('')}</ul>
</section>` : ''}
</div>`,
    })
  );
}

// Gallery
const withPhotos = events.filter((e) => e.photos?.length).reverse();
out.set(
  '/gallery/index.html',
  page({
    title: 'Gallery',
    path: '/gallery/',
    jsonLd: breadcrumbs([['Home', '/'], ['Gallery', '/gallery/']]),
    description: `Photos from the events of ${site.name}.`,
    image: photosOf(withPhotos[0])[0]?.src,
    body: `<div class="container page-head"><h1>Gallery</h1></div>
<div class="container">
${
  withPhotos.length
    ? withPhotos
        .map((ev) => `<section class="block"><h2><a href="/events/${ev.slug}/">${esc(ev.name)}</a></h2>${gallery(ev)}</section>`)
        .join('\n')
    : '<p class="muted">No photos yet.</p>'
}
</div>`,
  })
);

// Event detail pages
for (const ev of events) {
  let { all, grid } = await snapshot(ev);
  // Events without Sessionize (e.g. partner events) can list speakers by hand; reuse the same renderer.
  if (ev.speakers?.length) {
    all = {
      speakers: ev.speakers.map((s, i) => ({ id: `s${i}`, fullName: s.name, tagLine: s.tagLine, profilePicture: s.photo, links: s.links })),
      sessions: ev.speakers.map((s, i) => ({ title: s.talk, speakers: [`s${i}`] })).filter((s) => s.title),
    };
  }
  const past = isPast(ev);
  const loc = ev.location ?? {};
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.name,
    description: ev.description,
    startDate: ev.startsAt,
    endDate: ev.endsAt,
    eventAttendanceMode: `https://schema.org/${ev.online ? 'Online' : 'Offline'}EventAttendanceMode`,
    eventStatus: 'https://schema.org/EventScheduled',
    location: ev.online
      ? { '@type': 'VirtualLocation', url: ev.externalUrl ?? ev.ticketsUrl ?? abs(`/events/${ev.slug}/`) }
      : { '@type': 'Place', name: loc.name, address: loc.address },
    organizer: { '@type': 'Organization', name: ev.organizer?.name ?? site.name, url: ev.organizer?.url ?? site.url },
    image: [ev.banner, photosOf(ev)[0]?.src].filter(Boolean).map(abs),
    url: abs(`/events/${ev.slug}/`),
  };
  const buttons = [
    ev.ticketsUrl && (() => { const s = siteOf(ev.ticketsUrl); return `<a class="btn btn-primary" href="${esc(ev.ticketsUrl)}" target="_blank" rel="noopener noreferrer" data-hide-when-past="${ev.endsAt}"${past ? ' hidden' : ''}>${s ? s[2] : icons.ticket}Reserve your seat</a>`; })(),
    ev.callForPapersUrl && (() => { const s = siteOf(ev.callForPapersUrl); return `<a class="btn btn-light" href="${esc(ev.callForPapersUrl)}" target="_blank" rel="noopener noreferrer" data-hide-when-past="${ev.endsAt}"${past ? ' hidden' : ''}>${s ? s[2] : icons.mic}Call for papers</a>`; })(),
    ev.externalUrl && `<a class="btn btn-light" href="${esc(ev.externalUrl)}" target="_blank" rel="noopener noreferrer">${icons.arrow}Event page on ${esc(ev.organizer?.name ?? 'the organizer\'s site')}</a>`,
  ].filter(Boolean).join('\n');

  out.set(
    `/events/${ev.slug}/index.html`,
    page({
      title: ev.name,
      path: `/events/${ev.slug}/`,
      description: `${longDate(ev)}, ${timeRange(ev)} ${ev.online ? '(online)' : `at ${loc.name}`}. ${ev.description}`,
      image: ev.banner ?? photosOf(ev)[0]?.src,
      imageAlt: ev.name,
      bodyAttrs: ev.sessionizeId ? ` data-sessionize-id="${esc(ev.sessionizeId)}"` : '',
      jsonLd: [jsonLd, breadcrumbs([['Home', '/'], ['Events', '/events/'], [ev.name, `/events/${ev.slug}/`]])],
      body: `<div class="container">
${ev.heroImage ? `<div class="event-cover"><img src="${esc(ev.heroImage)}" alt="${esc(ev.name)}" width="1920" height="1080"></div>` : ''}
<section class="event-hero${ev.theme ? ` theme-${ev.theme}` : ''}" data-start="${ev.startsAt}" data-end="${ev.endsAt}">
  <div class="date-chip" aria-hidden="true"><span class="d">${day(ev)}</span><span class="m">${mon(ev)}</span><span class="y">${year(ev)}</span></div>
  <div class="event-main">
    <p class="eyebrow"><span class="status ${past ? 'is-past' : ''}" data-status>${past ? 'Past event' : 'Upcoming event'}</span></p>
    <h1>${esc(ev.name)}</h1>
    ${ev.organizer ? `<p class="organizer">${logoOf(ev)}Organized by <a href="${esc(ev.organizer.url)}" target="_blank" rel="noopener noreferrer">${esc(ev.organizer.name)}</a>${ev.partnerNote ? ` · ${esc(ev.partnerNote)}` : ''}</p>` : ''}
    <p class="meta"><span>${icons.clock}<time datetime="${ev.startsAt}">${longDate(ev)}, ${timeRange(ev)}</time></span><span>${placeIcon(ev)}${esc(placeName(ev))}</span></p>
    <p class="desc">${esc(ev.description)}</p>
    ${ev.hashtag ? `<p class="event-hashtag">${esc(ev.hashtag)}</p>` : ''}
    ${buttons ? `<div class="hero-actions">${buttons}</div>` : ''}
  </div>
</section>

${ev.about ? `<section class="block" id="about">
  <h2>${esc(ev.about.title)}</h2>
  <p class="about">${esc(ev.about.text)}</p>
</section>` : ''}

${ev.sessionizeId || ev.speakers?.length ? `<section class="block" id="speakers">
  <h2>Speakers</h2>
  <div data-sessionize-speakers>${renderSpeakers(all)}</div>
</section>` : ''}

${ev.sessionizeId ? `<section class="block" id="agenda">
  <h2>Agenda</h2>
  <div data-sessionize-agenda>${renderAgenda(grid)}</div>
</section>` : ''}

${ev.online ? '' : `<section class="block" id="venue">
  <h2>Venue &amp; parking</h2>
  <div class="venue">
    <div class="venue-info">
      <h3>${esc(loc.name)}</h3>
      <p><a href="${esc(loc.mapsUrl)}" target="_blank" rel="noopener noreferrer">${icons.pin}${esc(loc.address)}</a></p>
      ${(loc.parkings ?? [])
        .map((p) => `<p><a href="${esc(p.mapsUrl)}" target="_blank" rel="noopener noreferrer">${icons.car}${esc(p.name)}</a></p>`)
        .join('\n      ')}
    </div>
    <iframe class="map" src="${esc(osmEmbed(loc))}" title="Map of ${esc(loc.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
  </div>
</section>`}
${ev.sticker ? `\n<section class="block" id="sticker">
  <h2>Participation sticker</h2>
  <div class="sticker-feature">
    <img src="${esc(ev.sticker.src)}" alt="${esc(ev.sticker.alt ?? ev.sticker.name)}" width="200" height="200" loading="lazy">
    <div>
      <h3>${esc(ev.sticker.name)}</h3>
      <p>A virtual sticker issued to everyone who attended this meetup.</p>
      ${attendeesOf(ev).length ? `<p class="muted">Collected by ${attendeesOf(ev).map((p) => `<a href="/community/${p.slug}/">${esc(p.name)}</a>`).join(', ')}.</p>` : ''}
    </div>
  </div>
</section>` : ''}
${ev.photos?.length ? `\n<section class="block" id="photos">\n  <h2>Photos</h2>\n  ${gallery(ev)}\n</section>` : ''}
</div>`,
    })
  );
}

// Privacy
out.set(
  '/privacy/index.html',
  page({
    title: 'Privacy',
    path: '/privacy/',
    description: `How ${site.name} handles your data: no cookies, no analytics, no tracking.`,
    jsonLd: breadcrumbs([['Home', '/'], ['Privacy', '/privacy/']]),
    body: `<div class="container page-head"><h1>Privacy</h1></div>
<div class="container prose">
<p><strong>Short version:</strong> this website sets no cookies and has no analytics, advertising or forms. The only third parties involved are GitHub (hosting), Sessionize (speaker data) and OpenStreetMap (the venue map).</p>
<h2>What this site does</h2>
<ul>
<li><strong>Hosting.</strong> The site is hosted on <a href="https://pages.github.com/" target="_blank" rel="noopener noreferrer">GitHub Pages</a>. As with any web host, GitHub receives technical data such as your IP address when your browser requests a page; see <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer">GitHub's privacy statement</a>.</li>
<li><strong>Speakers and agenda.</strong> On event pages, your browser fetches up-to-date speaker and agenda data (and speaker photos) from <a href="https://sessionize.com/" target="_blank" rel="noopener noreferrer">Sessionize</a>, so Sessionize sees your IP address, as with any embedded content.</li>
<li><strong>Maps.</strong> Event pages with a venue embed a map from <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>. It sets no cookies, but loading it sends your IP address and browser details to OpenStreetMap's servers; see the <a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noopener noreferrer">OpenStreetMap Foundation privacy policy</a>. The address link opens Google Maps only if you click it.</li>
<li><strong>Theme choice.</strong> If you pick light or dark with the theme button, your choice is saved in your browser's local storage so it is remembered. It never leaves your device.</li>
<li><strong>Fonts, icons and styles</strong> are served from this site; nothing is loaded from font or script CDNs.</li>
<li><strong>Links to other sites</strong> (Discord, LinkedIn, Eventbrite, Sessionize, Microsoft) leave this site; their own policies apply.</li>
</ul>
<h2>Cookies</h2>
<p>This site does not set cookies, and the embedded map does not either. There is nothing to accept, so there is no cookie banner.</p>
<h2>Questions</h2>
<p>Ask the organizers in our <a href="${esc(site.discord)}" target="_blank" rel="noopener noreferrer">Discord community</a> or <a href="${esc(site.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn group</a>.</p>
<p class="muted">Last updated: 29 September 2026.</p>
</div>`,
  })
);

// 404
out.set(
  '/404.html',
  page({
    title: 'Page not found',
    path: '/404/',
    description: 'Page not found',
    noindex: true,
    body: `<div class="container page-head"><h1>Page not found</h1><p class="lead-dark">That page doesn't exist. Head back to the <a href="/">home page</a> or see all <a href="/events/">events</a>.</p></div>`,
  })
);

// sitemap + robots
// <lastmod> = date of the last commit that touched the data feeding the page (uncommitted changes count as today).
// Best effort: without git (or outside a repo) the sitemap simply has no lastmod.
function lastmod(files) {
  try {
    const rel = files.filter((f) => existsSync(join(ROOT, f)));
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (git('status', '--porcelain', '--', ...rel)) return new Date().toISOString().slice(0, 10);
    return git('log', '-1', '--format=%cs', '--', ...rel) || undefined;
  } catch { return undefined; }
}
const sourcesOf = (u) => {
  const ev = events.find((e) => u === `/events/${e.slug}/`);
  if (ev) return ['data/events.json', ev.sessionizeId && `data/sessionize/${ev.sessionizeId}.json`].filter(Boolean);
  if (u.startsWith('/community/')) return ['data/community.json', 'data/events.json'];
  if (u === '/privacy/') return ['tools/build.mjs'];
  return ['data/events.json', 'data/community.json', 'data/site.json'];
};
const urls = [...out.keys()].filter((k) => k !== '/404.html').map((k) => k.replace(/index\.html$/, ''));
out.set(
  '/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => {
      const lm = lastmod(sourcesOf(u));
      return `  <url><loc>${abs(u)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</url>`;
    })
    .join('\n')}\n</urlset>\n`
);
out.set('/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${abs('/sitemap.xml')}\n`);

// ---------- write ----------
// Remove previously generated event pages so deleted events don't linger.
await rm(join(ROOT, 'events'), { recursive: true, force: true });
for (const [path, html] of out) {
  const file = join(ROOT, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}
console.log(`Built ${out.size} files (${events.length} events).`);

// ---------- preview server ----------
if (process.argv.includes('--serve')) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' };
  createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(ROOT, p);
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404, { 'content-type': types['.html'] }); return createReadStream(join(ROOT, '404.html')).pipe(res); }
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  }).listen(8080, () => console.log('Preview: http://localhost:8080'));
}
