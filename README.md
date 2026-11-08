# PoolMaster3D

A realistic 3D eight-ball pool simulator for Windows with advanced aiming assistance, computer opponents and local multiplayer.
Built with JavaScript, Three.js, Electron and Vite; packaged as a Windows installer with Electron Builder (NSIS).

> **Status (read this first):** the game logic - physics, rules, aiming assistance, AI, settings, match flow - is implemented and covered by an
> automated test suite. The 3D rendering, the Electron shell and the NSIS installer were written but **could not be executed** in the
> environment where this code was produced (no network, no GPU, no Windows). Follow [docs/TESTING.md](docs/TESTING.md) to run the
> first real build and the manual checklist before distributing the installer.

## Quick start (developer)

Requirements: Node.js 18+ (22 recommended) on Windows 10/11.

```bash
npm install
npm run dev        # development: Vite + Electron window
npm test           # unit + integration tests (Vitest)
npm run build      # production build of the game into dist/
npm run start      # build, then launch the production build in Electron
npm run dist:win   # build the Windows installer -> release/PoolMaster3D-Setup.exe
```

The installer can also be produced without a local Windows machine: push the repository to GitHub and the workflow
`.github/workflows/build-windows.yml` builds `PoolMaster3D-Setup.exe` on a Windows runner and uploads it as a build artifact
(and attaches it to the release when you push a `v*` tag).

## For players

See [docs/INSTALL.md](docs/INSTALL.md): double-click `PoolMaster3D-Setup.exe`, follow the wizard, play. No Node.js, npm or terminal needed.

## Look
Modern lounge setting: deep matte tournament cloth (green by default, also blue, red, burgundy, grey, black), satin ebony frame with chrome inlay, chrome pocket rims, mother-of-pearl sights, high-gloss balls, slim square legs, a focused pool of light over the table and a dark room with warm LED strips. The UI uses graphite glass panels with an emerald accent. Brightness is adjustable in Settings (default 70 %).

## Phone / tablet (web version)
The game also runs in a mobile browser and can be installed on the home screen (PWA, works offline after the first load).
1. Push to GitHub; in the repository open **Settings -> Pages -> Source: GitHub Actions** (one time). The workflow `deploy-pages.yml` publishes the site at `https://<user>.github.io/<repo>/` (a free account needs a public repository for Pages).
2. Open that address on the phone. Android Chrome: menu -> *Install app*. iPhone Safari: Share -> *Add to Home Screen*. Launching from the home screen gives full-screen play.

Touch controls: one finger drag turns the aim (relative, so your finger does not hide the line), **Fine aim** button for tiny adjustments, power bar and SHOOT button on the left, spin disc, camera buttons, two-finger pinch = zoom, two-finger drag = orbit the camera, tap the table to place the cue ball. First launch on a phone defaults to *low* graphics with the audience hidden; raise them in Settings if the phone is fast.

## Android app (APK)
The workflow `.github/workflows/build-android.yml` builds an installable Android app (Capacitor + Gradle, Java 17) and uploads `PoolMaster3D.apk` as a build artifact.
* Download it from **Actions -> Build Android APK -> latest run -> Artifacts -> PoolMaster3D-Android-APK**, unzip, copy the `.apk` to the phone and open it
  (Android will ask to allow installing apps from this source). The APK is debug-signed: fine for personal use and sharing, not for the Play Store (that needs a release keystore and an AAB).
* The app runs landscape and immersive full-screen, keeps the screen on, and the hardware **Back** button pauses the game / goes back one screen.
* Local build (needs Android Studio / Android SDK + JDK 17): `npm install`, `npm run android:add` once, then `npm run android:apk`.

## Controls (desktop)

| Action | Input |
|---|---|
| Aim | Left-drag on the table (aims at the pointer); **Shift + drag** or Left/Right arrows for fine aiming |
| Power | **Mouse wheel** (Shift + wheel = fine), Up/Down arrows, or drag the power bar |
| Shoot | **Space** or the SHOOT button |
| Spin (tip position) | Drag the spin disc (double-click to centre) |
| Place cue ball (ball in hand) | Click on the table |
| Camera | Right-drag orbit, **Ctrl + wheel** zoom, **1** Free, **2** Overhead, **3** Precision, **C** cycle |
| Instant replay / slow motion | **R** replays the last shot (R again stops), **T** toggles slow motion |
| Pause | Esc or P; fullscreen F11 |

## Timers
A match clock (pauses with the game) is always shown; an optional **shot clock** (30/45/60 s, Settings > Gameplay) fouls the shooter when time runs out. Table brightness is adjustable in Settings > Graphics.

## Atmosphere
* **Audience** (about 90 procedural spectators on risers behind and beside the table) that sway, jump and cheer when a ball is pocketed, slump on fouls and celebrate when the match ends.
* **Referee** beside the table who watches the cue ball, raises an arm on fouls (with a whistle), points on good shots and raises both arms for the winner.
* **Commentator** who greets the players and calls pots, misses, fouls (with the reason), group assignment, runs, replays, the shot clock and the final result. It uses the voices installed in Windows (works offline), shows every line as an on-screen caption, and can be switched off or given a different voice in Settings > Audio.
* Procedural crowd sounds (applause, groan), soothing generative music, table cloth colours (green, blue, red, burgundy, grey). Audience and referee can be switched off in Settings.

