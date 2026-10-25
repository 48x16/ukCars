// Shared by every page: fonts, styles, the menu, the offline badge and the service worker.

import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './styles/main.scss';
import { ArrowUp, createElement, House, Menu, Newspaper, Search, WifiOff, Wrench, X, Zap } from 'lucide';

function watchConnection() {
  const badge = document.getElementById('offline');
  badge.querySelector('.wuk-offline__icon').append(createElement(WifiOff, { 'aria-hidden': 'true' }));
  const update = () => {
    badge.hidden = navigator.onLine;
  };
  addEventListener('online', update);
  addEventListener('offline', update);
  update();
}

// Without JavaScript the link is always shown; with it, only once the header has scrolled away.
function backToTop() {
  const box = document.querySelector('.wuk-back-to-top');
  if (!box) return;
  box.querySelector('.wuk-back-to-top__icon').append(createElement(ArrowUp, { 'aria-hidden': 'true' }));
  new IntersectionObserver(([entry]) => {
    box.hidden = entry.isIntersecting;
  }).observe(document.getElementById('top'));
}

/**
 * On phones, the links fold behind a Menu button. Without JavaScript they simply wrap, so the
 * menu works either way; the CSS only hides them once this has run.
 */
function menu() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wuk-menu-button';
  button.setAttribute('aria-controls', 'nav');
  button.setAttribute('aria-expanded', 'false');
  const label = document.createElement('span');
  label.textContent = 'Menu';
  const setOpen = (open) => {
    button.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('wuk-nav--open', open);
    button.replaceChildren(createElement(open ? X : Menu, { 'aria-hidden': 'true' }), label);
  };
  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      button.focus();
    }
  });
  setOpen(false);
  nav.before(button);
  document.documentElement.classList.add('wuk-js');
}

/** The phone's bottom bar: five quick links, the page you're on marked. Shown on small screens only. */
const QUICK_LINKS = [
  { href: './', label: 'Home', icon: House, pages: ['', 'index.html'] },
  { href: './explore.html', label: 'Explore', icon: Search, pages: ['explore.html'] },
  { href: './electric.html', label: 'Electric', icon: Zap, pages: ['electric.html'] },
  { href: './tools.html', label: 'Tools', icon: Wrench, pages: ['tools.html', 'chargers.html', 'mot-times.html', 'your-car.html', 'make.html', 'trumps.html'] },
  { href: './features.html', label: 'Features', icon: Newspaper, pages: ['features.html', 'out-to-play.html', 'bavarian.html', 'origins.html', 'colours.html', 'mini.html', 'suv.html', 'diesel.html', 'plates.html', 'arrivals.html', 'workhorses.html', 'built-to-last.html', 'endangered.html'] },
];

function bottomBar() {
  const page = location.pathname.split('/').pop();
  const bar = document.createElement('nav');
  bar.className = 'wuk-tabbar';
  bar.setAttribute('aria-label', 'Quick links');
  const list = document.createElement('ul');
  list.className = 'wuk-tabbar__list';
  for (const link of QUICK_LINKS) {
    const item = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'wuk-tabbar__link';
    a.href = link.href;
    if (link.pages.includes(page)) a.setAttribute('aria-current', 'page');
    const label = document.createElement('span');
    label.textContent = link.label;
    a.append(createElement(link.icon, { 'aria-hidden': 'true' }), label);
    item.append(a);
    list.append(item);
  }
  bar.append(list);
  document.body.append(bar);
}

menu();
bottomBar();
watchConnection();
backToTop();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.error('Service worker not registered', err));
}
