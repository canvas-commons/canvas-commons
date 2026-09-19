import type {CanvasCommonsPlayerProps} from '@canvas-commons/player';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {
  getThemeColors,
  observeTheme,
} from '@site/src/components/Fiddle/themeColors';
import clsx from 'clsx';
import React, {
  ComponentProps,
  CSSProperties,
  useEffect,
  useRef,
  useState,
} from 'react';
import styles from './styles.module.css';

if (ExecutionEnvironment.canUseDOM) {
  import('@canvas-commons/player');
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'canvas-commons-player': CanvasCommonsPlayerProps &
        ComponentProps<'div'> & {class?: string};
    }
  }
}

export interface HomeReelProps {
  className?: string;
  style?: CSSProperties;
}

/**
 * The compiled playground scenes, played back to back. Theme colors go in
 * through the player's `variables` attribute, so the reel recolors with the
 * light and dark toggle.
 */
export default function HomeReel({className, style}: HomeReelProps) {
  const {siteConfig} = useDocusaurusContext();
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPaused(preference.matches);
    apply();
    preference.addEventListener('change', apply);
    return () => preference.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const apply = () =>
      ref.current?.setAttribute('variables', JSON.stringify(getThemeColors()));
    apply();
    return observeTheme(apply);
  }, []);

  return (
    <div className={clsx(styles.reel, className)} style={style}>
      <canvas-commons-player
        ref={ref}
        class={styles.reelPlayer}
        src={`${siteConfig.baseUrl}examples/home-reel.js`}
        variables={JSON.stringify(getThemeColors())}
        auto
        paused={paused || undefined}
      />
      <button
        className={styles.reelControl}
        type="button"
        onClick={() => setPaused(value => !value)}
      >
        {paused ? 'Play animation' : 'Pause animation'}
      </button>
    </div>
  );
}
