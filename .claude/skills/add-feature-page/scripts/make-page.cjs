// Writes feature and tool pages from the Bavarian page's frame (head, nav, footer), so every page
// shares the same shell. Run from the repo root:
//   node .claude/skills/add-feature-page/scripts/make-page.cjs <spec.cjs>
// It won't replace an existing page unless you pass --force: generate once, then edit by hand.
const fs = require('fs');
const path = require('path');

const frame = fs.readFileSync('bavarian.html', 'utf8');
const head = frame.slice(0, frame.indexOf('<div class="wuk-split wuk-hero wuk-feature-hero">'));
const tail = frame.slice(frame.indexOf('        <div class="govuk-error-summary" id="error" hidden>'));
const footerStart = tail.indexOf('            <h2 class="govuk-visually-hidden">About the data</h2>');
const footerEnd = tail.indexOf('            <p class="govuk-body-s">\n              Contains public sector information');

const SOURCES = {
  veh0160: `            <p class="govuk-body-s">
              Source: Department for Transport and Driver and Vehicle Licensing Agency,
              <a class="govuk-footer__link" href="https://www.gov.uk/government/statistical-data-sets/vehicle-licensing-statistics-data-files"
                >vehicle licensing statistics</a
              >
              (table VEH0160, cars registered for the first time, Great Britain), data to <span data-latest-quarter>the latest quarter</span>.
            </p>
`,
  veh0120: `            <p class="govuk-body-s">
              Source: Department for Transport and Driver and Vehicle Licensing Agency,
              <a class="govuk-footer__link" href="https://www.gov.uk/government/statistical-data-sets/vehicle-licensing-statistics-data-files"
                >vehicle licensing statistics</a
              >
              (table VEH0120, licensed and SORN cars, United Kingdom), data to <span data-latest-quarter>the latest quarter</span>.
            </p>
`,
  both: `            <p class="govuk-body-s">
              Source: Department for Transport and Driver and Vehicle Licensing Agency,
              <a class="govuk-footer__link" href="https://www.gov.uk/government/statistical-data-sets/vehicle-licensing-statistics-data-files"
                >vehicle licensing statistics</a
              >
              (tables VEH0160, cars registered for the first time, Great Britain; and VEH0120, licensed and SORN cars, United Kingdom), data to <span data-latest-quarter>the latest quarter</span>.
            </p>
`,
  electric: `            <p class="govuk-body-s">
              Source: Department for Transport and Driver and Vehicle Licensing Agency,
              <a class="govuk-footer__link" href="https://www.gov.uk/government/statistical-data-sets/vehicle-licensing-statistics-data-files"
                >vehicle licensing statistics</a
              >
              (table VEH0145, plug-in vehicles by small area), data to <span data-latest-quarter>the latest quarter</span>. Small areas placed by postcode with the
              <a class="govuk-footer__link" href="https://geoportal.statistics.gov.uk/">ONS postcode lookup</a>: Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2026. Contains Royal Mail data © Royal Mail copyright and database right 2026.
            </p>
`,
  traffic: `            <p class="govuk-body-s">
              Source: Department for Transport,
              <a class="govuk-footer__link" href="https://roadtraffic.dft.gov.uk/downloads">road traffic statistics</a
              >, vehicle miles by vehicle type, road type and local authority, Great Britain.
            </p>
`,
  driving: `            <p class="govuk-body-s">
              Source: Driver and Vehicle Standards Agency,
              <a class="govuk-footer__link" href="https://www.gov.uk/government/statistical-data-sets/driving-test-and-theory-test-data-cars"
                >driving test and theory test data: cars</a
              >
              (tables DRT121 and DRT122), Great Britain, to <span data-latest-quarter>the latest month</span>. Centres where only one examiner tested are left out by DVSA.
            </p>
`,
  mot: `            <p class="govuk-body-s">
              Source: Driver and Vehicle Standards Agency,
              <a class="govuk-footer__link" href="https://www.data.gov.uk/dataset/c63fca52-ae4c-4b75-bab5-8b4735e1a4c9/anonymised-mot-tests-and-results"
                >anonymised MOT tests and results</a
              >, <span data-mot-year>the latest year</span>. Models matched to DVLA's, from DfT vehicle licensing statistics.
            </p>
`,
};

const esc = (s) => s.replace(/&(?!amp;|#)/g, '&amp;');

function page(p) {
  let h = head
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${p.description}" />`)
    .replace(/<title>[^<]*<\/title>/, `<title>${p.title} – Rev Counter</title>`);
  if (p.section === 'tools') {
    h = h
      .replace('<a class="wuk-nav__link" href="./features.html" aria-current="page">Features</a>', '<a class="wuk-nav__link" href="./features.html">Features</a>')
      .replace('<a class="wuk-nav__link" href="./tools.html">Tools</a>', '<a class="wuk-nav__link" href="./tools.html" aria-current="page">Tools</a>');
  }
  const credits = p.credits.map(([k, v]) => `              <li><b>${k}</b> ${v}</li>`).join('\n');
  const hero = `<div class="wuk-split wuk-hero wuk-feature-hero">
          <div class="wuk-split__side">
            <p class="wuk-kicker">${p.section === 'tools' ? 'Tool' : 'Feature'}</p>
            <h1 class="govuk-heading-xl">${esc(p.title)}</h1>
            <ul class="wuk-credits">
${credits}
              <li><b>Updated</b> <span data-latest-quarter>the latest quarter</span></li>
            </ul>
          </div>
          <div class="wuk-split__main">
            <p class="wuk-standfirst">${p.standfirst}</p>
${p.heroExtra ?? ''}            <div id="hero-graphic"></div>
          </div>
        </div>
`;
  const sections = p.sections
    .map(
      (s) => `        <section class="wuk-section wuk-split" aria-labelledby="${s.id}-title">
          <div class="wuk-split__side">
            <h2 class="govuk-heading-l" id="${s.id}-title">${esc(s.title)}</h2>
${(s.side ?? []).map((line) => `            ${line}`).join('\n')}
          </div>
          <div class="wuk-split__main">
${s.main.map((line) => `            ${line}`).join('\n')}
          </div>
        </section>
`,
    )
    .join('');
  const body = p.resultsWrap ? `        <div id="results" hidden>
${sections}        </div>
` : sections;
  const sources = p.sources.map((k) => SOURCES[k]).join('');
  const t = tail.slice(0, footerStart) + '            <h2 class="govuk-visually-hidden">About the data</h2>\n' + sources + tail.slice(footerEnd);
  return (h + hero + body + t).replace('<script type="module" src="/src/feature-bavarian.js"></script>', `<script type="module" src="/src/${p.script}"></script>`);
}

/** A "Show the data as a table" block. */
const table = (id) => [
  '<details class="govuk-details">',
  '  <summary class="govuk-details__summary">',
  '    <span class="govuk-details__summary-text">Show the data as a table</span>',
  '  </summary>',
  '  <div class="govuk-details__text wuk-table-scroll" role="region" aria-label="The data as a table (scrolls sideways)" tabindex="0">',
  `    <table class="govuk-table" id="${id}"></table>`,
  '  </div>',
  '</details>',
];

const specs = require(path.resolve(process.argv[2]))({ table });
const force = process.argv.includes('--force');
for (const p of specs) {
  if (fs.existsSync(p.file) && !force) {
    console.error(`${p.file} already exists: edit it by hand, or pass --force to regenerate it.`);
    process.exitCode = 1;
    continue;
  }
  fs.writeFileSync(p.file, page(p));
  console.log('wrote', p.file);
}
