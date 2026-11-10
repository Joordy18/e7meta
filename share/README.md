# E7 Meta link preview

When a build link is pasted in Discord, X or a messenger, the chat app does not run the site (and never sees the part of the address after `#`).
So the build maker's "Copy link" gives an address on **this** small server instead: it answers chat apps with a page whose tags give the preview (a picture of the build), and sends people on to the site.

- `GET /b?h=<hero>&s=<sets>&a=<artifact>&n=<note>&l=<en|fr|de>` — the preview page (`api/b.ts`), then a redirect to `#/tools/build?...` on the site.
- `GET /api/og?...` — the same parameters, the 1200 x 630 PNG card (`api/og.ts`, drawn by `@vercel/og`). Names come from the site's public data files; the pictures from the game's guide CDN, fetched here.
- `SITE_URL` (optional environment variable): the site's address, `https://joordy18.github.io/e7meta/` by default.

The card font has Latin letters only: with the site in ja, ko or zh the card shows English names.
Chat apps keep a preview in their cache: a changed build has a new address, so it gets a new preview.

## Deploy (free Vercel Hobby plan, once)

1. vercel.com, sign in with GitHub, **Add New… > Project**, import `Joordy18/e7meta`.
2. **Root Directory: `share`**. Framework preset: Other. Deploy.
3. Copy the project's address (`https://….vercel.app`) into `SHARE_BASE` in `src/lib/build.ts`, commit and push: "Copy link" now gives preview links.

Every push to `main` redeploys it by itself, like the site.

## Try the card without deploying

```bash
npx tsx share/render-local.mts "h=c1137&s=set_speed,set_max_hp&a=efk03&n=Hello" card.png
```
