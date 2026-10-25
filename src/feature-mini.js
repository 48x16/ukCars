// "Mini, year by year": the Mini's story (see make-story.js), from the new MINI's launch in 2001.

import { startFeature } from './feature-page.js';
import { renderMakeStory } from './make-story.js';

startFeature('mini', (data) =>
  renderMakeStory(data, {
    one: 'Mini',
    many: 'Minis',
    intro: `The new Mini went on sale in ${data.years[0]}, as the last classic Minis were registered.`,
  }),
);
