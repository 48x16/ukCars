// An example spec: the "Why cars fail" page as generated. Copy it, rename, and edit.
// Each section: id (also the h2 id prefix), title, side (summary + method note), main (charts).
// sources: footer credit keys from SOURCES in make-page.cjs (add one there for a new source).
module.exports = () => [
  {
    file: 'faults.html',
    title: 'Why cars fail',
    description: 'What fails at the MOT: lights, suspension, brakes and tyres, the commonest faults, how it changes with age and fuel, and model by model.',
    script: 'feature-faults.js',
    sources: ['mot'],
    credits: [['Data', 'DVSA MOT failure items'], ['Covers', 'Cars tested, Great Britain']],
    standfirst: 'Every failed MOT comes with a list. Here’s what’s on it, from <span data-tests>millions of</span> tests.',
    sections: [
      {
        id: 'parts',
        title: 'What fails',
        side: [
          '<p class="govuk-body" id="parts-summary"></p>',
          '<p class="govuk-body-s">Share of all first MOTs in <span data-mot-year>the latest year</span> failing on each part, counting each test once per part. Fails include cars repaired at the test and then passed.</p>',
        ],
        main: ['<h3 class="govuk-heading-s">Share of MOTs failing, by part</h3>', '<div id="parts-chart"></div>'],
      },
      {
        id: 'defects',
        title: 'The usual suspects',
        side: ['<p class="govuk-body" id="defects-summary"></p>', '<p class="govuk-body-s">The 15 commonest faults, in DVSA’s words, as a share of all first MOTs.</p>'],
        main: ['<div id="defects-chart"></div>'],
      },
      {
        id: 'age',
        title: 'As cars age',
        side: ['<p class="govuk-body" id="age-summary"></p>', '<p class="govuk-body-s">Darker cells: more cars failing on that part at that age.</p>'],
        main: ['<div class="wuk-table-scroll" role="region" aria-label="Failures by part and age (scrolls sideways)" tabindex="0">', '  <table class="govuk-table wuk-heat-table" id="age-table"></table>', '</div>'],
      },
      {
        id: 'fuels',
        title: 'Petrol, diesel, electric',
        side: ['<p class="govuk-body" id="fuels-summary"></p>', '<p class="govuk-body-s">The five commonest parts, for each fuel. Electric cars are mostly young, so they fail less overall: compare with care.</p>'],
        main: ['<div class="wuk-columns" id="fuels"></div>'],
      },
      {
        id: 'model',
        title: 'Model by model',
        side: [
          '<p class="govuk-body" id="model-summary"></p>',
          '<p class="govuk-body-s">Compared at the same age (10 to 14 years where there are enough tests): older cars fail more, so comparing models of different ages would mostly measure age. The pink marker is all cars that age.</p>',
        ],
        main: [
          '<div class="govuk-form-group">',
          '  <label class="govuk-label govuk-label--s" for="model">Choose a model</label>',
          '  <select class="govuk-select" id="model" name="model"></select>',
          '</div>',
          '<div id="model-chart"></div>',
        ],
      },
    ],
  },
];
