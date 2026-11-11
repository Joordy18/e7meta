import { useEffect, useState } from 'react';
import { loadFeed, loadIndex, loadLimited, loadRta } from '../lib/data';
import { useI18n } from '../i18n';
import type { RtaStats } from '../shared/types';

const DAY = 86_400_000;
const LATE_AFTER = 2; // the collection runs daily: more than two days without news means it did not run

/** Whole days between a "YYYY-MM-DD" date and now (0 today). */
export const daysAgo = (date: string, now = Date.now()) => { const d = Math.floor((now - Date.parse(date)) / DAY); return Number.isNaN(d) ? Infinity : d; }; // a date that cannot be read counts as late

type Status = { week?: string; rta?: RtaStats; posts?: string; limited?: string };

/** When each source of the site was last collected, read from the data files themselves; a daily source that went quiet is marked late. */
export default function DataStatus() {
  const { t, locale } = useI18n();
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    let live = true;
    const safe = <T,>(p: () => Promise<T>) => Promise.resolve().then(p).catch(() => null); // a missing file only leaves its row out
    Promise.all([safe(loadIndex), safe(loadRta), safe(loadFeed), safe(loadLimited)]).then(([index, rta, feed, limited]) => {
      if (live) setS({ week: index?.periods[0], rta: rta ?? undefined, posts: feed?.updated, limited: limited?.updated });
    });
    return () => { live = false; };
  }, []);
  if (!s) return <p className="note">{t('common.loading')}</p>;
  if (!s.week && !s.rta && !s.posts && !s.limited) return <p className="note error">{t('about.statusNone')}</p>; // every file failed: exactly what this page is for

  const collected = (date: string) => {
    const days = daysAgo(date);
    return <small>{t('about.statusDate', { date })}{days > LATE_AFTER && <> · <strong className="late">{t('about.statusLate', { days: Number.isFinite(days) ? days : '?' })}</strong></>}</small>;
  };
  return (
    <dl className="sources status">
      {s.week && <div className="panel"><dt>{t('about.statusWeek')}</dt><dd>{t('about.statusWeekValue', { date: s.week })}</dd></div>}
      {s.rta && (
        <div className="panel">
          <dt>{t('about.statusRta')}</dt>
          <dd>{t('about.statusRtaValue', { battles: s.rta.battles.toLocaleString(locale), players: s.rta.players, since: s.rta.since ?? '?', until: s.rta.until ?? '?' })}<br />{collected(s.rta.updated)}</dd>
        </div>
      )}
      {s.posts && <div className="panel"><dt>{t('about.statusPosts')}</dt><dd>{collected(s.posts)}</dd></div>}
      {s.limited && <div className="panel"><dt>{t('about.statusLimited')}</dt><dd>{collected(s.limited)}</dd></div>}
    </dl>
  );
}
