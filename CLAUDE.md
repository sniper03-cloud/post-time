# Post Time — AI Handicapper

A PWA for AI-assisted thoroughbred horse racing handicapping. Built iteratively through conversations with Claude in chat. Currently at v6.

## What this app does

User picks a date → sees all US thoroughbred tracks racing that day → picks a track → sees race card → picks a race → gets entries auto-populated + live track conditions + PP data from either scanned program photos OR uploaded Brisnet data files → runs a deep-dive AI analysis that researches each horse individually and synthesizes picks using pace-school methodology with trip-bad-luck flagging.

Target use: user goes to Kentucky Oaks (May 1, 2026) and Derby (May 2) and wants to race his own handicap against the AI's. Broader use: any US thoroughbred race card.

## Tech stack

- **Single-file HTML app** — React via CDN (18.3.1), Babel standalone for JSX. No build step.
- **PWA** — manifest.json + service-worker.js. Installable to home screen.
- **Storage** — localStorage only. Keys: `postTime_apiKey`, `postTime_model`, `postTime_scanMode`, `pp:{trackSlug}:{date}:race{N}`.
- **Anthropic API** — direct browser calls with `anthropic-dangerous-direct-browser-access: true`. User-provided key.
- **Data sources**:
  - Horse Racing Nation for schedules/entries (URL-based fetching via web_fetch)
  - Photos or Brisnet files for PP data (user-provided)
- **Deployment** — zip, drop on Netlify or push to GitHub Pages.

## File structure

```
post-time-v6/
├── index.html         ← entire app (~82KB, 2000+ lines)
├── manifest.json
├── service-worker.js  ← cache name: 'post-time-v6'
├── icon-192.png
├── icon-512.png
└── CLAUDE.md          ← this file
```

**When shipping changes:** bump `CACHE_NAME` in service-worker.js so installed PWAs refresh.

## Architecture — 5 views

State machine via `view` state: `home | tracks | races | entries | analysis`

1. **home** — date picker + API key input if missing
2. **tracks** — list of tracks racing that date (fetched from HRN)
3. **races** — full race card, each race has Load button (opens scan modal)
4. **entries** — editable field, conditions, model picker, PP badges
5. **analysis** — pace breakdown, trip angles, picks, exotics, horse-by-horse

## v6 NEW: Dual PP Data Input (Photo OR Brisnet file)

The scan modal has two modes via a toggle:

### Photo mode (📷)
- Multi-image upload (camera or gallery)
- Sonnet 4.5 vision extracts PP data → structured JSON
- Saves with `source: 'photo'` tag
- Cost: ~$0.05-$0.15 per page

