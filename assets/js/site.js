import { renderSpeakers, renderAgenda } from './sessionize.mjs';

const now = Date.now();

// 1. Events flip from "upcoming" to "past" on their own, without a rebuild.
function reclassify() {
  const lists = { upcoming: document.querySelector('[data-list="upcoming"]'), past: document.querySelector('[data-list="past"]') };
  if (!lists.upcoming || !lists.past) return;
  const cards = [...document.querySelectorAll('.event-card')];
  for (const card of cards) {
    const past = Date.parse(card.dataset.end) < now;
    card.classList.toggle('is-past', past);
    lists[past ? 'past' : 'upcoming'].append(card);
  }
  const byStart = (a, b) => Date.parse(a.dataset.start) - Date.parse(b.dataset.start);
  lists.upcoming.append(...[...lists.upcoming.children].sort(byStart));
  lists.past.append(...[...lists.past.children].sort((a, b) => byStart(b, a)));
  document.querySelector('[data-empty="upcoming"]').hidden = lists.upcoming.children.length > 0;
  document.querySelector('[data-section="past"]').hidden = lists.past.children.length === 0;
}

// 2. Hide "Reserve a seat" / "Call for papers" once the event is over; fix the status badge.
function hideStale() {
  for (const el of document.querySelectorAll('[data-hide-when-past]')) {
    el.hidden = Date.parse(el.dataset.hideWhenPast) < now;
  }
  const hero = document.querySelector('.event-hero');
  const status = document.querySelector('[data-status]');
  if (hero && status) {
    const past = Date.parse(hero.dataset.end) < now;
    status.textContent = past ? 'Past event' : 'Upcoming event';
    status.classList.toggle('is-past', past);
  }
}

// 3. Speakers/agenda are baked into the HTML at build time (SEO); refresh from Sessionize so
//    last-minute changes show up without a rebuild. On any failure the baked-in snapshot stays.
async function refreshSessionize() {
  const id = document.body.dataset.sessionizeId;
  const speakers = document.querySelector('[data-sessionize-speakers]');
  const agenda = document.querySelector('[data-sessionize-agenda]');
  if (!id || !speakers || !agenda) return;
  try {
    const base = `https://sessionize.com/api/v2/${id}/view/`;
    const [all, grid] = await Promise.all([fetch(base + 'All'), fetch(base + 'GridSmart')].map((p) => p.then((r) => (r.ok ? r.json() : Promise.reject(r.status)))));
    speakers.innerHTML = renderSpeakers(all);
    agenda.innerHTML = renderAgenda(grid);
  } catch (e) {
    console.warn('Sessionize refresh failed, keeping the built-in snapshot', e);
  }
}

// 4. Minimal lightbox on <dialog> (Esc closes, arrows navigate).
function lightbox() {
  const links = [...document.querySelectorAll('a[data-lightbox]')];
  if (!links.length) return;
  const dlg = document.createElement('dialog');
  dlg.className = 'lightbox';
  dlg.setAttribute('aria-label', 'Photo viewer');
  dlg.innerHTML = '<button class="lb-close" aria-label="Close">×</button><button class="lb-prev" aria-label="Previous">‹</button><img alt=""><button class="lb-next" aria-label="Next">›</button><p class="sr-only" role="status" aria-live="polite"></p>';
  document.body.append(dlg);
  const img = dlg.querySelector('img');
  const status = dlg.querySelector('[role=status]');
  let group = [];
  let i = 0;
  const show = (n) => {
    i = (n + group.length) % group.length;
    img.src = group[i].href;
    img.alt = group[i].querySelector('img')?.alt ?? '';
    status.textContent = `Photo ${i + 1} of ${group.length}: ${img.alt}`;
  };
  links.forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      group = links.filter((l) => l.dataset.lightbox === a.dataset.lightbox);
      show(group.indexOf(a));
      dlg.classList.toggle('single', group.length < 2);
      dlg.showModal();
    })
  );
  dlg.querySelector('.lb-close').onclick = () => dlg.close();
  dlg.querySelector('.lb-prev').onclick = () => show(i - 1);
  dlg.querySelector('.lb-next').onclick = () => show(i + 1);
  dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(i - 1);
    if (e.key === 'ArrowRight') show(i + 1);
  });
}

// 5. Click-to-load map: nothing is requested from Google until the visitor asks for it.
function maps() {
  for (const box of document.querySelectorAll('.map-facade')) {
    box.querySelector('button').addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.className = 'map';
      frame.src = box.dataset.mapSrc;
      frame.title = box.dataset.mapTitle;
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'no-referrer-when-downgrade';
      box.replaceWith(frame);
      frame.focus();
    });
  }
}

reclassify();
maps();
hideStale();
lightbox();
refreshSessionize();
