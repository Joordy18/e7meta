# e7overlay

Build stats for Epic Seven: for every hero, the gear sets and artifacts players wear most, plus the spread of their stats. A TypeScript collector fetches the data and writes it as static JSON; a React site (in English) shows it, and an always-on-top overlay window puts it next to the game.

## Commands

- `npm run collect`: fetch the data (about 1,200 sequential calls for the heroes, plus about 1,100 for modes, teams and gear; several minutes). While the published week is unchanged it skips the heroes and only fetches the extra files that are missing or out of date; add `-- --force` to redo everything, or `-- --extras` to refresh only modes, teams and gear.
- `npm run dev`: run the site locally.
- `npm run arena`: fetch the World Arena season infographics (a couple of calls; only seasons not saved yet are downloaded). Seasons since Fall 2025 are supported; the older posts use another layout. The daily task runs it too.
- `npm run overlay`: build the site and open it in an **always-on-top** window (above a windowed or borderless game, not above exclusive fullscreen). `Ctrl+Alt+E` shows or hides the window without taking focus from the game.
- `npm run overlay:smoke`: check that the overlay starts and loads the data (prints `SMOKE OK`).
- `npm test`: run the tests. `npm run build` builds the static site.

## What the site shows

- **Heroes**: every hero, with search, filters and a sort by top set or artifact share. A hero page has the gear ranking (sets, artifacts), the hunt statistics (set combinations, artifacts, a stat targets table with typical / median / top 25% / top 10% values, and histograms) and where the hero is used in other modes.
- **Modes**: a visual picker (one card per boss, one tile per floor) and, for each boss, floor or level, a page with the best teams and the heroes used most: hunts (5 bosses, 3 difficulties), the abyss (every tenth floor) and expeditions (5 bosses, 3 levels), plus the latest Rift season. A hero page lists where the hero is used, the heroes it is most often played with (counted in the best hunt, abyss and expedition teams) and the best PvE teams it plays in. There is no official counter or RTA team data.
- **Artifacts**: every artifact on a hero page is a link to its page: stars, class, base and max-level stats, the effect at level 1 and at max level, and the heroes wearing it most.
- **RTA (World Arena)**: the draft mode's season statistics, from the infographic the developers publish after each season: pick, first pick and pre-ban rates with ban and win rates for the top 20 heroes of each league tier (Champion, Warlord, Emperor and Legend, each "and above"), the win rate and player count of the top leagues and the cutoffs. A hero is linked to its page when its name matches, and a hero page shows its own figures from the latest season (when it is in a top 20). The classic Arena has no official statistics that we found.
- **Guides**: short articles. A mode page links to a guide when a file named after its boss exists (`golem-hunt.md`, `wyvern-hunt.md`, `snag-lich-expedition.md`, `abyss.md`...). To add a guide, create `src/content/guides/<slug>.md` starting with a front matter block (`title`, `summary`, `date: YYYY-MM-DD`), then Markdown (headings, lists, bold, italic, code, links, quotes). The tests check every guide and its internal links.

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

World Arena seasons are not tied to a weekly period: they live in `public/data/arena/` (`index.json` and one file per season).

Each period folder also holds `modes.json` (the mode rankings and the Rift season), `teams.json` (the best teams of the 15 most used heroes of every mode list) and `gear.json` (the artifact catalog with the heroes wearing each). `modes.json` and `teams.json` are refreshed by `npm run collect` whenever the hunt week changes and `gear.json` when it is missing, even when the hero snapshot is already up to date.

The two sources do not share a period: gear rankings and the detailed hunt statistics (set combinations, stat spread) are updated separately, so every block shows its own period.

## Images

Hero portraits and set/artifact icons are the game's official art, loaded straight from its public guide CDN (`static-pubcomm.onstove.com`). Nothing is copied into this repository. If an image cannot load, the text next to it still says what it is. The art belongs to its owners: check that you may show it before publishing.
