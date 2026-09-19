import clsx from 'clsx';
import React from 'react';
import styles from './styles.module.css';

function clip(color: string, flex: number, faded = false) {
  return {
    flex,
    borderRadius: 4,
    background: faded
      ? 'transparent'
      : `color-mix(in srgb, ${color} 38%, transparent)`,
  };
}

export default function EditorTimeline() {
  return (
    <section className={styles.section}>
      <div
        className={clsx(styles.container, styles.sectionInner, styles.split)}
      >
        <div>
          <div className={styles.eyebrow}>THE EDITOR</div>
          <h2 className={styles.h2}>Some things are easier with a mouse.</h2>
          <p className={styles.lead}>
            Write the animation in code, then sync it to audio or preview it in
            your browser. Tweak with the browser and see your changes in real
            time.
          </p>
        </div>
        <div className={styles.frame}>
          <div className={styles.frameBar}>
            <span className={styles.frameTitle}>timeline</span>
          </div>
          <div className={styles.timeline}>
            <div className={styles.marker} />
            <div className={styles.markerTag}>waitUntil('reveal')</div>
            <div className={styles.playhead} />
            <div className={styles.timelineRow}>
              <span className={styles.timelineLabel}>scene</span>
              <div className={styles.track}>
                <div style={clip('var(--cc-blue)', 2.4)} />
                <div style={clip('var(--cc-mauve)', 1.6)} />
                <div style={clip('var(--cc-teal)', 2)} />
              </div>
            </div>
            <div className={styles.timelineRow}>
              <span className={styles.timelineLabel}>labels</span>
              <div className={styles.track}>
                <div style={clip('var(--cc-peach)', 1)} />
                <div style={clip('var(--cc-peach)', 1.2, true)} />
                <div style={clip('var(--cc-peach)', 1.8)} />
              </div>
            </div>
            <div className={styles.timelineRow}>
              <span className={styles.timelineLabel}>audio</span>
              <div className={styles.track}>
                <div
                  style={{
                    flex: 1,
                    borderRadius: 4,
                    background:
                      'repeating-linear-gradient(90deg, color-mix(in srgb, var(--cc-green) 32%, transparent) 0 2px, transparent 2px 5px)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
