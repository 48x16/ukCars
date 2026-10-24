// Shared start-up for the feature pages: load the story's data, fill in the dates, draw icons,
// and show a clear message if the data can't be loaded.

import './shell.js';
import { Globe, Palette, Snowflake, Sun, Trophy } from 'lucide';
import { loadFeature } from './data.js';
import { icon } from './feature-charts.js';

const ICONS = { sun: Sun, snowflake: Snowflake, trophy: Trophy, globe: Globe, palette: Palette };

export const $ = (id) => document.getElementById(id);

export function drawIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) {
    if (!node.firstChild && ICONS[node.dataset.icon]) node.append(icon(ICONS[node.dataset.icon]));
  }
}

/** Fills every element marked with `data-<name>` with `value`. */
export function fill(name, value) {
  for (const node of document.querySelectorAll(`[data-${name}]`)) node.textContent = value;
}

export async function startFeature(name, render) {
  drawIcons();
  let data;
  try {
    data = await loadFeature(name);
  } catch (err) {
    $('error').hidden = false;
    $('error-message').textContent = navigator.onLine
      ? err.message
      : "You're offline, and this page hasn't been viewed on this device yet, so its data isn't saved.";
    return;
  }
  if (data.quarters) {
    fill('latest-quarter', data.quarters.at(-1));
    fill('first-quarter', data.quarters[0]);
  }
  render(data);
}
