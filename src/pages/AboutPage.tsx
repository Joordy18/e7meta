import { useEffect } from 'react';
import PageNav from '../components/PageNav';
import { useI18n, type Key } from '../i18n';

export const REPO = 'https://github.com/Joordy18/e7meta';
export const ABOUT_SECTIONS = ['faq', 'data', 'limits', 'legal'] as const;
export type AboutSection = (typeof ABOUT_SECTIONS)[number];

const count = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const k = (key: string) => key as Key; // the keys are about.q1..q9, about.src1Title... all in en.ts

/** About, FAQ, where the data comes from, its limits, privacy and legal notes. `section` scrolls to a part (the footer links to them). */
export default function AboutPage({ section }: { section?: AboutSection }) {
  const { t, rich } = useI18n();
  useEffect(() => {
    if (!section) return;
    const id = setTimeout(() => document.getElementById(section)?.scrollIntoView?.({ block: 'start' }), 0); // after the shell has scrolled to the top
    return () => clearTimeout(id);
  }, [section]);
  const issues = <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">GitHub</a>;

  return (
    <div className="with-rail about">
      <PageNav items={ABOUT_SECTIONS.map((id) => ({ id, label: t(k(`about.nav.${id}`)) }))} />
      <div className="content">
        <h1 className="page-title">{t('about.title')}</h1>
        <p className="lede">{t('about.lede')}</p>

        <section id="faq">
          <h2>{t('about.nav.faq')}</h2>
          {count(9).map((n) => (
            <details key={n} className="faq panel">
              <summary>{t(k(`about.q${n}`))}</summary>
              <p>{n === 8 ? rich('about.a8', { link: issues }) : t(k(`about.a${n}`))}</p>
            </details>
          ))}
        </section>

        <section id="data">
          <h2>{t('about.nav.data')}</h2>
          <p className="lede">{t('about.dataLede')}</p>
          <dl className="sources">
            {count(7).map((n) => (
              <div key={n} className="panel">
                <dt>{t(k(`about.src${n}Title`))}</dt>
                <dd>{t(k(`about.src${n}Text`))}</dd>
              </div>
            ))}
          </dl>
          <h3>{t('about.methodTitle')}</h3>
          <ul>{count(4).map((n) => <li key={n}>{t(k(`about.m${n}`))}</li>)}</ul>
        </section>

        <section id="limits">
          <h2>{t('about.nav.limits')}</h2>
          <ul>{count(4).map((n) => <li key={n}>{t(k(`about.l${n}`))}</li>)}</ul>
        </section>

        <section id="legal">
          <h2>{t('about.nav.legal')}</h2>
          <dl className="sources">
            {count(6).map((n) => (
              <div key={n} className="panel">
                <dt>{t(k(`about.g${n}Title`))}</dt>
                <dd>{n === 6 ? rich('about.g6Text', { link: issues }) : t(k(`about.g${n}Text`))}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