## Game modes
* **Single player** vs. Easy / Medium / Hard computer opponent.
* **Local multiplayer** (two players, hot seat, automatic turn switching, per-player pocketed balls and scores).
* **Practice**: free play (no rules), aiming practice (scattered balls), shot practice (pocket the marked ball, streak counter).

## Aiming assistance (five levels)
| Level | Shows |
|---|---|
| 1 Off | Nothing |
| 2 Basic | Cue-ball line to first contact and the ghost ball |
| 3 Intermediate | + object-ball trajectory (from the real physics), predicted pocket |
| 4 Advanced | + cue-ball path after contact incl. spin and cushion rebounds, alignment feedback panel, top-3 ranked shots, recommended shot highlighted |
| 5 Professional | + paths of every disturbed ball, full ranked list with per-shot difficulty, balls with no shot and why |

* **Alignment feedback** checks: target reachable, legal target, contact point suitable, heading toward a pocket; it reports a signed aiming error (which way and how many degrees to turn).
* **Shot ranking** is computed from geometry (ghost ball, cut angle, distance to the pocket, pocket entry angle, obstruction by other balls on both the cue-ball and object-ball paths, cushion interference). Difficulty is the aiming precision the shot demands: the lateral tolerance at the pocket is converted to an angular tolerance for the cue ball and mapped to 0-100 %. The top candidates are then verified with the real physics, which also yields a suggested power and a throw-corrected aim. Click an entry in the list to aim at it.
* Predictions run the **same `PhysicsWorld` and cue-impact model** as live play with the same `PHYSICS` constants (`src/utils/Constants.js`), so they match gameplay exactly (covered by a test that compares predicted and live end positions to 1e-9 m).

## Physics (`src/physics`)
Deterministic planar simulation with full 3D spin, event-driven (exact time of impact inside each 1/120 s step, so nothing tunnels):
* cloth sliding friction -> rolling transition (closed form, 3.5 mu g slip decay), rolling resistance, side-spin decay;
* ball-ball impulse with restitution and friction (throw and spin transfer);
* cushion impulse with speed-dependent restitution and friction coupling side spin to tangential velocity; pocket jaws are real knuckle points;
* cue impact model (Alciatore) turning cue speed and tip offset into velocity, top/back spin and side spin;
* pocket capture, ball settling, collision events for sound.

### Deviation from the original spec: Rapier3D
The specification asks for Rapier3D. This project uses a **custom deterministic pool engine instead**, for these reasons: a game solver
(Rapier) cannot guarantee that a predictor reproduces gameplay exactly, and it has no built-in model of cloth friction, cushion/spin coupling
or cue impact, which would all have to be written on top anyway. A single deterministic engine shared by gameplay, AI and aiming prediction
was the better way to meet the "predictor uses the same physics as gameplay" requirement. If Rapier3D is mandatory, it can be added as a
rendering-side collider/visual layer or as an alternative `PhysicsWorld` backend behind the same interface; the engine is isolated in `src/physics`.

## Project layout
```
electron/        main.js, preload.js (CommonJS), installer/installer.nsh (custom NSIS)
src/core/        Game, GameLoop, SceneManager, EventManager, Settings, Stats
src/physics/     PhysicsWorld, FrictionSystem, CollisionSystem, PocketPhysics, CueImpact
src/table/       TableGeometry (pure), PoolTable, Cushions, Pockets
src/balls/       Rack (pure), Ball, BallManager, BallMaterials (procedural textures)
src/aiming/      AimingSystem, TrajectorySystem, GhostBall, AlignmentSystem, AssistanceManager, AimRenderer
src/ai/          AIPlayer, ShotEvaluator, ShotPlanner, DifficultyManager
src/gameplay/    MatchManager, RulesEngine, TurnManager, ScoreManager, TableState
src/camera/      CameraManager, FreeCamera, OverheadCamera, PrecisionCamera
src/cue/         CueStick, CueController, ShotPower
src/ui/          MainMenu, GameHUD, SettingsMenu, PauseMenu, ResultsScreen
src/audio/       SoundManager (procedural Web Audio; no audio files needed)
tests/           Vitest suites
```
All textures and sounds are generated procedurally, so the installed game needs no external assets and no internet connection.

## Rules implemented
Opening break (4 balls to a rail or a pot), open table and group assignment on the first legal pot after the break, turn continuation, fouls
(scratch, no ball hit, wrong first contact, no rail after contact, illegal break), ball in hand after a foul (behind the head string only for the opening break), 8-ball re-spot on the break, win/loss on the 8-ball.
Not implemented: called pockets, re-rack option, push-out, three-foul rule.

## Known limitations
* No cue elevation (massé/jump shots) and no squirt/cue deflection; cushion contact does not model ball-height coupling of top/back spin.
* Ranking considers direct pots (no bank/combination/kick shots).
* Anti-aliasing changes take effect after restarting the game; other graphics settings apply immediately.
* Statistics from local multiplayer only count matches played.
