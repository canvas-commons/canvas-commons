import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import ClosingCta from '@site/src/components/Homepage/ClosingCta';
import CodePlayground from '@site/src/components/Homepage/CodePlayground';
import EditorTimeline from '@site/src/components/Homepage/EditorTimeline';
import Embed from '@site/src/components/Homepage/Embed';
import ForkAbout from '@site/src/components/Homepage/ForkAbout';
import Hero from '@site/src/components/Homepage/Hero';
import TrustedStrip from '@site/src/components/Homepage/TrustedStrip';
import styles from '@site/src/components/Homepage/styles.module.css';
import Layout from '@theme/Layout';
import React from 'react';

const DESCRIPTION =
  'Canvas Commons is a TypeScript framework for creating animations with ' +
  'code. Building on Motion Canvas: write animations with JSX and ' +
  'generators, render to MP4, and embed live animations anywhere.';

const KEYWORDS = [
  'Canvas Commons',
  'Motion Canvas',
  'Motion Canvas alternative',
  'Motion Canvas docs',
  'Framer Motion alternative',
  'Manim alternative',
  'Manim JavaScript',
  'Manim Web',
  'programmatic video',
  'code-driven animation',
  'TypeScript animation library',
  'generative video',
].join(', ');

export default function Home(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={DESCRIPTION}>
      <Head>
        <title>{siteConfig.title} — Create animations with code</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="keywords" content={KEYWORDS} />
        <meta property="og:title" content={siteConfig.title} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <main className={styles.page}>
        <Hero />
        <TrustedStrip />
        <CodePlayground />
        <EditorTimeline />
        <Embed />
        <ForkAbout />
        <ClosingCta />
      </main>
    </Layout>
  );
}
