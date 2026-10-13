/**
 * FICTIONAL DEMONSTRATION DATA.
 * Aurelia Hotels and every property below are invented. They are placed in
 * real regions for realism, but none of them is a real business. Prices are
 * realistic examples in USD cents; "demoRating" values are illustrative and are
 * never presented as real guest reviews. Distances are approximate examples.
 */

export const AMENITIES: { code: string; label: string }[] = [
  { code: 'wifi', label: 'Complimentary Wi-Fi' },
  { code: 'pool', label: 'Swimming pool' },
  { code: 'spa', label: 'Spa & wellness' },
  { code: 'restaurant', label: 'Restaurant' },
  { code: 'bar', label: 'Bar & lounge' },
  { code: 'fitness', label: 'Fitness studio' },
  { code: 'parking', label: 'On-site parking' },
  { code: 'airport_transfer', label: 'Airport transfers' },
  { code: 'room_service', label: '24-hour room service' },
  { code: 'concierge', label: 'Concierge' },
  { code: 'kids_club', label: 'Kids’ club' },
  { code: 'pet_friendly', label: 'Pet friendly' },
  { code: 'ski_storage', label: 'Ski storage' },
  { code: 'ev_charging', label: 'EV charging' },
  { code: 'wine_cellar', label: 'Wine cellar' },
  { code: 'hot_spring', label: 'Hot-spring baths' },
];

export const DESTINATIONS = [
  {
    slug: 'cape-winelands', name: 'Cape Winelands', country: 'South Africa', image: 'winelands-estate-exterior',
    summary: 'Gabled estates, mountain light and long lunches among the vines.',
  },
  {
    slug: 'lake-lucerne', name: 'Lake Lucerne', country: 'Switzerland', image: 'lucerne-cliff-infinity-pool',
    summary: 'Cliffside calm above a lake that changes colour with every hour.',
  },
  {
    slug: 'dolomites', name: 'The Dolomites', country: 'Italy', image: 'dolomites-lodge-exterior',
    summary: 'Pale peaks at sunset, alpine trails and South Tyrolean hospitality.',
  },
  {
    slug: 'aosta-valley', name: 'Aosta Valley', country: 'Italy', image: 'aosta-chalet-exterior',
    summary: 'Stone-and-timber chalets in the shadow of Europe’s highest summits.',
  },
  {
    slug: 'kyushu', name: 'Yufuin, Kyushu', country: 'Japan', image: 'kyushu-terrace-infinity-pool',
    summary: 'Hot-spring valleys, morning mist and a volcano on the horizon.',
  },
];

type Img = [src: string, alt: string];
interface RoomSeed {
  slug: string; name: string; description: string; maxAdults: number; maxOccupancy: number; bed: string;
  sizeSqm: number; rate: number; inventory: number; mealPlan: string; refundable: boolean; terms: string;
  amenities: string[]; images: Img[];
}
export interface HotelSeed {
  slug: string; destination: string; name: string; tagline: string; propertyType: string; stars: number;
  demoRating: number; overview: string; description: string; address: string; lat: number; lng: number;
  checkIn: string; checkOut: string; cancellationPolicy: string; houseRules: string[];
  nearby: { name: string; distance: string }[]; breakfast: boolean; freeCancellation: boolean; featured: boolean;
  amenities: string[]; images: Img[]; rooms: RoomSeed[];
}

const FLEX = 'Free cancellation until 48 hours before arrival (demo policy). Later cancellations are charged one night.';
const FLEX_7 = 'Free cancellation until 7 days before arrival (demo policy). Later cancellations are charged 50% of the stay.';
const NONREF = 'Non-refundable rate (demo policy). Date changes may be requested and are subject to availability.';

const ROOM_STD_AMEN = ['Air conditioning', 'Rain shower', 'Espresso machine', 'Smart TV', 'In-room safe'];
const ROOM_LUX_AMEN = [...ROOM_STD_AMEN, 'Soaking tub', 'Separate lounge', 'Evening turndown'];

