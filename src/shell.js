// Shared by every page: fonts, styles, the offline badge and the service worker.

import '@fontsource-variable/inter';
import './styles/main.scss';
import { createElement, WifiOff } from 'lucide';

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

watchConnection();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.error('Service worker not registered', err));
}