### Brisnet file mode (📊)
- File picker for `.csv`, `.drf`, `.txt` (Brisnet's Single PP format)
- **Parsed entirely client-side** — no API call
- One file typically contains the whole card
- Import scope toggle: "Whole card" vs "Just this race"
- Saves with `source: 'brisnet'` tag
- Cost: free (just parsing)

Last-used mode is remembered in `localStorage.postTime_scanMode`.

## Brisnet parser (in index.html)

The parser lives inline. Key functions:

- `parseCSVLine(line)` — CSV parser handling quoted commas
- `getField(row, fieldNum)` — 1-indexed field access, null if empty
- `getNumField(row, fieldNum)` — parsed number or null
- `yardsToDistance(yards)` — converts to "6 Furlongs" etc
- `surfaceCodeToName(code)` — D→Dirt, T→Turf, etc.
- `raceTypeToName(code)` — G1→"Grade I Stakes", etc.
- `parseBrisnetRow(row)` — one horse row → JSON matching app schema
- `parseBrisnetFile(text)` — whole file → `{ byRace, trackCode, parseErrors }`

### BRIS_FIELD map — SPEC-VERIFIED

Full field list verified against Brisnet's official "Single File" data structure document (uploaded from support.brisnet.com). The map in `index.html` is authoritative.

Key reference points:

- **Today's race (1-25):** track=1, date=2, raceNum=3, postPosition=4, distanceYards=6, surface=7, raceType=9, purse=12, claimingPrice=13, trackRecord=15, raceConditions=16, breedType=23, allWeather=25
- **Connections (28-44):** currentTrainer=28, trainer meet stats 29-32, currentJockey=33, jockey meet stats 35-38, owner=39, programNumber=43, **morningLineOdds=44** (was 61 in older specs — verify if importing old files)
- **Horse ID (45-58):** horseName=45, yearOfBirth=46, foalMonth=47, sex=49, horseColor=50, weight=51, sire=52, sireSire=53, dam=54, damSire=55, breeder=56, stateBred=57, programPostPosition=58
- **Horse stats (62-101):** medication=62, equipmentChange=64, distance record 65-69, track record 70-74, turf record 75-79, wet record 80-84, current year 85-90 (85 is year), previous year 91-96, **lifetime 97-101** (not 95-99)
- **Workouts (102-209):** 12 slots each: date=102, time=114 (negative=bullet), track=126, distance=138, condition=150, description=162, trackType=174, numWorks=186, rank=198
- **Pace critical (210-224):** **brisRunStyle=210** (E/EP/P/S), **quirinSpeedPoints=211** (0-8), pace pars 214-218, T/J combo 365d 219-223, daysSinceLastRace=224
- **Flagship:** **BRIS Prime Power = field 251**
- **PP arrays (256-1145):** ppDate=256, ppBrisTrackCode=286, ppRaceNum=296, ppDistanceYards=316, ppSurface=326, ppPostPosition=356, **ppTripComment=396** (NOT 696 — that's BRIS Race Shape), ppWeight=506, ppOdds=516, ppCallPositions=566-615, **ppBrisSpeedRating=846** (this is the BRIS-speed Beyer equivalent), ppFinalTime=1036, ppTrainer=1056, ppJockey=1066, ppRaceType=1086
- **Beaten lengths:** start=636/646 (margin/only), 1st=656/666, 2nd=676/686, stretch=716/726, finish=736/746 (for winner, 736 = winning margin, 746 = 0)
- **Trainer angle categories (1337-1366):** 6 pre-computed angles per horse, each with label/starts/win%/itm%/ROI — these are GOLD for the analysis prompt
- **Best BRIS speeds:** 1178 (fast), 1179 (turf), 1180 (off), 1181 (distance), 1328 (life), 1329 (year), 1331 (this track)

### Parser verified

Tested against a synthetic row in Node.js. All key fields extract correctly including BRIS Run Style, Quirin Speed Points, Prime Power, pedigree, medication decoding (0-9 numeric → "L"/"B"/"L1" etc), running line construction from call positions + beaten lengths, bullet workout detection from negative times, and the 10-deep past performance array.

### ⚠ Remaining caveats

- Parser handles empty CSV fields correctly (returns null)
- Medication code 9 = "info unavailable" treated as null
- Two-digit year format: `<50` → 2000s, `>=50` → 1900s
- If a real-world file produces garbage, run `parseBrisnetFile(text)` and inspect `parseErrors` array for hints

## Analysis flow (runAnalysis)

Unchanged from v5 except the PP context block now:
- Distinguishes `source: 'brisnet'` from `source: 'photo'` in prompt
- Includes BRIS Prime Power, best speed figures, pedigree, medication, equipment change
- Adds explicit analysis signals the model should look for (trip comments, Prime Power, speed trajectory, workout pattern, layoff angle)

Still N+1 calls per race: per-horse research (parallel, concurrency 3) + synthesis with 8-step pace methodology.

## Models

```js
MODELS = {
  haiku:  { id: 'claude-haiku-4-5-20251001' },
  sonnet: { id: 'claude-sonnet-4-5' },
  opus:   { id: 'claude-opus-4-7' }
}
```

- Data extraction (tracks, race card, entries, conditions): always Haiku
- OCR/vision (photo scans): always Sonnet
- Deep-dive analysis: user-selected (default Sonnet)
- Brisnet parsing: no API call — runs locally

## Roadmap

**Done through v6:**
- v1–v2: initial build
- v3: flipped to date-first HRN architecture
- v4: model picker, live conditions, deep-dive
- v5: photo OCR + pace-school methodology + trip flagging
- v6: **dual input (photo OR Brisnet file), Brisnet parser, bulk card import, source-tagged storage, source badges, updated analysis prompts**

**Next agreed feature — Value School (v7):**

The Crist/Benter move. Right now the app picks winners; Value School finds overlays (horses where AI probability > tote implied probability).

Spec for the build:

1. **New view or modal after analysis completes** — "Enter Live Odds" screen. For each horse in the field, user types in the current tote odds (they can copy from TwinSpires, NYRA Bets, or the track's tote board). App parses flexible formats: "5-2", "2.5", "5/2", "12-1" all work.

2. **Compute implied probabilities on both sides:**
   - Tote implied probability = `1 / (odds + 1)` where odds is decimal. For 5-2, that's `1 / 3.5 = 0.286`.
   - AI implied probability — derive from the existing `confidence` field (1-10). Normalize across field: `horse.confidence / sum(all confidences)`. This is a rough proxy; we can tune with a softmax or calibration curve later.
   - **Alternative:** have the analysis prompt explicitly output `impliedProbability` per horse (0-1 that sum to ~1.0) instead of a 1-10 confidence. Better approach — do this at the prompt level, not as a derived calculation.

3. **Overlay detection** — flag horses where AI probability ≥ 1.25× tote probability. Tier the flags:
   - 1.25-1.5× = "Small overlay" (yellow)
   - 1.5-2.0× = "Meaningful overlay" (amber)
   - 2.0×+ = "Big overlay" (rose) — rare, investigate why the market disagrees
   - Underlays (AI prob < tote prob) worth noting too so user knows what NOT to bet.

4. **Optional Kelly sizing** — for each overlay, compute `edge / odds` as bet fraction of bankroll. Default to fractional Kelly (0.25×) because full Kelly is too aggressive for horse betting. UI: user enters bankroll once, app shows "$8 to win" type sizing for each overlay.

5. **Overlay summary card on analysis screen** — add a section above the picks showing:
   - Biggest overlay(s)
   - Any underlays in the AI's top 3 (that's a warning sign)
   - Net expected value of a straight-bet strategy on overlays only

**UI placement:** Add an "Enter Odds" button on the analysis screen. Tapping reveals an inline list of the field with odds input fields. After entering, the screen re-renders with overlay flags inline and a new summary card.

**Prompt change needed:** Update the per-horse research prompt to include `impliedProbability: 0.12` instead of (or alongside) `confidence: 7`. Update the synthesis prompt to also output per-horse implied probabilities that sum to ~1.0. Instruct the model to calibrate — morning-line favorites should be in the 25-35% range, longshots 3-8%, don't output a 10-horse race where every horse is 15%.

**Acceptance test:** Run the 2024 Kentucky Oaks through the app, enter the actual closing tote odds, verify the app correctly flagged Thorpedo Anna (if she was an overlay) or correctly identified whatever overlays the pros found that day.

**Not committed:**
- Style Selector (Beyer/Brohamer/Crist/Davidowitz school modes) — probably post-Derby
- Scoreboard (track user picks vs AI picks across a day)
- Cross-device sync (currently localStorage-only)
- Fuzzy horse name matching (currently exact case-insensitive; names occasionally mismatch between HRN entries and Brisnet/photo PP data)
- Multi-file Brisnet format support (we only support Single File today)
- Proxy backend so friends don't need their own API keys (has real cost implications — see "Hosting & sharing" section)

## Deployment

### GitHub Pages (user's preferred method)
1. Push folder to a public repo
2. Settings → Pages → Deploy from `main` branch → root
3. Live at `https://username.github.io/repo/`
4. Updates: commit + push, auto-redeploys in ~60s

### Netlify Drop
1. app.netlify.com/drop → drag folder

## Local dev

```bash
cd post-time-v6
python3 -m http.server 8000
# localhost:8000 works for PWA install on desktop
# For phone testing: ngrok http 8000
```

## Pre-Oaks test plan (before May 1, 2026)

Before trusting this on Oaks Day, the plan was:

1. **Deploy v6 to GitHub Pages** — confirm installs cleanly on phone, PWA works.
2. **Buy one Brisnet Single PP file for a live Keeneland or CD card** (~$3 from brisnet.com → PP Data → Single).
3. **Run end-to-end on that card:**
   - Navigate to the track/date
   - Upload the Brisnet file, choose "Whole card" scope
   - Verify all races show 📊 badges
   - Open a meaningful race, verify horse names populate correctly
   - Run deep-dive analysis, confirm Prime Power and BRIS Run Style show up in the analysis output
4. **If parser breaks anywhere:** export the file, check `parseErrors` in the preview, note which fields came back garbled.
5. **Also verify photo mode still works** — take clean photos of one race's PPs, confirm OCR extracts.

### Common issues to check first if something breaks

- **"Horse name is empty"** — field 45 must match horseName. If older Brisnet file, field 44 might be name instead.
- **"Beyer figures all null"** — check that `ppBrisSpeedRating: 846` is correct for the file version. If all PPs have null Beyers, the 846 mapping is likely off by a position.
- **"Trip comments all empty"** — Brisnet may not ship trip comments in lower-tier products. This is a product-level issue, not a parser bug.
- **"App crashes on parse"** — open browser DevTools console. The error likely points to a field access on undefined; usually means the file has fewer columns than expected (maybe a Multi File format instead of Single).
- **"PP data saved but analysis ignores it"** — check that horse name in the HRN entries matches horse name in the Brisnet file. Match is case-insensitive exact. If Brisnet has "Thorpedo Anna" and HRN has "Thorpedo Anna (USA)", they won't match. User can edit name in the field input to fix.

## When adding features

- Use `callClaude()` helper
- For data parsing use `MODELS.haiku.id`, analysis uses `selectedModel`, vision uses Sonnet
- For new views: add to state machine + breadcrumb + goXView helper
- For new PP fields: add to BRIS_FIELD + parseBrisnetRow + photo prompt + analysis ppContext
- Always return JSON from prompts; `callClaude` extracts first `{` to last `}`
- Bump `CACHE_NAME` when shipping
- Test the parser at the Node level before shipping by extracting the module — the app's evolution is now at the point where blind UI-only testing misses real bugs

## User context

- Based in Louisville, KY (Churchill is home track)
- Attending Oaks May 1, Derby May 2, 2026
- MSP tech background; comfortable with code and Python
- Uses Claude Code for local development
- Philosophy preference: rigorous handicapping, not gambling aid. Wants to race his own picks against the AI's picks.
- Engaged with the handicapping tradition — we talked through Beyer, Brohamer, Davidowitz, Ragozin, Crist, Benter. App currently hybrids Speed + Pace + Trip schools; Value School is next.

## Hosting & sharing model

- **Hosting:** GitHub Pages, user's own account. Public repo, deployed from `main` branch root.
- **HTTPS:** GitHub Pages enforces HTTPS by default; no configuration needed for PWA install.
- **Friend sharing:** BYO API keys — each friend creates their own Anthropic account, adds $10-20 credit, pastes their key into the app. No proxy, no shared secret, no server costs on user's side.
- **Friend onboarding doc:** `post-time-quick-start.md` — short enough to text. Covers install, API key setup, per-race cost, and the "race your picks against AI" framing.

## What's driven the roadmap (feedback loop)

- **Friend feedback drove v6.** A friend pushed back on OCR accuracy concerns for small program text and asked about Brisnet file upload. That's why we built dual-mode input with Brisnet support before Value School.
- **Lesson:** For user-facing tools, real user feedback beats internal roadmap guesses. Take friend testing seriously; it points at real friction.
