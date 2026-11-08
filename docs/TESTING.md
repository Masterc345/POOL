# Testing and verification status

## Automated (run with `npm test`)
| Suite | What it verifies |
|---|---|
| `physics.test.js` | rolling distance = v^2/2a, sliding->rolling at 5/7 v, back-spin draw, time-step independence, head-on and cut-shot collisions, momentum, no overlap/tunnelling at break speed, cushion rebound, pocket capture (corner, side, jaw rattle), determinism, rack validity, cue-impact formulas |
| `rules.test.js` | break legality, group assignment, fouls (scratch, wrong ball, no rail, no hit), 8-ball win/loss/re-spot, scoring |
| `aiming.test.js` | ghost ball equals simulated contact, predictor equals live stepping, evaluator (obstruction, cushion interference, difficulty ordering), physics-verified planner (>90 % pots), alignment states, behaviour of all five assistance levels |
| `ai.test.js` | complete AI-vs-AI games with the real physics and rules, legal cue placement |
| `match.test.js` | headless MatchManager integration: single player, local multiplayer, pause, three practice modes, cue placement, HUD data |
| `settings.test.js` | settings persistence, validation of corrupted data, stats, event manager |
| `config.test.js` | npm scripts, electron-builder/NSIS settings, installer script sanity, CI workflow, Electron security flags |

Measured with an ad-hoc script during development (8 games per pairing, not part of the suite): all AI games finished; Hard beat Easy and Medium in 7 of 8 games each;
Hard averaged ~19 turns per game, Medium ~27, Easy ~42. The suite itself only asserts that games finish and that Hard pots more per turn than Easy.

## NOT verified yet (needs a real machine) - manual checklist
Run `npm install && npm run dev` first and check:

- [ ] Window opens on the main menu without errors (F12 console clean)
- [ ] Table, cushions, pockets, balls (numbers/stripes) look right; lighting is neither too dark nor blown out (tune `Lighting.js` spot intensity / `Environment.scene.environmentIntensity`)
- [ ] Balls roll, collide, enter pockets and drop; shadows visible
- [ ] Cue sits behind the ball, pulls back and strikes; spin control changes the shot
- [ ] Aim lines / ghost ball / paths / pocket ring / recommended ring look correct at each level
- [ ] Camera modes 1/2/3, right-drag orbit, wheel zoom, smooth transitions
- [ ] Mouse aiming direction is not mirrored in any camera mode (`CueController._screenSign`)
- [ ] Ball in hand placement by click; AI turns; local multiplayer; pause/resume; results screen
- [ ] Settings persist across restarts (`%APPDATA%\PoolMaster3D\settings.json`); fullscreen/resolution apply
- [ ] `npm run build` succeeds; `npm run start` opens the production build (no Vite URL)
- [ ] `npm run dist:win` produces `release/PoolMaster3D-Setup.exe`; run the wizard: options page, shortcuts, finish-page launch
- [ ] Installed game launches from Desktop/Start Menu with no terminal window; works offline
- [ ] Uninstaller removes files/shortcuts and asks before deleting `%APPDATA%\PoolMaster3D`

If the NSIS build reports a macro/page error, the culprit is `electron/installer/installer.nsh` (it was written against the documented
electron-builder hooks `customInit`, `customPageAfterChangeDir`, `customInstall`, `customUnInstall` but could not be compiled here).
