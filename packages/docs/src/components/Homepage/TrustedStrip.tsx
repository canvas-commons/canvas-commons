import clsx from 'clsx';
import React from 'react';
import styles from './styles.module.css';

const USES = [
  'explainer videos',
  'math & CS visualizations',
  'interactive blog posts',
  'lecture notes',
];

export default function TrustedStrip() {
  return (
    <div className={styles.section}>
      <div className={clsx(styles.container, styles.trusted)}>
        <span className={styles.trustedLabel}>trusted by creators making</span>
        {USES.map((use, i) => (
          <React.Fragment key={use}>
            <span className={styles.trustedItem}>{use}</span>
            {i < USES.length - 1 && <span className={styles.dot}>·</span>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
