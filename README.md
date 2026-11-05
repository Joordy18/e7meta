# e7overlay

Build stats for Epic Seven: for every hero, the gear sets and artifacts players wear most, plus the spread of their stats. A TypeScript collector fetches the data and writes it as static JSON; a React site (in English) shows it, and an always-on-top overlay window puts it next to the game.

## Commands

- `npm run collect`: fetch the data (about 1,200 sequential calls, several minutes). Does nothing (`skipped`) while the published week is unchanged; add `-- --force` to redo it.
- `npm run dev`: run the site locally.
- `npm run overlay`: build the site and open it in an **always-on-top** window (above a windowed or borderless game, not above exclusive fullscreen). `Ctrl+Alt+E` shows or hides the window without taking focus from the game.
- `npm run overlay:smoke`: check that the overlay starts and loads the data (prints `SMOKE OK`).
- `npm test`: run the tests. `npm run build` builds the static site.

## Daily collection (Windows)

Rankings change once a week; a daily run costs only 2 API calls while the week is unchanged.

```
powershell -File scripts/schedule-collect.ps1 -Time 12:00    # create the scheduled task E7Meta-Collect
powershell -File scripts/schedule-collect.ps1 -Remove        # delete it
```

It runs `scripts/collect-daily.cmd` (output in `collect.log`, ignored by git). New snapshots land in `public/data/`; committing them is up to you.

## Data

Snapshots live in `public/data/<period>/` (`heroes.json` and `hero/<code>.json`); the list of periods is `public/data/index.json`. They are versioned in git.

The numbers come from the game's official public API (`api.onstove.com`), which is undocumented and may change without notice. Check its terms of use before publishing the site.

The two sources do not share a period: gear rankings and the detailed hunt statistics (set combinations, stat spread) are updated separately, so every block shows its own period.

## Images

Hero portraits and set/artifact icons are the game's official art, loaded straight from its public guide CDN (`static-pubcomm.onstove.com`). Nothing is copied into this repository. If an image cannot load, the text next to it still says what it is. The art belongs to its owners: check that you may show it before publishing.
