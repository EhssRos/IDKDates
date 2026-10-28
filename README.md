# IDKDates

You pick the mood. IDKDates picks the place.

A web app today, built so the same core moves into the iOS and Android apps later.

## Getting started

You need [Node.js](https://nodejs.org) 20 or newer.

```
npm install
npm run dev
```

`npm run dev` opens the app at http://localhost:5173 and reloads as you edit.

## Putting it online

```
npm run build
```

This creates a `dist` folder. Drag that whole folder onto [app.netlify.com/drop](https://app.netlify.com/drop), or connect the project on GitHub to Netlify and it builds and publishes on every change (build command `npm run build`, publish directory `dist`).

Once online, the app can be added to a phone’s home screen and opens like an app, including without a connection.

## How the code is organized

```
src/
  core/      The rules of the app: moods and filters, travel time, picking (from the map or
             from your own lists), opening hours, descriptions, the timeline, saved data.
             Plain TypeScript, no browser.
  data/      Everything that talks to the internet: OpenStreetMap (places and addresses),
             Wikipedia, the opening hours engine, and a cache for map results.
  web/       The web app: React components, styles and browser-only glue.
design/      tokens.json from the IDKDates design system.
scripts/     gen-tokens.mjs turns design/tokens.json into src/web/styles/tokens.css.
public/      Icons, the app manifest and the offline worker.
tests/
  unit/      Fast tests for core and data (Vitest, no browser, about 2 seconds).
  e2e/       Tests that click through the built app in a real browser (Playwright).
```

The dependencies only point one way: `web` uses `data` and `core`, `data` uses `core`, and `core` uses nothing. `core` is even type-checked without any browser types (`tsconfig.core.json`), so if something browser-only slips in, the build fails.

**For the native app**, `core` and `data` move over unchanged. The native app only needs its own screens (React Native instead of React DOM), a storage adapter (`KeyValueStore` in `core/storage.ts`, for example with react-native-mmkv) and a map component.

**Switching the place data provider** (say, to a paid places service for a public launch) means writing a new module next to `data/overpass.ts` that returns the same `Place` objects. Nothing in `core` or `web` changes.

**Design changes** start in the design system: copy its `tokens.json` into `design/`, then `npm run tokens`.

## Tests

| Command | What it does |
|---|---|
| `npm test` | Everything: unit tests, then build, then end-to-end tests |
| `npm run test:unit` | Only the fast logic tests |
| `npm run test:watch` | Re-runs unit tests as you edit |
| `npm run test:e2e` | Builds the app, then clicks through it in a browser |
| `npm run test:ui` | Playwright’s visual runner, to watch tests click through the app |
| `npm run typecheck` | Checks types, including that `core` stays browser-free |

Before the first end-to-end run: `npx playwright install chromium`.

The tests never touch the real internet. Every outside service is faked in `tests/e2e/helpers.js`, the clock is fixed to Saturday 24 October 2026, 19:00 in Berlin, and randomness is seeded, so every run gives the same result. `.github/workflows/test.yml` runs everything on GitHub for every change.

## Saved data

Settings, your lists, the timeline and recent map results are stored on the device under keys starting with `idkdates:v1:`. `core/storage.ts` migrates older data on start, including data saved while the app was called Eeny, and repairs damaged values instead of failing.
