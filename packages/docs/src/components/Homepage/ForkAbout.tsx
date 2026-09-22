import Link from '@docusaurus/Link';
import clsx from 'clsx';
import React from 'react';
import styles from './styles.module.css';

const COLUMNS = [
  {
    title: 'Typesetting',
    items: [
      <>
        <span className={styles.mono}>Txt.split()</span> into grapheme / word /
        sentence nodes
      </>,
      <>
        <span className={styles.mono}>textPath</span> along any SVG path or live
        Curve
      </>,
      <>
        Knuth–Plass <span className={styles.mono}>wrapMode</span>, hyphenation,
        justify
      </>,
      <>Wrap text around any shape</>,
    ],
  },
  {
    title: 'Animation',
    items: [
      <>Rough, hand-drawn shape rendering</>,
      <>Animated layouts</>,
      <>Explicit space positioning</>,
      <>Better path, SVG, and image interpolation</>,
      <>Simplified LaTeX editing</>,
    ],
  },
  {
    title: 'Quality of Life',
    items: [
      <>Export and Copy Frames</>,
      <>Mediabunny Exporter (2x faster)</>,
      <>Copy Coordinates in Viewport Space</>,
    ],
  },
];

export default function ForkAbout() {
  return (
    <section
      className={styles.section}
      style={{background: 'var(--cc-mantle)'}}
    >
      <div className={clsx(styles.container, styles.sectionInner)}>
        <div style={{maxWidth: 680}}>
          <div className={styles.eyebrow}>BUILDING ON MOTION CANVAS</div>
          <h2 className={styles.h2}>A few new features.</h2>
          <p className={styles.lead}>
            Migrating is mostly a package rename, with a couple exceptions.
            Check the migration guide for more.
          </p>
          <div className={styles.linkRow}>
            <Link
              className={styles.ctaPrimary}
              to="/docs/migration/from-motion-canvas"
            >
              Migration guide <span className={styles.ctaArrow}>→</span>
            </Link>
            <a
              className={styles.ctaLink}
              href="https://github.com/canvas-commons/canvas-commons"
            >
              GitHub
            </a>
          </div>
        </div>
        <div className={styles.columns}>
          {COLUMNS.map(column => (
            <div key={column.title}>
              <h3 className={styles.colTitle}>{column.title}</h3>
              <ul className={styles.colList}>
                {column.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
