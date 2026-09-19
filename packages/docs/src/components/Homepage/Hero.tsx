import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import React from 'react';
import CommandBox from './CommandBox';
import HomeReel from './HomeReel';
import styles from './styles.module.css';

export default function Hero() {
  const {siteConfig} = useDocusaurusContext();
  const discordUrl = siteConfig.customFields?.discordUrl as string;

  return (
    <header className={styles.hero}>
      <HomeReel className={styles.heroReel} />
      <div className={styles.heroScrim} />
      <div className={styles.heroScrimV} />
      <div className={styles.container}>
        <div className={styles.heroInner}>
          <div className={styles.heroKicker}>a fork of Motion Canvas</div>
          <h1 className={styles.title}>Create animations with code.</h1>
          <p className={styles.subtitle}>
            A TypeScript framework for creating animations with code. Write
            animations with JSX and generators.
          </p>
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
      </div>
    </header>
  );
}
