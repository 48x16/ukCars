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

/**
 * Motorbikes, scooters and quad bikes that turn up in DVLA's car figures: a few hundred in all.
 * They stay in the totals, as DVLA counts them, but are left out of search, Explore and lists
 * of cars. Checked by hand: lookalikes that are real cars stay in (the Sunbeam Tiger, Pontiac
 * Bonneville, Honda Z600, Citroen GSX and KTM X-Bow), as does BSA, which made cars too.
 */
export const MOTORBIKES = {
  makes: [
    'AJS', 'BENELLI', 'CCM', 'DUCATI', 'HARLEY-DAVIDSON', 'KAWASAKI', 'KYMCO', 'LEXMOTO', 'MOTO GUZZI',
    'NORTON', 'NORTON VILLIERS TRIUMPH', 'ROYAL ENFIELD', 'SYM', 'VESPA (DOUGLAS)', 'YAMAHA',
  ],
  models: [
    'HONDA CB', 'HONDA CBR', 'HONDA TLM240R', 'SUZUKI GSX', 'PIAGGIO VESPA',
    'TRIUMPH ADVENTURER', 'TRIUMPH BONNEVILLE', 'TRIUMPH TIGER', 'TRIUMPH TRIDENT',
  ],
};

export const isMotorbike = (make, genModel) => MOTORBIKES.makes.includes(make) || MOTORBIKES.models.includes(genModel);

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

/**
 * Body styles for "The SUV takeover". DVLA records no body type (every car is just "Cars"), so
 * these are our own, for the most-registered models since 2001: together, over nine in ten new
 * cars. Unlisted models count as "Not classified". Where DVLA files several bodies under one
 * model (the Citroen C4 Picasso under C4, the Yaris Cross under Yaris), a variant rule picks
 * them out; where a name moved to a different body (the Ford Puma), a year rule does.
 */
export const BODY_STYLES = [
  { id: 'suv', label: 'SUVs and crossovers' },
  { id: 'hatch', label: 'Hatchbacks and small cars' },
  { id: 'saloon', label: 'Saloons and estates' },
  { id: 'mpv', label: 'People carriers' },
  { id: 'sports', label: 'Sports cars and coupés' },
];

const bodies = (id, models) => models.map((m) => [m, id]);

