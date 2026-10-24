// Loads the JSON written by the pipeline. Each file is fetched once per page load.

const DATA_URL = `${import.meta.env.BASE_URL}data/`;
const cache = new Map();

function getJson(path) {
  if (!cache.has(path)) {
    const request = fetch(DATA_URL + path).then((res) => {
      if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
      return res.json();
    });
    request.catch(() => cache.delete(path)); // Let a failed request be retried.
    cache.set(path, request);
  }
  return cache.get(path);
}

export const loadIndex = () => getJson('index.json');
export const loadMeta = () => getJson('meta.json');
export const loadInsights = () => getJson('insights.json');
export const loadElectric = () => getJson('electric.json');
export const loadMot = () => getJson('mot.json');
export const loadFeature = (name) => getJson(`features/${name}.json`);
export const loadModel = (makeSlug, modelSlug) => getJson(`models/${makeSlug}/${modelSlug}.json`);