export const HOTELS: HotelSeed[] = [
  {
    slug: 'aurelia-winelands-estate',
    destination: 'cape-winelands',
    name: 'Aurelia Winelands Estate',
    tagline: 'A Cape Dutch manor among the vines',
    propertyType: 'Estate',
    stars: 5,
    demoRating: 9.3,
    overview: 'A whitewashed manor house with deep verandas, an infinity pool above the vines and a kitchen that cooks from its own gardens.',
    description: 'Set on a working wine farm beneath a ridge of sandstone mountains, the estate pairs historic gabled architecture with quiet, contemporary rooms. Mornings begin on the terrace; afternoons drift between the pool deck, the cellar and the olive groves. Evenings are for candlelit dinners and stars.',
    address: 'Demonstration address — Franschhoek Valley, Western Cape, South Africa',
    lat: -33.9133, lng: 19.1169,
    checkIn: '15:00', checkOut: '11:00',
    cancellationPolicy: 'Most rates may be cancelled free of charge until 48 hours before arrival. Each room shows its own terms before you book. (Demo policy.)',
    houseRules: ['Quiet hours from 22:00 to 07:00', 'Non-smoking throughout, including terraces', 'Children of all ages welcome', 'Pets are not permitted'],
    nearby: [{ name: 'Village restaurants and galleries', distance: '≈ 3 km' }, { name: 'Mountain pass viewpoint', distance: '≈ 8 km' }, { name: 'Cape Town International Airport', distance: '≈ 75 km' }],
    breakfast: true, freeCancellation: true, featured: true,
    amenities: ['wifi', 'pool', 'restaurant', 'bar', 'wine_cellar', 'parking', 'concierge', 'kids_club', 'ev_charging'],
    images: [
      ['winelands-estate-exterior', 'A whitewashed Cape Dutch manor with lit verandas and a terraced pool, mountains behind at dusk'],
      ['restaurant-classic-dining-room', 'A warm, wood-panelled dining room with chandelier and candlelit tables'],
      ['room-valley-view-king', 'A calm king room in warm neutrals with tall windows over the valley'],
      ['room-garden-glasshouse', 'A bright bedroom framed by floor-to-ceiling glass doors and garden greenery'],
      ['suite-turquoise-bedroom', 'A suite with a turquoise velvet headboard, parquet floor and balcony doors'],
    ],
    rooms: [
      { slug: 'garden-room', name: 'Garden Room', description: 'Glass doors open onto a private patch of garden. Light, quiet and close to the pool.', maxAdults: 2, maxOccupancy: 2, bed: '1 king or 2 singles', sizeSqm: 32, rate: 34000, inventory: 8, mealPlan: 'Breakfast included', refundable: true, terms: FLEX, amenities: ROOM_STD_AMEN, images: [['room-garden-glasshouse', 'Garden Room with king bed between glass doors that open to the garden']] },
      { slug: 'deluxe-vineyard-room', name: 'Deluxe Vineyard Room', description: 'A larger room with a reading corner and long views across the vines to the ridge.', maxAdults: 2, maxOccupancy: 3, bed: '1 king (extra bed on request)', sizeSqm: 40, rate: 42000, inventory: 6, mealPlan: 'Breakfast included', refundable: true, terms: FLEX, amenities: [...ROOM_STD_AMEN, 'Reading nook'], images: [['room-valley-view-king', 'Deluxe Vineyard Room with king bed and full-height windows']] },
      { slug: 'junior-suite', name: 'Junior Suite', description: 'Velvet, oak and brass — with a sitting area and a balcony over the courtyard.', maxAdults: 2, maxOccupancy: 3, bed: '1 king + sofa bed', sizeSqm: 55, rate: 56000, inventory: 4, mealPlan: 'Breakfast included', refundable: true, terms: FLEX, amenities: ROOM_LUX_AMEN, images: [['suite-turquoise-bedroom', 'Junior Suite with turquoise headboard and balcony']] },
      { slug: 'family-cottage', name: 'Family Cottage', description: 'A two-bedroom cottage with its own stoep, for families who want room to spread out.', maxAdults: 3, maxOccupancy: 5, bed: '1 king + 2 singles + 1 sofa bed', sizeSqm: 68, rate: 64000, inventory: 3, mealPlan: 'Breakfast included', refundable: true, terms: FLEX_7, amenities: [...ROOM_STD_AMEN, 'Kitchenette', 'Two bathrooms'], images: [['room-garden-glasshouse', 'Family Cottage main bedroom opening to the garden'], ['room-valley-view-king', 'Family Cottage second bedroom']] },
    ],
  },
  {
    slug: 'aurelia-lucerne-cliffs',
    destination: 'lake-lucerne',
    name: 'Aurelia Lucerne Cliffs',
    tagline: 'Stone, glass and a pool at the edge of the sky',
    propertyType: 'Resort',
    stars: 5,
    demoRating: 9.5,
    overview: 'A granite-clad resort on a high meadow, where the heated infinity pool seems to pour straight into the lake below.',
    description: 'Built into the hillside, every room faces the water and the ranges beyond. Days are slow by design: a long breakfast, a swim through the mist, a walk along the ridge path, and dinner in a dining room of carved panels and crystal light.',
    address: 'Demonstration address — above Lake Lucerne, Canton of Nidwalden, Switzerland',
    lat: 46.9827, lng: 8.4196,
    checkIn: '15:00', checkOut: '12:00',
    cancellationPolicy: 'Flexible and non-refundable rates are offered. The Presidential Suite is non-refundable. (Demo policy.)',
    houseRules: ['Adults-only pool after 18:00', 'Non-smoking property', 'Well-behaved dogs welcome in Superior rooms by request'],
    nearby: [{ name: 'Lakeside promenade and boat pier', distance: '≈ 6 km' }, { name: 'Ridge hiking trail', distance: 'from the door' }, { name: 'Lucerne old town', distance: '≈ 25 km' }],
    breakfast: true, freeCancellation: true, featured: true,
    amenities: ['wifi', 'pool', 'spa', 'restaurant', 'bar', 'fitness', 'room_service', 'concierge', 'parking', 'pet_friendly'],
    images: [
      ['lucerne-cliff-infinity-pool', 'A heated infinity pool beside a granite building, with misty mountains and a lake at sunrise'],
      ['restaurant-ornate-dining-room', 'An ornate dining room with a crystal chandelier, carved dark panels and white tablecloths'],
      ['suite-turquoise-bedroom', 'A refined suite with turquoise headboard, leather bench and parquet floor'],
      ['room-loft-grey-headboard', 'A light-filled room with a tall grey headboard, brass pendants and timber beams'],
    ],
    rooms: [
      { slug: 'superior-lake-room', name: 'Superior Lake Room', description: 'Compact, serene and oriented to the lake. A window seat made for coffee and fog.', maxAdults: 2, maxOccupancy: 2, bed: '1 queen', sizeSqm: 34, rate: 61000, inventory: 10, mealPlan: 'Breakfast included', refundable: true, terms: FLEX, amenities: ROOM_STD_AMEN, images: [['room-loft-grey-headboard', 'Superior Lake Room with grey wing headboard']] },
      { slug: 'deluxe-panorama-room', name: 'Deluxe Panorama Room', description: 'Wider glass, a deep tub and a balcony facing the whole sweep of the lake.', maxAdults: 2, maxOccupancy: 3, bed: '1 king', sizeSqm: 42, rate: 72000, inventory: 8, mealPlan: 'Breakfast included', refundable: true, terms: FLEX, amenities: [...ROOM_STD_AMEN, 'Soaking tub', 'Balcony'], images: [['room-loft-grey-headboard', 'Deluxe Panorama Room interior']] },
      { slug: 'executive-suite', name: 'Executive Suite', description: 'A separate lounge with a writing desk, plus an oak-floored bedroom with balcony doors.', maxAdults: 2, maxOccupancy: 3, bed: '1 king + sofa bed', sizeSqm: 75, rate: 115000, inventory: 3, mealPlan: 'Breakfast included', refundable: true, terms: FLEX_7, amenities: [...ROOM_LUX_AMEN, 'Work desk', 'Lounge access'], images: [['suite-turquoise-bedroom', 'Executive Suite bedroom with turquoise headboard']] },
      { slug: 'presidential-suite', name: 'Presidential Suite', description: 'The top floor: two bedrooms, a dining room for eight and a terrace above the pool.', maxAdults: 4, maxOccupancy: 4, bed: '2 kings', sizeSqm: 160, rate: 340000, inventory: 1, mealPlan: 'Breakfast and dinner included', refundable: false, terms: NONREF, amenities: [...ROOM_LUX_AMEN, 'Private terrace', 'Dining room', 'Butler service'], images: [['suite-turquoise-bedroom', 'Presidential Suite master bedroom'], ['restaurant-ornate-dining-room', 'Private dining setting']] },
    ],
  },
  {
    slug: 'aurelia-alta-badia-lodge',
    destination: 'dolomites',
    name: 'Aurelia Alta Badia Lodge',
    tagline: 'Alpine warmth beneath glowing peaks',
    propertyType: 'Boutique hotel',
    stars: 4,
    demoRating: 9.0,
    overview: 'A family-scaled lodge of timber and white plaster, at the end of a quiet lane under the pale cliffs of the Dolomites.',
    description: 'Ski in winter, hike in summer, and return each evening to a warm stube, a crackling fire and a menu that leans on valley farms. Rooms are simple and generous, with larch floors and balconies that catch the last light on the peaks.',
    address: 'Demonstration address — Alta Badia, South Tyrol, Italy',
    lat: 46.5605, lng: 11.8770,
    checkIn: '14:00', checkOut: '10:30',
    cancellationPolicy: 'All rates are flexible until 48 hours before arrival. (Demo policy.)',
    houseRules: ['Ski boots in the ski room, please', 'Quiet hours 22:30–07:00', 'Children welcome; cots on request'],
    nearby: [{ name: 'Gondola base station', distance: '≈ 1.5 km' }, { name: 'Mountain hut trail', distance: '≈ 3 km' }, { name: 'Village centre', distance: '≈ 900 m' }],
    breakfast: true, freeCancellation: true, featured: false,
    amenities: ['wifi', 'restaurant', 'bar', 'ski_storage', 'parking', 'kids_club', 'spa'],
    images: [
      ['dolomites-lodge-exterior', 'A white alpine lodge with glowing windows below golden Dolomite cliffs at sunset'],
      ['room-valley-view-king', 'A warm, simple room with tall windows and a king bed'],
      ['room-loft-grey-headboard', 'A bright room with timber beams and brass pendant lights'],
      ['restaurant-classic-dining-room', 'A cosy dining room with candlelight and set tables'],
    ],
    rooms: [
      { slug: 'standard-mountain-room', name: 'Standard Mountain Room', description: 'Larch floors, down duvets and a window to the peaks. Everything you need after a long day outside.', maxAdults: 2, maxOccupancy: 2, bed: '1 queen or 2 singles', sizeSqm: 24, rate: 26000, inventory: 9, mealPlan: 'Breakfast included', refundable: true, terms: FLEX, amenities: ['Heated floors', 'Rain shower', 'Smart TV'], images: [['room-valley-view-king', 'Standard Mountain Room']] },
      { slug: 'superior-balcony-room', name: 'Superior Room with Balcony', description: 'A south-facing balcony, a sofa by the window and space for a third guest.', maxAdults: 2, maxOccupancy: 3, bed: '1 king + sofa bed', sizeSqm: 30, rate: 32000, inventory: 6, mealPlan: 'Half board (breakfast and dinner)', refundable: true, terms: FLEX, amenities: ['Heated floors', 'Rain shower', 'Balcony', 'Espresso machine'], images: [['room-loft-grey-headboard', 'Superior Room with Balcony']] },
      { slug: 'family-room', name: 'Family Room', description: 'Two connected spaces with a sliding door — parents on one side, children on the other.', maxAdults: 3, maxOccupancy: 4, bed: '1 king + 2 singles', sizeSqm: 45, rate: 43000, inventory: 4, mealPlan: 'Half board (breakfast and dinner)', refundable: true, terms: FLEX, amenities: ['Heated floors', 'Bathtub', 'Balcony', 'Board games'], images: [['room-valley-view-king', 'Family Room main bedroom']] },
    ],
  },
  {
    slug: 'aurelia-brixen-spa-retreat',
    destination: 'dolomites',
    name: 'Aurelia Brixen Spa Retreat',
    tagline: 'A glass pavilion and a lake-still pool',
    propertyType: 'Spa retreat',
    stars: 5,
    demoRating: 9.4,
    overview: 'A contemporary spa retreat of glass and dark stone above the Eisack valley, built around a vast, mirror-flat infinity pool.',
    description: 'Here the programme is rest: saunas with valley views, treatment rooms lined in local wood, white cabanas beside the water, and a light kitchen focused on alpine produce. Rooms are minimal and warm, with deep tubs and terraces.',
    address: 'Demonstration address — above Brixen/Bressanone, South Tyrol, Italy',
    lat: 46.7165, lng: 11.6563,
    checkIn: '15:00', checkOut: '11:00',
    cancellationPolicy: 'Spa retreat rates are non-refundable. Date changes may be requested. (Demo policy.)',
    houseRules: ['Adults only (16+)', 'Spa robes provided; swimwear required in pool areas', 'Phones on silent in the spa'],
    nearby: [{ name: 'Brixen old town and cathedral square', distance: '≈ 7 km' }, { name: 'Plose ski area', distance: '≈ 12 km' }],
    breakfast: true, freeCancellation: false, featured: true,
    amenities: ['wifi', 'pool', 'spa', 'restaurant', 'bar', 'fitness', 'room_service', 'parking', 'ev_charging'],
    images: [
      ['tyrol-infinity-pool-cabana', 'A mirror-still infinity pool with white cabanas, loungers and a glass building above an alpine valley'],
      ['room-valley-view-king', 'A calm, warm room with views over the valley'],
      ['suite-turquoise-bedroom', 'A spacious suite with velvet headboard and balcony doors'],
      ['restaurant-ornate-dining-room', 'A dramatic dining room with a chandelier and carved panels'],
    ],
    rooms: [
      { slug: 'deluxe-spa-room', name: 'Deluxe Spa Room', description: 'Floor-to-ceiling glass, a freestanding tub and direct access to the spa floor.', maxAdults: 2, maxOccupancy: 2, bed: '1 king', sizeSqm: 38, rate: 48000, inventory: 10, mealPlan: 'Breakfast included', refundable: false, terms: NONREF, amenities: [...ROOM_STD_AMEN, 'Freestanding tub', 'Spa access'], images: [['room-valley-view-king', 'Deluxe Spa Room']] },
      { slug: 'junior-suite', name: 'Junior Suite', description: 'A sitting area, a terrace with loungers and a view straight down the valley.', maxAdults: 2, maxOccupancy: 2, bed: '1 king', sizeSqm: 52, rate: 69000, inventory: 5, mealPlan: 'Half board (breakfast and dinner)', refundable: false, terms: NONREF, amenities: [...ROOM_LUX_AMEN, 'Terrace', 'Spa access'], images: [['suite-turquoise-bedroom', 'Junior Suite']] },
      { slug: 'executive-suite', name: 'Executive Suite', description: 'Corner suite with a private sauna and a terrace wrapping two sides of the building.', maxAdults: 2, maxOccupancy: 3, bed: '1 king + daybed', sizeSqm: 80, rate: 98000, inventory: 2, mealPlan: 'Half board (breakfast and dinner)', refundable: false, terms: NONREF, amenities: [...ROOM_LUX_AMEN, 'Private sauna', 'Wraparound terrace'], images: [['suite-turquoise-bedroom', 'Executive Suite bedroom']] },
    ],
  },
  {
    slug: 'aurelia-courmayeur-chalet',
    destination: 'aosta-valley',
    name: 'Aurelia Courmayeur Chalet',
    tagline: 'Stone roofs and firelight below Mont Blanc',
    propertyType: 'Chalet',
    stars: 4,
    demoRating: 8.9,
    overview: 'A cluster of stone-and-timber chalets with slate roofs, lantern-lit paths and the high glaciers in full view.',
    description: 'Walls of river stone and old larch, a library with a fire, and a cellar of Valdostan wines. Close enough to the lifts for first tracks, far enough from the village to hear the stream at night.',
    address: 'Demonstration address — near Courmayeur, Aosta Valley, Italy',
    lat: 45.7969, lng: 6.9719,
    checkIn: '16:00', checkOut: '10:00',
    cancellationPolicy: 'Flexible rates until 48 hours before arrival; family suites until 7 days before arrival. (Demo policy.)',
    houseRules: ['Dogs welcome (one per room, by request)', 'Quiet hours 22:00–07:30', 'Fireplace lit by staff only'],
    nearby: [{ name: 'Skyway cable car base', distance: '≈ 4 km' }, { name: 'Courmayeur village', distance: '≈ 2 km' }, { name: 'Mont Blanc tunnel (to Chamonix)', distance: '≈ 6 km' }],
    breakfast: false, freeCancellation: true, featured: false,
    amenities: ['wifi', 'restaurant', 'bar', 'wine_cellar', 'ski_storage', 'parking', 'pet_friendly', 'spa'],
    images: [
      ['aosta-chalet-exterior', 'Stone chalets with slate roofs and warm lights at dusk, snowy peaks above an autumn valley'],
      ['room-loft-grey-headboard', 'A light room with exposed beams and a tall upholstered headboard'],
      ['restaurant-classic-dining-room', 'A traditional dining room lit by candles and a chandelier'],
      ['room-valley-view-king', 'A warm bedroom with valley views'],
    ],
    rooms: [
      { slug: 'standard-room', name: 'Standard Room', description: 'Beams, wool throws and a deep window ledge. Breakfast can be added at the hotel.', maxAdults: 2, maxOccupancy: 2, bed: '1 queen', sizeSqm: 22, rate: 23000, inventory: 8, mealPlan: 'Room only (breakfast available on site)', refundable: true, terms: FLEX, amenities: ['Rain shower', 'Smart TV', 'Kettle'], images: [['room-loft-grey-headboard', 'Standard Room']] },
      { slug: 'deluxe-room', name: 'Deluxe Room', description: 'More space, a sofa and a balcony facing the glaciers.', maxAdults: 2, maxOccupancy: 3, bed: '1 king + sofa bed', sizeSqm: 32, rate: 31000, inventory: 6, mealPlan: 'Room only (breakfast available on site)', refundable: true, terms: FLEX, amenities: ['Rain shower', 'Balcony', 'Espresso machine', 'Smart TV'], images: [['room-valley-view-king', 'Deluxe Room']] },
      { slug: 'family-suite', name: 'Family Suite', description: 'A chalet-within-the-chalet: two bedrooms, a living room with fireplace and a boot room.', maxAdults: 3, maxOccupancy: 5, bed: '1 king + 3 singles', sizeSqm: 58, rate: 52000, inventory: 2, mealPlan: 'Breakfast included', refundable: true, terms: FLEX_7, amenities: ['Fireplace', 'Two bathrooms', 'Boot room', 'Kitchenette'], images: [['room-loft-grey-headboard', 'Family Suite bedroom']] },
    ],
  },
  {
    slug: 'aurelia-yufu-terrace',
    destination: 'kyushu',
    name: 'Aurelia Yufu Terrace',
    tagline: 'Hot springs and a volcano view',
    propertyType: 'Resort',
    stars: 5,
    demoRating: 9.2,
    overview: 'A terraced resort above a hot-spring town, where the infinity pool looks straight at a twin-peaked volcano.',
    description: 'Mornings bring mist rising from the valley’s springs; afternoons, the pool and private onsen baths; evenings, a seasonal kaiseki-inspired menu. Rooms blend Japanese restraint with generous Western comforts.',
    address: 'Demonstration address — Yufuin, Ōita Prefecture, Kyushu, Japan',
    lat: 33.2652, lng: 131.3570,
    checkIn: '15:00', checkOut: '11:00',
    cancellationPolicy: 'Flexible until 48 hours before arrival on all rooms. (Demo policy.)',
    houseRules: ['Tattoo-friendly private baths available', 'Shoes off in onsen areas', 'Quiet hours 22:00–07:00'],
    nearby: [{ name: 'Lake Kinrin morning mist', distance: '≈ 2 km' }, { name: 'Yufu-dake trailhead', distance: '≈ 5 km' }, { name: 'Yufuin station', distance: '≈ 1.8 km' }],
    breakfast: true, freeCancellation: true, featured: true,
    amenities: ['wifi', 'pool', 'hot_spring', 'spa', 'restaurant', 'bar', 'airport_transfer', 'concierge', 'kids_club'],
    images: [
      ['kyushu-terrace-infinity-pool', 'A blue infinity pool with loungers on a terrace overlooking a green volcano and a town with rising steam'],
      ['room-garden-glasshouse', 'A serene bedroom between glass doors and lush greenery'],
      ['suite-turquoise-bedroom', 'A spacious suite with parquet floors and velvet headboard'],
      ['restaurant-ornate-dining-room', 'An elegant dining room under a crystal chandelier'],
    ],
    rooms: [
      { slug: 'superior-room', name: 'Superior Room', description: 'Quiet, light and well-proportioned, with a yukata, slippers and a garden outlook.', maxAdults: 2, maxOccupancy: 2, bed: '1 king or 2 singles', sizeSqm: 36, rate: 38000, inventory: 12, mealPlan: 'Breakfast included', refundable: true, terms: FLEX, amenities: [...ROOM_STD_AMEN, 'Yukata'], images: [['room-garden-glasshouse', 'Superior Room with garden outlook']] },
      { slug: 'deluxe-mountain-view-room', name: 'Deluxe Mountain View Room', description: 'A private hot-spring bath on the balcony, facing the twin summits.', maxAdults: 2, maxOccupancy: 3, bed: '1 king + futon', sizeSqm: 48, rate: 52000, inventory: 8, mealPlan: 'Breakfast and kaiseki dinner included', refundable: true, terms: FLEX, amenities: [...ROOM_STD_AMEN, 'Private onsen bath', 'Balcony'], images: [['room-garden-glasshouse', 'Deluxe Mountain View Room']] },
      { slug: 'junior-suite', name: 'Junior Suite', description: 'A tatami lounge, a western bedroom and a cypress bath with valley views.', maxAdults: 2, maxOccupancy: 3, bed: '1 king + futon', sizeSqm: 62, rate: 76000, inventory: 4, mealPlan: 'Breakfast and kaiseki dinner included', refundable: true, terms: FLEX, amenities: [...ROOM_LUX_AMEN, 'Cypress bath', 'Tatami lounge'], images: [['suite-turquoise-bedroom', 'Junior Suite bedroom']] },
      { slug: 'family-room', name: 'Family Room', description: 'Two bedrooms and a shared tatami living room — ideal for three generations.', maxAdults: 3, maxOccupancy: 5, bed: '1 king + 3 futons', sizeSqm: 70, rate: 69000, inventory: 3, mealPlan: 'Breakfast included', refundable: true, terms: FLEX, amenities: [...ROOM_STD_AMEN, 'Two bathrooms', 'Tatami living room'], images: [['room-garden-glasshouse', 'Family Room']] },
    ],
  },
];

/** Fictional demo customers. Emails use the reserved example.com domain. */
export const DEMO_CUSTOMERS = [
  { name: 'Emma Lindqvist', email: 'emma.lindqvist@example.com', phone: '+46 70 000 0101' },
  { name: 'Daniel Okafor', email: 'daniel.okafor@example.com', phone: '+44 7700 900101' },
  { name: 'Mei Tanaka', email: 'mei.tanaka@example.com', phone: null },
  { name: 'Lucas Moreau', email: 'lucas.moreau@example.com', phone: '+33 6 00 00 01 01' },
  { name: 'Sofia Ricci', email: 'sofia.ricci@example.com', phone: null },
];
