import type {CanvasCommonsPlayerProps} from '@canvas-commons/player';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';
import useBaseUrl from '@docusaurus/useBaseUrl';
import clsx from 'clsx';
import React, {ComponentProps} from 'react';
import AnimationLink from './AnimationLink';
import styles from './styles.module.css';

if (ExecutionEnvironment.canUseDOM) {
  import('@canvas-commons/player');
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'canvas-commons-player': CanvasCommonsPlayerProps & ComponentProps<'div'>;
    }
  }
}

export interface AnimationPlayerProps {
  banner?: boolean;
  small?: boolean;
  name: string;
  link?: string;
}

export default function AnimationPlayer({
  name,
  banner,
  small,
  link,
}: AnimationPlayerProps) {
  const src = useBaseUrl(`/examples/${name}.js`);
  return (
    <div
      className={clsx(
        styles.container,
        banner && styles.banner,
        small && styles.small,
      )}
    >
      <canvas-commons-player class={styles.player} src={src} auto={banner} />
      <AnimationLink name={link || name} />
    </div>
  );
}
