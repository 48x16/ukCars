// Hand-picked categories for the Insights page. DfT data has no "hot hatch" or "supercar"
// flag, so these lists are our own editorial choices: add to them freely.
//
// Hot hatches are matched on DVLA's variant (Model) names, because modern trims reuse the
// old badges ("SRi", "RS Line", "GTE" plug-ins). Each rule names the GenModel and a pattern
// that only matches the classic-era variants.

export const HOT_HATCHES = [
  { label: 'Peugeot 205 GTI', genModel: 'PEUGEOT 205', match: /^205 GTI\b/ },
  { label: 'Ford Escort XR3i', genModel: 'FORD ESCORT', match: /^ESCORT XR3/ },
  { label: 'Ford Escort RS', genModel: 'FORD ESCORT', match: /^ESCORT RS\b/ },
  { label: 'Ford Fiesta XR2', genModel: 'FORD FIESTA', match: /^FIESTA XR2/ },
  { label: 'Ford Fiesta RS Turbo and RS1800', genModel: 'FORD FIESTA', match: /^FIESTA RS ?(TURBO|1800)\b/ },
  { label: 'Volkswagen Golf GTI 16V', genModel: 'VOLKSWAGEN GOLF', match: /^GOLF GTI 16V\b/ },
  { label: 'Vauxhall Nova SR, SRi, GSi and GTE', genModel: 'VAUXHALL NOVA', match: /^NOVA (SR|SRI|GSI|GTE)\b/ },
  { label: 'Vauxhall Astra GTE', genModel: 'VAUXHALL ASTRA', match: /^ASTRA GTE\b/ },
  { label: 'Vauxhall Corsa GSi', genModel: 'VAUXHALL CORSA', match: /^CORSA GSI\b/ },
  { label: 'Peugeot 106 GTI and Rallye', genModel: 'PEUGEOT 106', match: /^106 (GTI|RALLYE)\b/ },
  { label: 'Peugeot 306 GTi-6', genModel: 'PEUGEOT 306', match: /^306 GTI\b/ },
  { label: 'Peugeot 309 GTI', genModel: 'PEUGEOT 309', match: /^309 GTI\b/ },
  { label: 'Citroën Saxo VTS', genModel: 'CITROEN SAXO', match: /^SAXO VTS\b/ },
  { label: 'Citroën AX GT', genModel: 'CITROEN AX', match: /^AX GT\b/ },
  { label: 'Renault 5 GT Turbo', genModel: 'RENAULT 5', match: /^5 GT TURBO\b/ },
  { label: 'Renault Clio Williams, 16V, 172 and 182', genModel: 'RENAULT CLIO', match: /^CLIO (WILLIAMS|16V|RENAULTSPORT 1[78]2)\b/ },
  { label: 'Lancia Delta HF and Integrale', genModel: 'LANCIA DELTA', match: /^DELTA HF\b/ },
  { label: 'Fiat Uno Turbo', genModel: 'FIAT UNO', match: /^UNO TURBO\b/ },
  { label: 'Fiat Punto GT', genModel: 'FIAT PUNTO', match: /^PUNTO GT$/ },
  { label: 'Nissan Sunny GTI and GTI-R', genModel: 'NISSAN SUNNY', match: /^SUNNY GTI/ },
  { label: 'Suzuki Swift GTi', genModel: 'SUZUKI SWIFT', match: /^SWIFT GTI\b/ },
  { label: 'Rover 220 GTi', genModel: 'ROVER 200 SERIES', match: /^220 GTI\b/ },
];

/** Makes shown under "Supercars and luxury", in no particular order. Missing makes are skipped. */
export const SUPERCAR_MAKES = [
  'FERRARI',
  'LAMBORGHINI',
  'MCLAREN',
  'BUGATTI',
  'KOENIGSEGG',
  'PAGANI',
  'ASTON MARTIN',
  'BENTLEY',
  'ROLLS ROYCE',
];

/**
 * Not real arrivals or departures: DVLA labels that changed, or catch-all groups.
 * "MERCEDES-BENZ" appeared alongside "MERCEDES"; it isn't a new make.
 */
export const NOT_A_MAKE = [/^OTHER\b/, /^MERCEDES-BENZ$/];

/** A new arrival had fewer than `maxStart` cars at the start and at least `minNow` now. */
export const ARRIVALS = { maxStart: 200, minNow: 5_000 };

/** A lost make had at least `minStart` cars at the start and has lost at least `minFall` of them. */
export const LOST = { minStart: 20_000, minFall: 0.4 };
