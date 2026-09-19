import clsx from 'clsx';
import React from 'react';
import HomeFiddle from './HomeFiddle';
import {playgroundSource} from './playgroundSource';
import styles from './styles.module.css';

export default function CodePlayground() {
  return (
    <section className={styles.section}>
      <div className={clsx(styles.container, styles.sectionInner)}>
        <div className={styles.playgroundIntro}>
          <h2 className={styles.h2}>The code is the animation.</h2>
          <p className={styles.lead}>
            Write structure just like building a website. Use generators to
            animate them.
          </p>
        </div>
        <HomeFiddle>{playgroundSource}</HomeFiddle>
      </div>
    </section>
  );
}
