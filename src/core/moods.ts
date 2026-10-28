import type { MoodId } from "./types";

/*
 * What each mood draws from OpenStreetMap, based on how places are actually tagged
 * (see the OpenStreetMap wiki for amenity=*, leisure=*, tourism=*, historic=*, natural=*).
 * Very small or minor features that technically match (a backyard pond, a pocket park,
 * a memorial plaque) are weeded out afterwards by core/quality.ts.
 */

export interface RefineOption {
  label: string;
  /** Options in the same group widen the choice; different groups narrow it. Defaults to "kind". */
  group?: string;
  /** OpenStreetMap selector chains; a place matches if any chain matches. */
  q: string[];
}
export interface Refine { ask: string; options: Record<string, RefineOption> }

const cuisine = (list: string, amenity = "restaurant|fast_food") =>
  [`["amenity"~"^(${amenity})$"]["cuisine"~"(^|;) *(${list}) *(;|$)",i]`];
const sport = (list: string) => `["sport"~"(^|;) *(${list}) *(;|$)"]`;

export const REFINE: Record<MoodId, Refine> = {
  food: { ask: "Craving anything?", options: {
    asian: { label: "Asian", q: cuisine("asian|chinese|japanese|sushi|ramen|thai|vietnamese|korean|noodle|dim_sum|indonesian|malaysian|taiwanese|filipino|pho") },
    indian: { label: "Indian", q: cuisine("indian|nepalese|pakistani|sri_lankan|bangladeshi|himalayan") },
    italian: { label: "Italian", q: cuisine("italian|pasta") },
    pizza: { label: "Pizza", q: cuisine("pizza") },
    burger: { label: "Burgers", q: cuisine("burger|american") },
    mexican: { label: "Mexican & Latin", q: cuisine("mexican|tex-mex|latin_american|burrito|tacos|peruvian|brazilian|argentinian") },
    mideast: { label: "Middle Eastern", q: cuisine("lebanese|turkish|kebab|falafel|syrian|persian|arab|middle_eastern|israeli") },
    med: { label: "Greek & Spanish", q: cuisine("greek|spanish|tapas|portuguese|mediterranean") },
    veggie: { label: "Veggie & vegan", group: "diet", q: [
      '["amenity"~"^(restaurant|fast_food)$"]["diet:vegan"~"^(yes|only)$"]',
      '["amenity"~"^(restaurant|fast_food)$"]["diet:vegetarian"~"^(yes|only)$"]',
      ...cuisine("vegan|vegetarian")
    ] },
    sweet: { label: "Something sweet", q: ['["amenity"="ice_cream"]', ...cuisine("ice_cream|cake|dessert|crepe|waffle|donut|frozen_yogurt", "restaurant|fast_food|cafe")] },
    quick: { label: "Quick & cheap", group: "style", q: ['["amenity"="fast_food"]'] }
  } },
  drinks: { ask: "What are we sipping?", options: {
    coffee: { label: "Coffee", q: ['["amenity"="cafe"]'] },
    bar: { label: "Bars", q: ['["amenity"="bar"]'] },
    pub: { label: "Pubs", q: ['["amenity"="pub"]'] },
    cocktails: { label: "Cocktails", q: ['["amenity"~"^(bar|pub)$"]["cocktails"="yes"]', '["amenity"~"^(bar|pub)$"]["drink:cocktail"~"^(yes|served)$"]'] },
    garden: { label: "Beer garden", q: ['["amenity"="biergarten"]', '["amenity"~"^(bar|pub|restaurant)$"]["beer_garden"="yes"]'] },
    outside: { label: "Sit outside", group: "outside", q: ['["amenity"~"^(cafe|bar|pub)$"]["outdoor_seating"="yes"]', '["amenity"="biergarten"]'] }
  } },
  clubs: { ask: "What kind of night?", options: {
    dance: { label: "Dancing", q: ['["amenity"="nightclub"]'] },
    live: { label: "Live music", q: ['["amenity"="music_venue"]', '["amenity"~"^(bar|pub|nightclub)$"]["live_music"="yes"]'] },
    queer: { label: "LGBTQ+", group: "queer", q: ['["amenity"~"^(nightclub|bar|pub)$"]["lgbtq"~"^(primary|only|welcome|yes)$"]'] }
  } },
  action: { ask: "What gets you going?", options: {
    bowling: { label: "Bowling", q: ['["leisure"="bowling_alley"]', `["leisure"="sports_centre"]${sport("10pin|9pin|bowling")}`] },
    escape: { label: "Escape room", q: ['["leisure"="escape_game"]'] },
    climb: { label: "Climbing", q: [`["leisure"="sports_centre"]${sport("climbing|bouldering")}`] },
    minigolf: { label: "Mini golf", q: ['["leisure"="miniature_golf"]'] },
    cinema: { label: "Cinema", q: ['["amenity"="cinema"]'] },
    arcade: { label: "Arcade", q: ['["leisure"="amusement_arcade"]'] },
    karting: { label: "Go-karts", q: ['["leisure"~"^(track|sports_centre)$"]["sport"="karting"]'] },
    jump: { label: "Trampolines", q: ['["leisure"="trampoline_park"]'] },
    icewater: { label: "Swimming & ice", q: ['["leisure"~"^(ice_rink|water_park)$"]', '["amenity"="public_bath"]', `["leisure"="sports_centre"]${sport("swimming")}`] },
    theme: { label: "Theme park", q: ['["tourism"="theme_park"]'] },
    tag: { label: "Laser tag & paintball", q: [`["leisure"~"^(sports_centre|pitch)$"]${sport("laser_tag|paintball")}`] }
  } },
  nature: { ask: "What kind of outside?", options: {
    parks: { label: "Parks & gardens", q: ['["leisure"="park"]', '["leisure"="garden"]["garden:type"!~"^(residential|private|roof_garden|community)$"]'] },
    woods: { label: "Woods", q: ['["landuse"="forest"]', '["natural"="wood"]'] },
    water: { label: "By the water", q: [
      '["natural"="beach"]',
      // Lakes are often tagged without a water=* type; the size check keeps out ponds.
      '["natural"="water"]["water"!~"^(pond|basin|wastewater|reflecting_pool|moat|canal|river|stream|ditch|fishpond|lock|stream_pool)$"]',
      '["leisure"="swimming_area"]',
      '["waterway"="waterfall"]'
    ] },
    views: { label: "A view", q: ['["tourism"="viewpoint"]', '["natural"~"^(peak|hill)$"]'] },
    // Nature reserves are mostly tagged leisure=nature_reserve. Protected areas also include water and soil protection
    // zones and huge landscape areas, so only the visitable nature classes count (not 1a, strict reserves closed to visitors).
    wild: { label: "Nature reserves", q: [
      '["leisure"="nature_reserve"]',
      '["boundary"="national_park"]',
      '["boundary"="protected_area"]["protect_class"~"^(1b|2|3|4|7)$"]'
    ] },
    picnic: { label: "Picnic spot", q: ['["tourism"="picnic_site"]'] }
  } },
  culture: { ask: "Into anything in particular?", options: {
    museum: { label: "Museums", q: ['["tourism"="museum"]'] },
    art: { label: "Art", q: ['["tourism"="gallery"]', '["amenity"="arts_centre"]'] },
    stage: { label: "Theatre & concerts", q: ['["amenity"~"^(theatre|concert_hall)$"]'] },
    history: { label: "History", q: [
      '["historic"~"^(castle|palace|fort|manor|monastery|ruins|archaeological_site|city_gate|citywalls|castle_wall|tower|battlefield|aqueduct|monument)$"]',
      // Common historic features are only worth a trip when notable enough to have a Wikidata entry.
      '["historic"~"^(memorial|building|church|ship|aircraft|locomotive|tank|wreck|mine)$"]["wikidata"]',
      '["tourism"="attraction"]["historic"]',
      '["tourism"="museum"]["museum"~"^(history|military|archaeological|local|open_air)$"]'
    ] },
    sights: { label: "Famous sights", q: ['["tourism"="attraction"]["wikidata"]'] },
    animals: { label: "Animals", q: ['["tourism"~"^(zoo|aquarium)$"]'] },
    free: { label: "Free entry", group: "free", q: ['["tourism"~"^(museum|gallery|zoo|aquarium)$"]["fee"="no"]', '["amenity"~"^(theatre|arts_centre)$"]["fee"="no"]'] }
  } }
};

export interface Mood {
  label: string;
  selectors: string[];
  /** Also ask for relations: big parks, lakes, forests and castles are often mapped that way. */
  relations?: boolean;
}

/** Everything a mood covers: for some moods that’s exactly the union of its “anything specific?” options. */
const all = (m: MoodId, except: string[] = []) =>
  [...new Set(Object.entries(REFINE[m].options).filter(([k]) => !except.includes(k)).flatMap(([, o]) => o.q))];

/** The moods and the OpenStreetMap features each one draws from. */
export const MOODS: Record<MoodId, Mood> = {
  food: { label: "Food", selectors: ['["amenity"~"^(restaurant|fast_food|ice_cream|food_court)$"]'] },
  drinks: { label: "Drinks & coffee", selectors: ['["amenity"~"^(cafe|bar|pub|biergarten)$"]'] },
  clubs: { label: "Clubs", selectors: ['["amenity"~"^(nightclub|music_venue)$"]'] },
  action: { label: "Action", selectors: all("action") },
  nature: { label: "Nature", selectors: all("nature"), relations: true },
  culture: { label: "Culture", selectors: all("culture", ["free"]), relations: true }
};
export const MOOD_IDS = Object.keys(MOODS) as MoodId[];
