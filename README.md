# e7overlay

Build stats for Epic Seven: for every hero, the gear sets and artifacts players wear most, plus the spread of their stats. A TypeScript collector fetches the data and writes it as static JSON; a React site (in English) shows it, and an always-on-top overlay window puts it next to the game.

## Commands

- `npm run collect`: fetch the data (about 1,200 sequential calls for the heroes, plus about 1,100 for modes, teams and gear; several minutes). While the published week is unchanged it skips the heroes and only fetches the extra files that are missing or out of date; add `-- --force` to redo everything, or `-- --extras` to refresh only modes, teams and gear.
- `npm run dev`: run the site locally.
- `npm run skills`: fetch the skill descriptions of the heroes that do not have them yet from epic7db.com (one page a second; `-- --refresh` redoes everything). The daily task runs it too.
- `npm run arena`: fetch the World Arena season infographics (a couple of calls; only seasons not saved yet are downloaded). Seasons since Fall 2025 are supported; the older posts use another layout. The daily task runs it too.
- `npm run trends`: compute `public/data/trends.json` (the biggest moves of each hero's sets and artifacts between the two latest weeks, from files already on disk, no API call). `npm run collect` and the daily task do it too.
- `npm run feed`: fetch the latest official posts (notices, patch information, developer notes, events; four calls) and record the heroes and artifacts that appeared since the previous week into `public/data/feed.json`. The daily task runs it too.
- `npm run rta`: sample the recent ranked (RTA) battles of the top 100 players of the global leaderboard and write the counts for every hero to `public/data/rta/stats.json` (about 1,000 requests, one every 0.7 s: roughly 15 minutes; run it when you want fresh numbers, it is not in the daily task). It uses the game's public record API (`e7api.onstove.com`, the one behind the player rankings of epic7.onstove.com) with our own identity and nothing imitated; if the API ever refuses, the command fails and nothing is written.
- `npm run overlay`: build the site and open it in an **always-on-top** window (above a windowed or borderless game, not above exclusive fullscreen). `Ctrl+Alt+E` shows or hides the window without taking focus from the game.
- `npm run overlay:smoke`: check that the overlay starts and loads the data (prints `SMOKE OK`).
- `npm test`: run the tests. `npm run build` builds the static site.

## What the site shows

- **Layout**: the site menu is the bar on top (Home, Heroes, Modes, RTA, Guides, the Search button and the data week). Pages with several sections (home, hero page, RTA page) have a table of contents: on a wide screen a rail on the left that follows the section being read, on a narrow window (the overlay) a row of buttons above the page. A click scrolls down to the section. The home sections also link to the full pages (modes, RTA, guides).
- **Home** (`#/`): a "What's new" feed (heroes and artifacts that just appeared, and the latest official posts per board, each linking to the game's community page), then a "Balance changes" zone (the heroes and artifacts of the latest "Balance Adjustment Preview" post of the developer notes, with the skills they change and the developers' own explanation, marked upcoming until the patch day; each hero opens on "Exact changes": every changed skill before and after, the changed words marked, with the effect labels and old / new values such as cooldowns), then the meta of the week. The heroes used most in hunts, the abyss and expeditions (average share over the rankings of each mode, with the change in points once a second week of mode data exists), the most picked and most pre-banned heroes of the latest World Arena season (with the change against the previous season), the biggest set and artifact shifts of the week (a "quiet week" note when none moved by 3 points) and the latest guides.
- **Heroes** (`#/heroes`): every hero, with search, filters and a sort by top set or artifact share. A hero page (always the latest week, no period menu) has the gear ranking (sets, artifacts), the hunt statistics (set combinations, artifacts, a stat targets table with typical / median / top 25% / top 10% values, and histograms) and where the hero is used in other modes.
- **Modes**: a visual picker (one card per boss, one tile per floor) and, for each boss, floor or level, a page with the best teams and the heroes used most: hunts (5 bosses, 3 difficulties), the abyss (every tenth floor) and expeditions (5 bosses, 3 levels), plus the latest Rift season. A hero page opens on a "loadout": portrait, the recommended build (most used set combination, top three artifacts, the exclusive equipment upgrade most chosen, the stats to aim for) and the three skills, each opening on its description, effects, soulburn and enhancements. Below come the details: World Arena figures, where the hero is used, who it is played with, the best PvE teams, the gear ranking and the hunt statistics. Skill text and the description of the exclusive equipment (its stat bonus and what each upgrade option does, matched with the game's usage ranking) come from the fan site epic7db.com (`npm run skills`; the game's own guide only names the skills). epic7db describes the exclusive equipment of about 80 of the 139 heroes that have one; for the others the page shows the usage bars only. A hero page lists where the hero is used, the heroes it is most often played with (counted in the best hunt, abyss and expedition teams) and the best PvE teams it plays in. There is no official counter or RTA team data.
- **Artifacts**: every artifact on a hero page is a link to its page: stars, class, base and max-level stats, the effect at level 1 and at max level, and the heroes wearing it most.
- **Search**: `Ctrl+K` (or the Search button in the header) opens a quick jump to any hero, artifact, mode, guide or page. Heroes, artifacts and modes come from the latest week's data, loaded the first time the box opens.
- **RTA (World Arena)**: the draft mode's season statistics, from the infographic the developers publish after each season: pick, first pick and pre-ban rates with ban and win rates for the top 20 heroes of each league tier (Champion, Warlord, Emperor and Legend, each "and above"), the win rate and player count of the top leagues and the cutoffs. A hero is linked to its page when its name matches, and a hero page shows its own figures from the latest season (when it is in a top 20). The classic Arena has no official statistics that we found. Below the infographic tables, "All heroes, top players" lists every hero from our own count of recent battles of the top 100 players (pick, win, ban, pre-ban and first pick rates, sortable; heroes with fewer than 20 games are left out), and a hero page shows the same rates for its hero. It is a sample of the best players, so the numbers differ from the infographic; the nicknames of the players are not kept.
- **Guides**: short articles. A mode page links to a guide when a file named after its boss exists (`golem-hunt.md`, `wyvern-hunt.md`, `snag-lich-expedition.md`, `abyss.md`...). To add a guide, create `src/content/guides/<slug>.md` starting with a front matter block (`title`, `summary`, `date: YYYY-MM-DD`), then Markdown (headings, lists, bold, italic, code, links, quotes). The tests check every guide and its internal links.

## Daily collection (Windows)

Rankings change once a week; a daily run costs only 2 API calls while the week is unchanged.

```
powershell -File scripts/schedule-collect.ps1 -Time 12:00    # create the scheduled task E7Meta-Collect
powershell -File scripts/schedule-collect.ps1 -Remove        # delete it
```

It runs `scripts/collect-daily.cmd` (output in `collect.log`, ignored by git). New snapshots land in `public/data/`; committing them is up to you.

## Data

Snapshots live in `public/data/<period>/` (`heroes.json` and `hero/<code>.json`); the list of periods is `public/data/index.json`. The collector keeps the 8 newest weeks and deletes the older folders when a new week arrives (about 4 MB a week; the site shows the latest week only, the older ones feed the trends). They are versioned in git, so older weeks stay in the history.

The numbers come from the game's official public API (`api.onstove.com`), which is undocumented and may change without notice. Check its terms of use before publishing the site.

`feed.json` (at the root of `public/data/`) holds the latest posts of the four boards (Notices 985, Patch Information 986, Developer Notes 987, Events 988 of the official community API) and the releases: each post keeps the link to its official banner (the community CDN, hot-linked, not stored; the latest post of each board shows it on the home page). Releases come from two sources: the headings of the two newest "Update Content" posts ("New 5★ Hero, Name", "New 5★ Artifact, Name"), which announce an item before the game's data lists it, and a comparison of the latest week with the previous one (a hero or artifact present in the first and absent from the second is stamped with that week; the game's data has no release date). An announced item is matched by name with the heroes and artifacts of the latest week to get its page, its icon, its grade, its element and its class (for an announced artifact that is not in the data yet, the class is read from the post: "The Knight-exclusive ..."; it then links to the post and has no icon). Releases accumulate, so the file keeps the last 20.

