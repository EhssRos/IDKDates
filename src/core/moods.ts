import type { MoodId } from "./types";

export interface Mood { label: string; selectors: string[] }

/** The moods and the OpenStreetMap features each one draws from. */
export const MOODS: Record<MoodId, Mood> = {
  food: { label: "Food", selectors: ['["amenity"~"^(restaurant|fast_food|ice_cream)$"]'] },
  drinks: { label: "Drinks & coffee", selectors: ['["amenity"~"^(cafe|bar|pub|biergarten)$"]'] },
  clubs: { label: "Clubs", selectors: ['["amenity"~"^(nightclub|music_venue)$"]'] },
  action: { label: "Action", selectors: [
    '["leisure"~"^(bowling_alley|escape_game|amusement_arcade|miniature_golf|trampoline_park|water_park|ice_rink)$"]',
    '["amenity"="cinema"]',
    '["tourism"="theme_park"]',
    '["sport"~"^(climbing|karting|laser_tag|paintball|bowling|10pin)$"]'
  ] },
  nature: { label: "Nature", selectors: [
    '["leisure"~"^(park|nature_reserve|garden)$"]',
    '["tourism"~"^(viewpoint|picnic_site)$"]',
    '["natural"~"^(peak|beach)$"]',
    '["natural"="water"]["water"~"^(lake|reservoir)$"]',
    '["waterway"="waterfall"]'
  ] },
  culture: { label: "Culture", selectors: [
    '["tourism"~"^(museum|gallery|zoo|aquarium)$"]',
    '["amenity"~"^(theatre|arts_centre)$"]',
    '["historic"~"^(castle|ruins|monument|fort|city_gate|manor)$"]'
  ] }
};
export const MOOD_IDS = Object.keys(MOODS) as MoodId[];

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

/** The playful “anything specific?” follow-up per mood. */
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
    bowling: { label: "Bowling", q: ['["leisure"="bowling_alley"]', '["sport"~"^(bowling|10pin|9pin)$"]'] },
    escape: { label: "Escape room", q: ['["leisure"="escape_game"]'] },
    climb: { label: "Climbing", q: ['["sport"~"^(climbing|bouldering)$"]'] },
    minigolf: { label: "Mini golf", q: ['["leisure"="miniature_golf"]'] },
    cinema: { label: "Cinema", q: ['["amenity"="cinema"]'] },
    arcade: { label: "Arcade", q: ['["leisure"="amusement_arcade"]'] },
    karting: { label: "Go-karts", q: ['["sport"="karting"]'] },
    jump: { label: "Trampolines", q: ['["leisure"="trampoline_park"]'] },
    icewater: { label: "Ice & water", q: ['["leisure"~"^(ice_rink|water_park)$"]'] },
    theme: { label: "Theme park", q: ['["tourism"="theme_park"]'] },
    tag: { label: "Laser tag & paintball", q: ['["sport"~"^(laser_tag|paintball)$"]'] }
  } },
  nature: { ask: "What kind of outside?", options: {
    parks: { label: "Parks & gardens", q: ['["leisure"~"^(park|garden)$"]'] },
    water: { label: "By the water", q: ['["natural"="beach"]', '["natural"="water"]["water"~"^(lake|reservoir)$"]', '["waterway"="waterfall"]'] },
    views: { label: "A view", q: ['["tourism"="viewpoint"]', '["natural"="peak"]'] },
    wild: { label: "Wild", q: ['["leisure"="nature_reserve"]'] },
    picnic: { label: "Picnic spot", q: ['["tourism"="picnic_site"]'] }
  } },
  culture: { ask: "Into anything in particular?", options: {
    museum: { label: "Museums", q: ['["tourism"="museum"]'] },
    art: { label: "Art", q: ['["tourism"="gallery"]', '["amenity"="arts_centre"]'] },
    theatre: { label: "Theatre", q: ['["amenity"="theatre"]'] },
    history: { label: "History", q: ['["historic"~"^(castle|ruins|monument|fort|city_gate|manor)$"]'] },
    animals: { label: "Animals", q: ['["tourism"~"^(zoo|aquarium)$"]'] },
    free: { label: "Free entry", group: "free", q: ['["tourism"~"^(museum|gallery|zoo|aquarium)$"]["fee"="no"]', '["amenity"~"^(theatre|arts_centre)$"]["fee"="no"]'] }
  } }
};
