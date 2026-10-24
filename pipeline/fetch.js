import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Finds the download link for `fileName` on the DfT page. The /media/<id>/ part of the
 * URL changes with every publication, so the link is looked up rather than hard-coded.
 */
export function findCsvUrl(html, fileName) {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`href="(https://assets\\.publishing\\.service\\.gov\\.uk/[^"]*/${escaped})"`, 'g');
  const urls = new Set([...html.matchAll(re)].map((m) => m[1]));

  if (urls.size === 0) throw new Error(`No link to ${fileName} found on the DfT page`);
  if (urls.size > 1) throw new Error(`Several links to ${fileName} found: ${[...urls].join(', ')}`);
  return [...urls][0];
}

export async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return res.text();
}

export async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  await mkdir(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}