export const BODY_BY_MODEL = new Map([
  ...bodies('suv', [
    'NISSAN QASHQAI', 'KIA SPORTAGE', 'NISSAN JUKE', 'FORD KUGA', 'VOLKSWAGEN TIGUAN', 'LAND ROVER DISCOVERY', 'VAUXHALL MOKKA',
    'HYUNDAI TUCSON', 'HONDA CR-V', 'LAND ROVER RANGE ROVER EVOQUE', 'LAND ROVER FREELANDER', 'PEUGEOT 2008', 'TOYOTA RAV4',
    'PEUGEOT 3008', 'LAND ROVER RANGE ROVER SPORT', 'RENAULT CAPTUR', 'MINI COUNTRYMAN', 'VOLVO XC40', 'AUDI Q3', 'VOLKSWAGEN T-ROC',
    'BMW X5', 'VOLVO XC60', 'NISSAN X-TRAIL', 'BMW X3', 'TOYOTA C-HR', 'AUDI Q5', 'BMW X1', 'TESLA MODEL Y', 'KIA NIRO',
    'LAND ROVER RANGE ROVER', 'MG HS', 'VOLVO XC90', 'MERCEDES GLA CLASS', 'HYUNDAI KONA', 'AUDI Q2', 'VAUXHALL GRANDLAND',
    'MERCEDES GLC CLASS', 'DACIA DUSTER', 'FORD ECOSPORT', 'SKODA KAROQ', 'MAZDA CX-5', 'VAUXHALL CROSSLAND', 'SUZUKI VITARA',
    'MITSUBISHI OUTLANDER', 'SKODA KODIAQ', 'SEAT ARONA', 'LAND ROVER DEFENDER', 'SKODA YETI', 'JAGUAR F-PACE', 'SEAT ATECA',
    'AUDI Q7', 'HYUNDAI SANTA FE', 'RENAULT KADJAR', 'MERCEDES ML CLASS', 'HONDA HR-V', 'KIA SORENTO', 'MITSUBISHI SHOGUN',
    'AUDI Q4', 'LEXUS RX', 'HYUNDAI IX35', 'VOLKSWAGEN TOUAREG', 'SUZUKI GRAND VITARA', 'SUZUKI SX', 'PORSCHE MACAN',
    'CUPRA FORMENTOR', 'SKODA KAMIQ', 'PORSCHE CAYENNE', 'KIA STONIC', 'VOLKSWAGEN T-CROSS', 'LAND ROVER RANGE ROVER VELAR',
    'JAECOO 7', 'LEXUS NX', 'SKODA ENYAQ', 'MERCEDES GLE CLASS', 'MAZDA CX-30', 'KIA XCEED', 'VOLKSWAGEN ID4', 'TOYOTA LAND CRUISER',
    'JAGUAR E-PACE', 'MERCEDES EQA CLASS', 'MITSUBISHI ASX', 'SUBARU FORESTER', 'VOLKSWAGEN TAIGO', 'JEEP RENEGADE', 'JAGUAR I-PACE',
    'JEEP CHEROKEE', 'KIA SOUL', 'LEXUS UX', 'MERCEDES GLB CLASS', 'VAUXHALL ANTARA', 'AUDI E-TRON', 'MAZDA CX-3', 'VAUXHALL FRONTERA',
    'VOLVO EX30', 'BMW X6', 'HYUNDAI BAYON', 'CHERY TIGGO', 'FORD EXPLORER', 'BMW IX1', 'BMW X4', 'BMW IX3', 'JEEP AVENGER',
    'MERCEDES EQB CLASS', 'KIA EV6', 'MERCEDES EQC CLASS', 'BMW IX', 'RENAULT ARKANA', 'JEEP COMPASS', 'RENAULT SYMBIOZ', 'AUDI Q6',
    'KIA EV3', 'RENAULT AUSTRAL', 'SKODA ELROQ', 'AUDI Q8', 'POLESTAR 4', 'OMODA 5 NOBLE AUTO', 'LEXUS LBX', 'BYD SEALION',
    'NISSAN ARIYA', 'CUPRA TERRAMAR', 'SEAT TARRACO', 'TOYOTA BZ4X', 'VOLKSWAGEN ID5', 'JEEP GRAND CHEROKEE', 'BMW X2', 'AUDI SQ5',
    'MERCEDES G CLASS', 'MERCEDES GL CLASS', 'MERCEDES GLS CLASS', 'BENTLEY BENTAYGA', 'LAMBORGHINI URUS', 'ROLLS ROYCE CULLINAN',
    'BYD ATTO 3', 'MAZDA CX-60', 'BMW IX2', 'SUZUKI S-CROSS', 'MG S5', 'CUPRA TAVASCAN', 'FIAT 600', 'VOLKSWAGEN TAYRON',
    'HONDA ZR-V SPORT', 'VOLVO C40', 'VOLVO EX40', 'BMW X7', 'CUPRA ATECA', 'KIA EV9', 'DACIA BIGSTER', 'LEXUS RZ', 'KIA EV5',
    'SUZUKI E VITARA', 'POLESTAR 3', 'LEAPMOTOR C10', 'LEAPMOTOR B10', 'SHINERAY STARRAY', 'SHINERAY EX5', 'ALFA ROMEO JUNIOR',
    'ALFA ROMEO TONALE', 'LOTUS ELETRE', 'GENESIS GV60', 'GENESIS GV70', 'GENESIS GV80', 'DS DS7', 'SMART 1', 'SMART 3', 'SMART 5',
    'MAZDA MX-30', 'CHEVROLET CAPTIVA', 'NISSAN PATHFINDER', 'DAIHATSU TERIOS', 'SUZUKI JIMNY', 'RENAULT 4', 'BYD SEALION 7',
    'BYD ATTO 2', 'BMW X5 M', 'MAZDA CX-80', 'VOLVO EX90', 'MERCEDES EQS SUV CLASS', 'MERCEDES GLE COUPE CLASS', 'DS DS4',
    'KIA EV2', 'XPENG G6', 'XPENG G9', 'CHANGAN DEEPAL S07', 'GWM ORA', 'INEOS GRENADIER', 'MG EHS', 'HONDA ZR-V', 'HONDA E:NY1',
  ]),
  ...bodies('hatch', [
    'FORD FIESTA', 'FORD FOCUS', 'VAUXHALL CORSA', 'VOLKSWAGEN GOLF', 'VAUXHALL ASTRA', 'VOLKSWAGEN POLO', 'RENAULT CLIO', 'TOYOTA YARIS',
    'MINI COOPER', 'AUDI A3', 'BMW 1 SERIES', 'MERCEDES A CLASS', 'RENAULT MEGANE', 'PEUGEOT 206', 'HONDA CIVIC', 'FIAT 500', 'FORD KA',
    'HONDA JAZZ', 'NISSAN MICRA', 'CITROEN C3', 'SKODA FABIA', 'FIAT PUNTO', 'TOYOTA AYGO', 'SEAT IBIZA', 'CITROEN C4', 'PEUGEOT 307',
    'HYUNDAI I10', 'SEAT LEON', 'CITROEN XSARA', 'PEUGEOT 208', 'AUDI A1', 'TOYOTA COROLLA', 'KIA PICANTO', 'PEUGEOT 207', 'PEUGEOT 308',
    'SUZUKI SWIFT', 'CITROEN C1', 'TOYOTA AURIS', 'HYUNDAI I20', 'MAZDA 2', 'NISSAN NOTE', 'MINI ONE', 'MAZDA 3', 'KIA CEED',
    'DACIA SANDERO', 'TOYOTA PRIUS', 'KIA RIO', 'NISSAN ALMERA', 'HYUNDAI I30', 'PEUGEOT 107', 'VOLKSWAGEN UP', 'VOLVO V40', 'FIAT PANDA',
    'ROVER 25', 'FORD FUSION', 'CITROEN SAXO', 'VOLKSWAGEN BEETLE', 'CITROEN DS3', 'PEUGEOT 108', 'SUZUKI ALTO', 'HYUNDAI IONIQ',
    'SMART FORTWO', 'NISSAN LEAF', 'HYUNDAI GETZ', 'VAUXHALL AGILA', 'CITROEN C2', 'VAUXHALL ADAM', 'MG 3', 'VOLKSWAGEN ID3',
    'SUZUKI IGNIS', 'MG ZR', 'SKODA CITIGO', 'PEUGEOT 106', 'MITSUBISHI COLT', 'MG 4', 'ROVER 45', 'AUDI S3', 'FIAT STILO', 'DS DS3',
    'VAUXHALL VIVA', 'FORD KA+', 'SMART FORFOUR', 'LEXUS CT', 'CUPRA BORN', 'CHEVROLET MATIZ', 'VOLVO C30', 'RENAULT TWINGO',
    'DAEWOO MATIZ', 'ALFA ROMEO GIULIETTA', 'ALFA ROMEO 147', 'RENAULT ZOE', 'SUZUKI CELERIO', 'PEUGEOT 306', 'BMW I3',
    'MINI JOHN COOPER WORKS', 'SKODA RAPID', 'HYUNDAI ACCENT', 'ALFA ROMEO MITO', 'FIAT BRAVO', 'ABARTH 595', 'SKODA SCALA',
    'NISSAN PULSAR', 'FIAT SEICENTO', 'VOLKSWAGEN FOX', 'AUDI A2', 'VOLKSWAGEN LUPO', 'TOYOTA IQ', 'SUZUKI SPLASH', 'SEAT MII',
    'CHEVROLET SPARK', 'HYUNDAI AMICA', 'CHEVROLET AVEO', 'MCC SMART', 'RENAULT 5', 'BYD DOLPHIN', 'CHEVROLET KALOS',
    'CHEVROLET LACETTI', 'NISSAN PIXO', 'SMART CITY', 'DAIHATSU SIRION', 'CITROEN DS4', 'MINI CLUBMAN', 'MAZDA 323', 'CUPRA LEON',
    'FIAT TIPO', 'VOLKSWAGEN URBAN', 'SUZUKI WAGON R+', 'MINI ACEMAN', 'MINI FIRST', 'ABARTH 500', 'MG ZS',
    'HONDA E', 'DACIA SPRING', 'HYUNDAI INSTER', 'CITROEN E-C3', 'TOYOTA GR YARIS', 'AUDI RS3', 'ALPINE A290', 'MITSUBISHI MIRAGE',
    'SUZUKI LIANA', 'FIAT BRAVA', 'HONDA INSIGHT', 'KIA EV4', 'BYD DOLPHIN SURF', 'FIAT GRANDE PANDA', 'VAUXHALL ASTRA ELECTRIC',
    'ABARTH 695', 'AUDI S1', 'VOLKSWAGEN ID2', 'MG CYBERSTER',
  ]),
  ...bodies('saloon', [
    'BMW 3 SERIES', 'FORD MONDEO', 'MERCEDES C CLASS', 'VOLKSWAGEN PASSAT', 'AUDI A4', 'VAUXHALL VECTRA', 'MERCEDES E CLASS',
    'SKODA OCTAVIA', 'BMW 5 SERIES', 'VAUXHALL INSIGNIA', 'AUDI A6', 'TOYOTA AVENSIS', 'MAZDA 6', 'TESLA MODEL 3', 'SAAB 9-3',
    'RENAULT LAGUNA', 'MERCEDES CLA CLASS', 'JAGUAR XF SERIES', 'JAGUAR X TYPE', 'CITROEN C5', 'SKODA SUPERB', 'HONDA ACCORD',
    'ROVER 75', 'VOLVO V70', 'LEXUS IS', 'PEUGEOT 407', 'PEUGEOT 406', 'NISSAN PRIMERA', 'VOLVO S40', 'MERCEDES S CLASS', 'VOLVO V50',
    'VOLVO V60', 'JAGUAR XE SERIES', 'MITSUBISHI LANCER', 'JAGUAR S TYPE', 'SUBARU IMPREZA', 'MERCEDES CLS CLASS', 'VOLKSWAGEN BORA',
    'POLESTAR 2', 'SAAB 9-5', 'VOLKSWAGEN JETTA', 'BMW 7 SERIES', 'HYUNDAI I40', 'JAGUAR XJ SERIES', 'PEUGEOT 508', 'VOLVO S80',
    'VOLVO S60', 'VAUXHALL OMEGA', 'AUDI A7', 'VOLKSWAGEN CC', 'AUDI A8', 'VOLVO V90', 'VAUXHALL SIGNUM', 'KIA OPTIMA',
    'VOLKSWAGEN ARTEON', 'AUDI S4', 'PORSCHE PANAMERA', 'LEXUS GS', 'VOLKSWAGEN ID7', 'BMW I4', 'PORSCHE TAYCAN', 'BYD SEAL', 'MG 5',
    'SUBARU LEGACY', 'VOLVO XC70', 'SUBARU OUTBACK', 'SEAT TOLEDO', 'DACIA LOGAN', 'BMW M3', 'AUDI A5', 'BMW 4 SERIES', 'BMW 2 SERIES',
    'MERCEDES AMG CLASS', 'AUDI S5', 'MG ZT', 'MERCEDES CLC CLASS', 'MITSUBISHI CARISMA', 'VOLVO S90', 'MERCEDES EQE CLASS', 'MERCEDES EQS CLASS',
    'BMW I5', 'LEXUS ES', 'BMW M5', 'TESLA MODEL S', 'PEUGEOT 408', 'KIA PROCEED', 'KIA PRO CEED', 'SUZUKI SWACE', 'ALFA ROMEO 156',
    'ALFA ROMEO 159', 'ALFA ROMEO GIULIA', 'BMW I7', 'AUDI A6 E-TRON', 'AUDI RS6', 'AUDI RS4', 'MERCEDES CLA SHOOTING BRAKE',
  ]),
  ...bodies('mpv', [
    'VAUXHALL ZAFIRA', 'VAUXHALL MERIVA', 'FORD GALAXY', 'RENAULT SCENIC', 'FORD C-MAX', 'VOLKSWAGEN TOURAN', 'FORD S-MAX',
    'CITROEN BERLINGO', 'MERCEDES B CLASS', 'RENAULT GRAND SCENIC', 'PEUGEOT 5008', 'VOLKSWAGEN SHARAN', 'FORD TOURNEO', 'FORD B-MAX',
    'SEAT ALHAMBRA', 'FORD GRAND C-MAX', 'PEUGEOT PARTNER', 'KIA SEDONA', 'KIA CARENS', 'KIA VENGA', 'RENAULT MODUS', 'SEAT ALTEA',
    'TOYOTA VERSO', 'HYUNDAI IX20', 'FIAT DOBLO', 'VOLKSWAGEN CADDY', 'DACIA JOGGER', 'MAZDA 5', 'CHRYSLER GRAND VOYAGER',
    'SKODA ROOMSTER', 'VOLKSWAGEN TRANSPORTER', 'PEUGEOT RIFTER', 'HYUNDAI MATRIX', 'RENAULT ESPACE', 'VAUXHALL COMBO', 'RENAULT TRAFIC',
    'MERCEDES V CLASS', 'MERCEDES VITO', 'VAUXHALL VIVARO', 'HONDA FR-V', 'FIAT MULTIPLA', 'RENAULT KANGOO', 'MITSUBISHI SPACE STAR',
    'CHRYSLER PT CRUISER', 'CITROEN XSARA PICASSO', 'CITROEN SPACETOURER', 'PEUGEOT TRAVELLER', 'TOYOTA PROACE', 'VOLKSWAGEN MULTIVAN',
    'VOLKSWAGEN ID BUZZ', 'TOYOTA ESTIMA', 'CITROEN E-BERLINGO', 'FORD TRANSIT CUSTOM', 'CHRYSLER VOYAGER', 'VOLKSWAGEN CARAVELLE',
    'TOYOTA PREVIA', 'CITROEN C8', 'PEUGEOT 807', 'TOYOTA ALPHARD', 'NISSAN ELGRAND', 'MAZDA BONGO', 'MERCEDES EQV CLASS', 'KIA PV5',
  ]),
  ...bodies('sports', [
    'MAZDA MX-5', 'AUDI TT', 'PORSCHE 911', 'MERCEDES SLK CLASS', 'VOLKSWAGEN SCIROCCO', 'BMW Z4', 'AUDI TTS', 'HYUNDAI COUPE',
    'TOYOTA CELICA', 'FORD MUSTANG', 'PORSCHE BOXSTER', 'BMW 6 SERIES', 'MG TF', 'MAZDA RX-8', 'JAGUAR XK SERIES', 'BENTLEY CONTINENTAL',
    'VAUXHALL TIGRA', 'VOLKSWAGEN EOS', 'MERCEDES SL CLASS', 'PORSCHE 718', 'JAGUAR F-TYPE', 'TOYOTA MR2', 'VOLVO C70', 'PORSCHE CAYMAN',
    'PEUGEOT RCZ', 'MERCEDES CLK CLASS', 'BMW M4', 'FORD STREETKA', 'FORD PUMA', 'MINI ROADSTER', 'MINI PACEMAN', 'MERCEDES SLC CLASS',
    'TOYOTA GT86', 'TOYOTA GR86', 'NISSAN 350Z', 'NISSAN 370Z', 'BMW 8 SERIES', 'BMW M2', 'AUDI R8', 'LOTUS ELISE',
    'MERCEDES CLE CLASS', 'MITSUBISHI ECLIPSE', 'FORD CAPRI', 'TOYOTA SUPRA', 'NISSAN GT-R', 'LOTUS EMIRA', 'LOTUS EVORA', 'LOTUS EXIGE',
    'MAZDA MX-5 RF', 'ALPINE A110', 'BMW M8',
  ]),
]);

