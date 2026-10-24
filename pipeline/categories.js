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

/**
 * Where each make is from: its home country, not its current owner (MINI, Jaguar and Land
 * Rover count as British; Volvo and Polestar as Swedish). Makes not listed count as "Other".
 * Two makes are split by model, because the same badge now comes from somewhere else:
 * SAIC's MGs and Geely's numbered Smarts are Chinese (see ORIGIN_BY_MODEL).
 */
export const ORIGINS = [
  { id: 'british', label: 'British' },
  { id: 'german', label: 'German' },
  { id: 'japanese', label: 'Japanese' },
  { id: 'american', label: 'American' },
  { id: 'korean', label: 'Korean' },
  { id: 'french', label: 'French' },
  { id: 'european', label: 'Rest of Europe' },
  { id: 'chinese', label: 'Chinese' },
  { id: 'italian', label: 'Italian' },
  { id: 'other', label: 'Other' },
];

const makesFrom = (origin, makes) => makes.map((make) => [make, origin]);

export const MAKE_ORIGINS = new Map([
  ...makesFrom('british', [
    'VAUXHALL', 'LAND ROVER', 'MINI', 'MG', 'JAGUAR', 'OTHER BRITISH', 'TRIUMPH', 'ROVER', 'AUSTIN', 'BENTLEY',
    'MORRIS', 'ASTON MARTIN', 'LOTUS', 'ROLLS ROYCE', 'MORGAN', 'TVR', 'DAIMLER', 'RILEY', 'AUSTIN HEALEY',
    'SUNBEAM', 'MCLAREN', 'HILLMAN', 'CATERHAM', 'WOLSELEY', 'AUSTIN-MORRIS', 'RELIANT', 'INEOS', 'HUMBER',
    'LEYLAND CARS', 'JENSEN', 'SINGER', 'WESTFIELD', 'NOBLE', 'GINETTA', 'ARIEL', 'BRISTOL', 'LEA FRANCIS',
  ]),
  ...makesFrom('german', ['VOLKSWAGEN', 'BMW', 'AUDI', 'MERCEDES', 'MERCEDES-BENZ', 'PORSCHE', 'SMART', 'MCC', 'OPEL', 'MAYBACH']),
  ...makesFrom('japanese', [
    'TOYOTA', 'NISSAN', 'HONDA', 'MAZDA', 'SUZUKI', 'LEXUS', 'MITSUBISHI', 'SUBARU', 'DAIHATSU', 'INFINITI',
    'ISUZU', 'DATSUN',
  ]),
  ...makesFrom('american', ['FORD', 'TESLA', 'JEEP', 'CHEVROLET', 'CHRYSLER', 'DODGE', 'CHEVROLET GMC', 'CADILLAC', 'PONTIAC', 'BUICK', 'LINCOLN', 'HUMMER']),
  ...makesFrom('korean', ['KIA', 'HYUNDAI', 'SSANGYONG', 'KGM', 'GENESIS', 'DAEWOO']),
  ...makesFrom('french', ['PEUGEOT', 'RENAULT', 'CITROEN', 'DS', 'ALPINE', 'TALBOT']),
  ...makesFrom('european', ['SKODA', 'SEAT', 'CUPRA', 'VOLVO', 'SAAB', 'POLESTAR', 'DACIA', 'LADA']),
  ...makesFrom('chinese', ['BYD', 'JAECOO', 'OMODA', 'CHERY', 'LEAPMOTOR', 'SHINERAY', 'ORA', 'CHANGAN', 'XPENG', 'GWM', 'NIO', 'ZEEKR', 'DONGFENG', 'MAXUS', 'SKYWELL', 'XEV']),
  ...makesFrom('italian', ['FIAT', 'ALFA ROMEO', 'ABARTH', 'FERRARI', 'MASERATI', 'LAMBORGHINI', 'LANCIA', 'PAGANI']),
]);

/** Models whose badge now comes from somewhere other than the make's home. */
export const ORIGIN_BY_MODEL = [
  // SAIC's MGs, since 2011. (MG also used "ZS" on a Rover-era car in 2001 to 2005; those few are counted here too.)
  { genModel: /^MG (ZS|HS|3|4|5|6|GS|S5|S6|S9|IM5|IM6|CYBERSTER)$/, origin: 'chinese' },
  // Geely's Smart #1, #3 and #5.
  { genModel: /^SMART [135]$/, origin: 'chinese' },
];

export function originOf(make, genModel) {
  const special = ORIGIN_BY_MODEL.find((r) => r.genModel.test(genModel));
  return special ? special.origin : (MAKE_ORIGINS.get(make) ?? 'other');
}

/** The Bavarian battle, and who else is on the start line for context. */
export const BAVARIAN = ['BMW', 'MERCEDES', 'AUDI'];

/**
 * Hand-picked groups for "Out to play", the summer-only cars. Makes count every model;
 * models count every variant.
 */
export const SUMMER_GROUPS = [
  { id: 'supercars', label: 'Supercars', makes: ['FERRARI', 'LAMBORGHINI', 'MCLAREN', 'ASTON MARTIN'] },
  { id: 'kit', label: 'British sports cars', makes: ['CATERHAM', 'TVR', 'MORGAN', 'LOTUS', 'WESTFIELD'] },
  {
    id: 'roadsters',
    label: 'Roadsters',
    models: ['MAZDA MX-5', 'PORSCHE BOXSTER', 'BMW Z4', 'BMW Z3', 'MG MGF', 'MG TF', 'HONDA S2000', 'MERCEDES SLK CLASS', 'AUDI TT'],
  },
  { id: 'everyone', label: 'Every car', all: true },
];
