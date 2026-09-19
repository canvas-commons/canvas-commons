import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import clsx from 'clsx';
import React from 'react';
import CommandBox from './CommandBox';
import styles from './styles.module.css';

export default function ClosingCta() {
  const {siteConfig} = useDocusaurusContext();
  const discordUrl = siteConfig.customFields?.discordUrl as string;

  return (
    <section className={styles.section}>
      <div className={clsx(styles.container, styles.closing)}>
        <h2 className={styles.h2}>Start with one command.</h2>
        <CommandBox />
        <div className={styles.ctaRow}>
          <Link className={styles.ctaPrimary} to="/docs">
            Get Started <span className={styles.ctaArrow}>→</span>
          </Link>
          <span className={styles.ctaSep}>·</span>
          <a className={styles.ctaLink} href={discordUrl}>
            Discuss on Discord
          </a>
          <span className={styles.ctaSep}>·</span>
          <a
            className={styles.ctaLink}
            href="https://github.com/canvas-commons/canvas-commons/blob/main/CONTRIBUTING.md"
          >
            Contribute
          </a>
        </div>
      </div>
    </section>
  );
}