`feed.json` also holds `balance`: the heroes and artifacts of the newest "Balance Adjustment Preview" post (the patch day read from the post text, the table of targets, the skills changed and the explanation clipped to 300 characters). Each skill also keeps its text before and after the patch and the effect labels the developers put under it (`details`), so the site can mark the changed words. It is read again at each `npm run feed` (one more request); if the post cannot be read or parsed, the previous one is kept. Heroes are matched by name with the latest week's data for their page, class and element.

`trends.json` (at the root of `public/data/`) holds the build shifts between the two latest periods (`{from, to, builds}`); only gear sets and artifacts are compared, and a hero with no data in one of the weeks is left out.

World Arena seasons are not tied to a weekly period: they live in `public/data/arena/` (`index.json` and one file per season).

Each period folder also holds `modes.json` (the mode rankings and the Rift season), `teams.json` (the best teams of the 15 most used heroes of every mode list) and `gear.json` (the artifact catalog with the heroes wearing each). `modes.json` and `teams.json` are refreshed by `npm run collect` whenever the hunt week changes and `gear.json` when it is missing, even when the hero snapshot is already up to date.

The two sources do not share a period: gear rankings and the detailed hunt statistics (set combinations, stat spread) are updated separately, so every block shows its own period.

## Images

Hero portraits and set/artifact icons are the game's official art, loaded straight from its public guide CDN (`static-pubcomm.onstove.com`). Nothing is copied into this repository. If an image cannot load, the text next to it still says what it is. The art belongs to its owners: check that you may show it before publishing.
