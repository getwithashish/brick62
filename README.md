# BRICK62 ⚡

**BRICK62** is a fast-paced, colorful, hyper-kinetic breakout/brick-breaker game built with vanilla TypeScript and HTML5 Canvas (2D). Designed mobile-first for portrait screens and centered with high-tech sideboards on desktop displays.

---

## 🎮 Core Features

- **Hyper-Kinetic Gameplay**: Short, punchy attempts (30–90 seconds), one-tap instant retries, combo multipliers, screen shake, hit-stop, and generative procedural audio.
- **30 Stages Across 6 Worlds**:
  1. **CORE (1–5)**: Foundation mechanics, multi-ball training, pentatonic melodies (*C Major*).
  2. **EMBER (6–10)**: Tough reinforced bricks (2–3 hits), volatile explosive chain-reaction bricks (*E Phrygian*).
  3. **FROST (11–15)**: Freeze nodes that crystallize surrounding bricks to shatter on impact (*A Dorian*).
  4. **GRAVITY (16–20)**: Cosmic micro-singularities and black holes bending ball paths (*D Minor*).
  5. **GLITCH (21–25)**: Teleporting bricks, decoy hologram bricks, RGB-split visuals (*F# Lydian*).
  6. **VOID (26–30)**: Dimension where all mechanics collide, culminating in the 3-phase Void Architect boss (*B Locrian*).
- **6 Epic Boss Stages** (Stages 5, 10, 15, 20, 25, 30): Rotating energy shield rings, moving weak points, and energy hazard barrages.
- **Endless Mode**: Procedurally generated infinite waves with scaling difficulty and high-score leaderboards.
- **Daily Challenge**: Seeded challenge daily with gameplay modifiers (*Firestorm*, *Hyper Velocity*, *Multi-Glitch*, etc.) and streak multipliers.
- **Deep Economy & Progression**:
  - Currency (**Shards**) earned by breaking bricks, earning stars, completing daily streaks, and beating bosses.
  - Permanent Tech Lab upgrades: *Paddle Expander*, *Combo Buffer*, *Twin Launch*, *Drop Catalyzer*, *Floor Barrier*, *Magnet Catch*.
  - Cyber Cosmetics: Paddle skins, photon core ball trails, and UI themes.
- **Deterministic Simulation Core**: Fixed-timestep sub-stepping with continuous collision detection and spatial hash grid, running without DOM/Canvas dependencies so runs can be verified deterministically on the server.
- **Pure Web Audio API**: 100% procedural sound synthesis (no external audio files to download).

---

## 🛠️ Tech Stack & Architecture

```
brick62/
├── api/                         # Vercel Serverless Functions (Node.js + TS)
│   ├── _lib/
│   │   ├── anti_cheat.ts        # Plausibility heuristics & deterministic replay verification
│   │   ├── db.ts                # MongoDB Atlas connection manager (with in-memory fallback)
│   │   └── schemas.ts           # Zod schema validation
│   ├── admin.ts                 # Password-protected admin dashboard API
│   ├── checkout.ts              # Dodo Payments checkout session creator
│   ├── cron/
│   │   └── rollover.ts          # Daily seed rollover & weekly tournament finalizer (Vercel Cron)
│   ├── entitlements.ts          # Server-verified entitlements sync
│   ├── leaderboard.ts           # Daily / Endless / Tournament leaderboards
│   ├── save.ts                  # Cloud save load/save/merge API
│   ├── scores.ts                # Score submission with anti-cheat verification
│   └── webhooks/
│       └── dodo.ts              # Dodo Payments verified webhook handler (idempotent)
├── src/
│   ├── audio/
│   │   └── sound_engine.ts      # Web Audio procedural sound & generative adaptive music
│   ├── config/
│   │   ├── balance.ts           # Central balance sheet & tuning parameters
│   │   └── products.ts          # Product definitions & cosmetic catalog
│   ├── core/                    # Shared framework-free deterministic simulation core
│   │   ├── input_log.ts         # Input recorder and replay simulator
│   │   ├── physics.ts           # Sub-stepping, continuous collision detection, anti-stall
│   │   ├── rng.ts               # Mulberry32 deterministic seeded PRNG
│   │   ├── spatial_grid.ts      # O(1) broadphase grid for 3,000+ bricks
│   │   ├── stages/
│   │   │   └── stage_data.ts    # Mathematical pixel-art masks for 30 stages + Endless + Daily
│   │   ├── types.ts             # Core data contracts and interfaces
│   │   └── sim.ts               # GameSimulation state machine
│   ├── render/
│   │   ├── particles.ts         # Crumble fragments, shockwaves, floating combat text
│   │   └── renderer.ts          # Canvas 2D renderer with cached offscreen brick baking
│   ├── services/
│   │   ├── ads.ts               # AdProvider interface (MockAdProvider, PortalAdProvider)
│   │   ├── analytics.ts         # Privacy-first event logger (GDPR/CCPA compliant)
│   │   ├── payment.ts           # PaymentProvider interface (Mock & DodoPaymentProvider)
│   │   └── save_service.ts      # LocalSaveProvider & CloudSaveProvider with safe progress merge
│   ├── ui/
│   │   └── style.css            # Cyberpunk styling, responsive layout, glassmorphism modals
│   └── main.ts                  # Game controller, input dispatch, fixed loop accumulator
├── tests/
│   ├── backend.test.ts          # Dodo webhook idempotency, save merge, anti-cheat tests
│   └── sim.test.ts              # Determinism and spatial grid unit tests
├── balance.json                 # Standalone JSON balance sheet for non-coder tuning
├── vercel.json                  # Vercel deployment configuration, headers, and cron jobs
└── .env.example                 # Documented environment variables template
```

---

## 🚀 Quickstart & Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Local Dev Server
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### 3. Run Automated Tests
```bash
npm test
```
Runs Vitest unit tests verifying deterministic replays, spatial grid collision, guest-to-cloud save merging, anti-cheat heuristics, and Dodo Payments webhook idempotency.

### 4. Build for Production
```bash
npm run build
```
Generates a static bundle in `dist/` (~34 kB gzipped) ready for static CDN deployment.

---

## 💳 Dodo Payments Integration Guide

BRICK62 utilizes **Dodo Payments** as its Merchant of Record (MoR). Dodo manages global sales tax, VAT, and compliant checkout flows.

### Architecture
1. **Client Checkout Request**: Player taps purchase -> calls `POST /api/checkout` with `productId` and `playerId`.
2. **Server-Side Session**: `/api/checkout` calls the official `dodopayments` SDK to generate a hosted checkout URL with `playerId` in the session metadata.
3. **Player Completes Payment**: Player pays on Dodo's hosted payment page.
4. **Verified Webhook Execution**: Dodo sends an asynchronous webhook event to `/api/webhooks/dodo`.
5. **Signature & Idempotency Check**:
   - Webhook signature is validated using `client.webhooks.unwrap()` with `DODO_PAYMENTS_WEBHOOK_SECRET`.
   - The webhook ID is verified against the `processed_webhooks` collection to prevent duplicate execution.
6. **Entitlement Grant**:
   - `payment.succeeded`: Grants `adsRemoved`, `shards`, `seasonPass`, or skins in MongoDB `entitlements` collection.
   - `refund.succeeded` or `payment.failed`: Revokes or updates entitlements.
7. **Client Entitlement Refresh**: On return or via the **Restore Purchases** button, the client fetches `/api/entitlements` to sync the verified state.

### Going From Test to Live
1. Create a Dodo Payments account at [https://app.dodopayments.com](https://app.dodopayments.com).
2. Create your products in the Dodo dashboard matching the IDs in `src/config/balance.ts`:
   - `p_prod_remove_ads` ($3.99 USD)
   - `p_prod_starter_pack` ($5.99 USD)
   - `p_prod_shards_2500` ($1.99 USD)
   - `p_prod_shards_10000` ($6.99 USD)
   - `p_prod_season_pass_1` ($4.99 USD)
3. Register your webhook URL in the Dodo dashboard:
   - URL: `https://your-domain.vercel.app/api/webhooks/dodo`
   - Events subscribed: `payment.succeeded`, `payment.failed`, `refund.succeeded`, `dispute.opened`.
4. Copy your **API Key** and **Webhook Secret** into Vercel Environment Variables:
   - `DODO_PAYMENTS_API_KEY`: Your live API key.
   - `DODO_PAYMENTS_WEBHOOK_SECRET`: Your webhook signing secret (`whsec_...`).
   - `DODO_ENV`: Set to `live` (or `test` for testing).

---

## 🌐 Vercel & MongoDB Atlas Deployment

### 1. MongoDB Atlas Setup
1. Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Under **Network Access**, add `0.0.0.0/0` (Allow Access from Anywhere) so Vercel dynamic serverless function IPs can connect.
3. Create a database user and obtain your connection string:
   `mongodb+srv://<user>:<password>@cluster0.example.mongodb.net/brick62?retryWrites=true&w=majority`

### 2. Vercel Project Setup
1. Import the repository into your Vercel dashboard.
2. Select the **Vite** Framework Preset.
3. Set Build Command: `npm run build`.
4. Set Output Directory: `dist`.
5. In **Project Settings -> Environment Variables**, configure:
   - `MONGODB_URI`: Your MongoDB Atlas connection string.
   - `DODO_PAYMENTS_API_KEY`: Dodo API key.
   - `DODO_PAYMENTS_WEBHOOK_SECRET`: Dodo webhook secret.
   - `DODO_ENV`: `test` or `live`.
   - `SESSION_SECRET`: Random 32+ character string.
   - `CRON_SECRET`: Random string for cron authorization.
   - `ADMIN_PASSWORD`: Strong password for the admin dashboard.
   - `ENABLE_PRIZES`: `0` (or `1` if legally cleared in selected regions).
   - `ALLOWED_PRIZE_REGIONS`: `US,CA,GB`

### 3. Vercel Cron Configuration
The `vercel.json` file schedules `/api/cron/rollover` daily at `00:00 UTC` to roll the daily challenge seed and close weekly tournaments.

---

## 🕹️ Adding New Stages, Worlds & Power-Ups

### Adding a Stage
Open `src/core/stages/stage_data.ts`:
1. Add your stage name to `names` array.
2. Define a mathematical mask function in `evaluateShape()`. Mathematical masks allow ultra-dense pixel layouts (e.g. circles, hearts, spirals, logos).
3. Set target star times and combo thresholds in `starGoals`.

### Adding a World
Open `src/config/balance.ts`:
1. Add an entry to `GAME_BALANCE.worlds` with:
   - Name, description, and primary/accent colors.
   - Background gradient array `[colorTop, colorBottom]`.
   - Musical scale steps for the procedural synthesizer (e.g. pentatonic or modal MIDI offsets).
   - Special brick mechanic.

### Adding a Power-Up
1. Add type union to `PowerUpType` in `src/core/types.ts`.
2. Add duration and parameter to `GAME_BALANCE.powerups` in `src/config/balance.ts`.
3. Add the effect handling in `GameSimulation.applyPowerUp()` in `src/core/sim.ts`.
4. Add icon and color in `GameRenderer.getPowerUpColor()` in `src/render/renderer.ts`.

---

## ⚖️ Compliance & Ethical Monetization Scaffolding

BRICK62 adheres to strict ethical gaming guidelines:
- **No Pay-To-Win**: All purchases are cosmetic skins or optional progression accelerators. Every stage is 100% winnable purely on skill.
- **No Uninterrupted Ads**:
  - Rewarded ads are 100% optional and player-initiated.
  - Interstitial ads are strictly disabled during active play, never appear in the first 3 minutes of play, require at least 5 minutes between appearances, and are completely disabled once Remove Ads is purchased.
- **GDPR / CCPA Consent Banner**:
  - Telemetry and personalized ads remain disabled until consent is granted.
  - Players can choose "Essential Only" at any time.
- **Data Export & Deletion**:
  - Players can copy their complete save to clipboard or reset progress directly in Settings.
- **Free Prize Scaffolding (Phase 2)**:
  - Weekly cup tournaments are 100% free to enter with no purchase required.
  - Regulated regions only, protected by an age confirmation gate.
  - Consult legal counsel in your target jurisdictions before toggling `ENABLE_PRIZES=1`.
