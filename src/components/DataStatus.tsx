import { useEffect, useState } from 'react';
import { loadArenaIndex, loadFeed, loadIndex, loadLimited, loadNames, loadRta, loadSkills, loadTrends } from '../lib/data';
import { useI18n } from '../i18n';
import type { RtaStats } from '../shared/types';

const DAY = 86_400_000;
const LATE_AFTER = 2; // the collection runs daily: more than two days without news means it did not run
const WEEK_LATE_AFTER = 9; // the game's weekly ranking changes every seven days: nine without a new week means the weekly collection did not see it
const RTA_QUIET_AFTER = 3; // days since the latest battle counted; a season that ended stops here too

/** Whole days between a "YYYY-MM-DD" date and now (0 today). */
export const daysAgo = (date: string, now = Date.now()) => { const d = Math.floor((now - Date.parse(date)) / DAY); return Number.isNaN(d) ? Infinity : d; }; // a date that cannot be read counts as late

type Status = { week?: string; rta?: RtaStats; posts?: string; limited?: string; skills?: string; names?: string; arena?: { season: string; published: string }; trends?: { from: string; to: string } };

/** When each source of the site was last collected, read from the data files themselves; a daily source that went quiet is marked late. */
export default function DataStatus() {
  const { t, locale, lang } = useI18n();
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    let live = true;
    const safe = <T,>(p: () => Promise<T>) => Promise.resolve().then(p).catch(() => null); // a missing file only leaves its row out
    Promise.all([safe(loadIndex), safe(loadRta), safe(loadFeed), safe(loadLimited), safe(loadSkills), safe(loadArenaIndex), safe(loadTrends), safe(() => lang === 'en' ? Promise.resolve(null) : loadNames(lang))])
      .then(([index, rta, feed, limited, skills, arena, trends, names]) => {
        const season = arena?.seasons[0];
        if (live) setS({ week: index?.periods[0], rta: rta ?? undefined, posts: feed?.updated, limited: limited?.updated, skills: skills?.fetchedAt, names: names?.updated, arena: season && { season: season.season, published: season.published }, trends: trends ? { from: trends.from, to: trends.to } : undefined });
      });
    return () => { live = false; };
  }, [lang]);
  if (!s) return <p className="note">{t('common.loading')}</p>;
  if (!Object.values(s).some(Boolean)) return <p className="note error">{t('about.statusNone')}</p>; // every file failed: exactly what this page is for

  const late = (text: string) => <> · <strong className="late">{text}</strong></>;
  const shown = (days: number) => Number.isFinite(days) ? days : '?';
  const collected = (date: string, daily = true) => { // `daily`: a source the collection renews every day, so an old date is a failure
    const days = daysAgo(date);
    return <small>{t('about.statusDate', { date })}{daily && days > LATE_AFTER && late(t('about.statusLate', { days: shown(days) }))}</small>;
  };
  const weekDays = s.week ? daysAgo(s.week) : 0;
  const quiet = s.rta?.until ? daysAgo(s.rta.until) : 0;
  return (
    <dl className="sources status">
      {s.week && <div className="panel"><dt>{t('about.statusWeek')}</dt><dd>{t('about.statusWeekValue', { date: s.week })}{weekDays > WEEK_LATE_AFTER && <small>{late(t('about.statusWeekLate', { days: shown(weekDays) }))}</small>}</dd></div>}
      {s.rta && (
        <div className="panel">
          <dt>{t('about.statusRta')}</dt>
          <dd>{t('about.statusRtaValue', { battles: s.rta.battles.toLocaleString(locale), players: s.rta.players, since: s.rta.since ?? '?', until: s.rta.until ?? '?' })}<br />{collected(s.rta.updated)}{quiet > RTA_QUIET_AFTER && <small><br />{late(t('about.statusRtaQuiet', { days: shown(quiet) }))}</small>}</dd>
        </div>
      )}
      {s.posts && <div className="panel"><dt>{t('about.statusPosts')}</dt><dd>{collected(s.posts)}</dd></div>}
      {s.limited && <div className="panel"><dt>{t('about.statusLimited')}</dt><dd>{collected(s.limited)}</dd></div>}
      {s.skills && <div className="panel"><dt>{t('about.statusSkills')}</dt><dd>{collected(s.skills, false)}</dd></div>}
      {s.names && <div className="panel"><dt>{t('about.statusNames')}</dt><dd>{collected(s.names)}</dd></div>}
      {s.trends && <div className="panel"><dt>{t('about.statusTrends')}</dt><dd>{t('about.statusTrendsValue', { from: s.trends.from, to: s.trends.to })}{s.week && s.trends.to < s.week && <small>{late(t('about.statusTrendsBehind', { date: s.week }))}</small>}</dd></div>}
      {s.arena && <div className="panel"><dt>{t('about.statusArena')}</dt><dd>{t('about.statusArenaValue', { season: s.arena.season, date: s.arena.published })}</dd></div>}
    </dl>
  );
}
