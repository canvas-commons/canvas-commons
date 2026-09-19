import clsx from 'clsx';
import React from 'react';
import HomeReel from './HomeReel';
import styles from './styles.module.css';

export default function Embed() {
  return (
    <section className={styles.section}>
      <div
        className={clsx(
          styles.container,
          styles.sectionInner,
          styles.split,
          styles.splitWide,
        )}
      >
        <div className={styles.browser}>
          <div className={styles.browserBar}>
            <span className={styles.urlBar}>
              yourblog.dev/visualizing-sorting
            </span>
          </div>
          <HomeReel
            style={{display: 'block', width: '100%', aspectRatio: '16 / 9'}}
          />
        </div>
        <div>
          <div className={styles.eyebrow}>RENDER &amp; EMBED</div>
          <h2 className={styles.h2}>Render with Javascript.</h2>
          <p className={styles.lead} style={{marginBottom: 16}}>
            Render to an MP4 for editing and uploading, or build the animation
            and drop it into a webpage. Animations can respond to the page and
            users; try changing the theme on this page!
          </p>
          <div className={styles.embedSnippet}>
            &lt;<span className={styles.tag}>canvas-commons-player</span> src=
            <span className={styles.str}>"sort.js"</span> /&gt;
          </div>
          <p
            className={styles.lead}
            style={{marginTop: 14, fontSize: '0.85rem'}}
          >
            Great for interactive blog posts, docs and lecture notes.
          </p>
        </div>
      </div>
    </section>
  );
}
