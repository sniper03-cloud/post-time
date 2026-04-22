# Post Time — AI Handicapper

A PWA for AI-assisted thoroughbred horse racing handicapping. Currently at v7.1.

## What this app does

User picks a date → tracks racing that day → picks a track → race card → picks a race → loads PP data (program photos or Brisnet CSV) and optionally live tote odds (TwinSpires screenshot) → runs deep-dive AI analysis → sees picks, pace breakdown, trip angles, and overlay detection with Kelly-sized bet suggestions.

## v7.1 — nav & persistence

- App remembers where you were across sessions. View, date, track, race all persist.
- If saved date is in the past, silently snaps to today.
- Saved analysis displays on reopen with timestamp ("3m ago") and Re-run button. Banner goes amber if >3h old or from a different day.
- Browser back button walks up the view tree (tracks → home, races → tracks, entries → races, analysis → entries). Closes open modals before navigating.
- Auto-fetches supporting data (race card, entries) when restoring a deep view on reopen.

Storage keys introduced:
- `postTime_nav` — last nav state
- `analysis:{trackSlug}:{date}:race{N}` — saved analysis with timestamp + conditions/entries/horses/raceCard/track/race for full restoration

## Tech stack

- Single-file HTML, React CDN + Babel standalone, no build step
- PWA with manifest + service worker (cache: `post-time-v7-1`)
- localStorage only
- Direct browser Anthropic API
- Data sources: Horse Racing Nation (entries via web_fetch), user-provided photos/Brisnet CSVs/tote screenshots

## Storage keys

- `postTime_apiKey` — user's Anthropic key
- `postTime_model` — preferred analysis model
- `postTime_scanMode` — last-used PP input mode
- `postTime_bankroll` — Kelly sizing bankroll
- `postTime_nav` — v7.1 nav state
- `pp:{trackSlug}:{date}:race{N}` — PP data
- `odds:{trackSlug}:{date}:race{N}` — live tote data (timestamped)
- `analysis:{trackSlug}:{date}:race{N}` — v7.1 saved analysis

## File structure

```
post-time-v7.1/
├── index.html         ← ~170KB, ~3000 lines
├── manifest.json
├── service-worker.js  ← CACHE_NAME: 'post-time-v7-1'
├── icon-192.png
├── icon-512.png
└── CLAUDE.md
```

## Architecture — 5 views

`home | tracks | races | entries | analysis`

## v7 two-section scan modal (unchanged in v7.1)

Two independent concerns:
1. **Historical PP Data** — 📷 photos (Sonnet vision) or 📊 Brisnet CSV (local parse). `pp:` storage.
2. **Live Tote Odds** — 🎰 TwinSpires screenshot (Sonnet vision). `odds:` storage, timestamped.

Collapsible accordion UI; app expands whichever section is missing data.

## Brisnet parser (unchanged)

Spec-verified against Brisnet Single File format. Tested end-to-end against real KEE0411.csv: 11 races, 115 horses, 0 parse errors.

Key fields: name=45, sire=52, dam=54, jockey=33, trainer=28, programNum=43, ML=44, runStyle=210, quirin=211, primePower=251. PP arrays start at 256. Trip comments at 396 (PP[0]). Best BRIS speeds 1178-1181 + 1328-1331. Trainer angles 1337-1366. Full map in `BRIS_FIELD` constant.

`yardsToDistance` handles 4F-2mi in 1/8 and 1/16 increments including the 1870y=1 1/16mi edge case.

## Value School (v7, unchanged)

### Prompt

Synthesis outputs `fieldProbabilities: [{ postPosition, name, winProbability }]` that sum to ~1.0. Calibration guidance: standouts 40-50%, chalks 25-35%, contenders 10-20%, longshots 5-10%, bombs 2-4%.

### Overlay math

```
toteImplied = 1 / (decimalOdds + 1)
toteNorm = normalize(tote)    // strip takeout (~15-25%)
aiNorm = normalize(ai)         // strip calibration drift
ratio = aiNorm / toteNorm

>=2.0  → BIG (rose)
>=1.5  → Meaningful (amber)
>=1.25 → Small (light amber)
<=0.75 → Underlay (grey)
```

### Kelly sizing

Quarter-Kelly (0.25x). Bankroll persisted in `postTime_bankroll`.

```
fullKelly = (p*(b+1) - 1) / b
betSize = bankroll * fullKelly * 0.25
```

## Analysis flow

N+1 API calls: per-horse research (parallel, concurrency 3) + synthesis.

Synthesis includes 9 steps ending in `fieldProbabilities` distribution across all horses.

## Models

```js
MODELS = {
  haiku:  'claude-haiku-4-5-20251001',    // data extraction
  sonnet: 'claude-sonnet-4-5',            // vision + default analysis
  opus:   'claude-opus-4-7'               // optional deep analysis
}
```

## Roadmap

Done:
- v1-v4: initial build through deep-dive
- v5: photo OCR + pace-school + trip flagging
- v6: Brisnet parser, bulk import
- v7: Two-section scan modal, Value School (overlays, Kelly)
- **v7.1: Nav state persistence, saved analysis with age+Re-run, back-button history integration**

Next (not committed):
- Multi-model (GPT, Gemini) — discussed in chat, deferred until post-Derby
- Scoreboard (user picks vs AI)
- Cross-device sync
- Odds history (multiple snapshots per race)

## Deployment

GitHub Pages:
1. Push to public repo
2. Settings → Pages → Deploy from `main` branch → root
3. `https://username.github.io/repo/`

Updates: commit + push, auto-redeploys in ~60s. Bump `CACHE_NAME` in service-worker.js on every version.

## Local dev

```bash
cd post-time-v7.1
python3 -m http.server 8000
```

## Pre-Oaks test plan

1. Deploy v7.1 to GitHub Pages
2. Buy Brisnet Single PP for a weekend Keeneland card
3. Upload, bulk import whole card
4. Pick a race, run deep-dive
5. Screenshot TwinSpires Advanced, upload to odds section
6. Verify overlay panel appears with Kelly sizing
7. **v7.1 test: close app, reopen. Should land back on analysis screen with timestamp banner.**
8. **v7.1 test: press back button. Should walk up to entries, not exit.**

## Common issues

- `fieldProbabilities missing` → old analysis from pre-v7. Hit Re-run.
- Overlays all "Fair price" → AI probs too flat or market agrees. Both legit.
- Kelly zero everywhere → no edge exists; distribution doesn't exceed tote.
- Odds scan weird names → cropped multiple races. Re-snap tighter.
- Stale analysis banner after reopen → expected; hit Re-run.
- Back button exits on home screen → expected; standard PWA behavior at root.

## When adding features

- Use `callClaude()` helper
- Haiku for extraction, selectedModel for analysis, Sonnet for vision
- New views: state machine + breadcrumb + goX helper + history integration
- New PP fields: BRIS_FIELD + parseBrisnetRow + photo prompt + ppContext
- Always return JSON from prompts; `callClaude` extracts first `{` to last `}`
- **Bump CACHE_NAME on every ship**
- Test parser in Node against KEE0411.csv before shipping

## User context

- Louisville, KY (Churchill home track)
- Attending Oaks May 1, Derby May 2, 2026
- MSP tech background; comfortable with code
- Uses Claude Code locally
- Philosophy: rigorous handicapping, not gambling aid
- Uses TwinSpires for bet placement
- Hybridizes Speed (Beyer) + Pace (Brohamer) + Trip (Davidowitz/Ragozin) + Value (Crist/Benter)

## Hosting

GitHub Pages, user's own repo. Public, HTTPS. BYO API keys for friends.
