// Shared by every page: fonts, styles, the offline badge and the service worker.

import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './styles/main.scss';
import { ArrowUp, createElement, WifiOff } from 'lucide';

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

watchConnection();
backToTop();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.error('Service worker not registered', err));
}