/** Makes that only sell one body (their DVLA model names vary too much to list). */
export const BODY_BY_MAKE = new Map([
  ['OMODA', 'suv'],
  ['JAECOO', 'suv'],
]);

/** Exceptions: a variant (matched on DVLA's Model name) or a span of years with a different body. */
export const BODY_RULES = [
  { genModel: 'CITROEN C4', match: /PICASSO|^C4 GRAND|^C4 GR |SPACETOURER/, body: 'mpv' },
  { genModel: 'CITROEN C4', match: /AIRCROSS/, body: 'suv' },
  { genModel: 'CITROEN C3', match: /PICASSO/, body: 'mpv' },
  { genModel: 'CITROEN C3', match: /AIRCROSS/, body: 'suv' },
  { genModel: 'CITROEN C5', match: /AIRCROSS/, body: 'suv' },
  { genModel: 'TOYOTA YARIS', match: /VERSO/, body: 'mpv' },
  { genModel: 'TOYOTA YARIS', match: /CROSS/, body: 'suv' },
  { genModel: 'TOYOTA COROLLA', match: /VERSO/, body: 'mpv' },
  { genModel: 'TOYOTA COROLLA', match: /CROSS/, body: 'suv' },
  { genModel: 'VOLKSWAGEN GOLF', match: /^GOLF (PLUS|SV)\b/, body: 'mpv' },
  { genModel: 'FIAT 500', match: /^500X/, body: 'suv' },
  { genModel: 'FIAT 500', match: /^500L/, body: 'mpv' },
  { genModel: 'BMW 2 SERIES', match: /ACTIVE TOURER|GRAN TOURER/, body: 'mpv' },
  { genModel: 'HYUNDAI IONIQ', match: /^IONIQ [59]\b/, body: 'suv' },
  { genModel: 'HYUNDAI IONIQ', match: /^IONIQ 6\b/, body: 'saloon' },
  { genModel: 'MERCEDES AMG CLASS', match: /^AMG G\b|^AMG GL/, body: 'suv' },
  { genModel: 'MERCEDES AMG CLASS', match: /^AMG (GT|SL)\b/, body: 'sports' },
  // The original Puma was a small coupe (to 2002); the name came back on a crossover in 2019.
  { genModel: 'FORD PUMA', from: 2010, body: 'suv' },
  // The Rover-era MG ZS (to 2005) was a hatch and saloon; the SAIC one (from 2017) is a crossover.
  { genModel: 'MG ZS', from: 2011, body: 'suv' },
  { genModel: 'PEUGEOT 5008', from: 2017, body: 'suv' },
  { genModel: 'RENAULT SCENIC', from: 2024, body: 'suv' },
  { genModel: 'RENAULT ESPACE', from: 2015, body: 'suv' },
  { genModel: 'MITSUBISHI SPACE STAR', from: 2013, body: 'hatch' },
  // The Eclipse was a coupe; the Eclipse Cross (from 2018) is an SUV. Ford's Capri came back as an electric SUV in 2024.
  { genModel: 'MITSUBISHI ECLIPSE', from: 2017, body: 'suv' },
  { genModel: 'FORD CAPRI', from: 2024, body: 'suv' },
];

/** The body style of a model's variant in a given year, or null if it isn't classified. */
export function bodyOf(genModel, model, year, make = genModel.split(' ')[0]) {
  const rule = BODY_RULES.find((r) => r.genModel === genModel && (!r.match || r.match.test(model)) && (!r.from || year >= r.from));
  return rule ? rule.body : (BODY_BY_MODEL.get(genModel) ?? BODY_BY_MAKE.get(make) ?? null);
}
