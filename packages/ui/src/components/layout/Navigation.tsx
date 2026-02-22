import {LogLevel} from '@canvas-commons/core';
import {useEffect, useRef, useState} from 'preact/hooks';
import {useApplication, usePanels} from '../../contexts';
import {useReducedMotion} from '../../hooks';
import {EditorPanel} from '../../signals';
import {shake} from '../animations';
import {Icon} from '../controls';
import {Badge, Space, Tab, TabGroup, TabLink, Tabs} from '../tabs';
import styles from './Navigation.module.scss';

export function Navigation() {
  const {project, logger} = useApplication();
  const {tabs, sidebar, bottom} = usePanels();
  const reducedMotion = useReducedMotion();
  const badge = useRef<HTMLDivElement>();
  const [errorCount, setErrorCount] = useState(logger.onErrorLogged.current);

  useEffect(
    () =>
      logger.onErrorLogged.subscribe(value => {
        setErrorCount(value);
        if (!reducedMotion) {
          setTimeout(() => {
            badge.current?.animate(shake(2), {duration: 300});
          }, 0);
        }
      }),
    [logger, reducedMotion],
  );

  return (
    <Tabs className={styles.root}>
      <TabLink
        title="Project Selection"
        id="project-selection-link"
        href={window.location.pathname === '/' ? undefined : '../'}
      >
        <Icon name="canvas_commons" />
      </TabLink>
      <TabGroup tab={sidebar.current.value} setTab={tab => sidebar.set(tab)}>
        <Tab
          title="Video Settings"
          id="rendering-tab"
          tab={EditorPanel.VideoSettings}
        >
          <Icon name="videocam" />
        </Tab>
        {/* eslint-disable-next-line @typescript-eslint/naming-convention */}
        {tabs.map(({name, tabComponent: Component}) => (
          <Component tab={name} />
        ))}
        <Tab title="Thread Debugger" id="threads-tab" tab={EditorPanel.Threads}>
          <Icon name="hourglass_bottom" />
        </Tab>
        <Tab
          title={errorCount > 0 ? `Console (${errorCount})` : 'Console'}
          id="console-tab"
          tab={EditorPanel.Console}
        >
          <Icon name="bug" />
          {errorCount > 0 && (
            <Badge badgeRef={badge}>
              {errorCount > 999 ? `999+` : errorCount}
            </Badge>
          )}
        </Tab>
        <Tab title="Settings" id="settings-tab" tab={EditorPanel.Settings}>
          <Icon name="settings" />
        </Tab>
      </TabGroup>
      <Space />
      {project.experimentalFeatures && (
        <TabLink
          title="Experimental features enabled"
          id="docs-experimental-link"
          href="https://canvascommons.io/docs/experimental/"
          target="_blank"
        >
          <Icon name="science" />
          <Badge level={LogLevel.Warn}>!</Badge>
        </TabLink>
      )}
      <TabLink
        title="Docs"
        id="docs-external-link"
        href="https://canvascommons.io/docs/"
        target="_blank"
      >
        <Icon name="help_outline" />
      </TabLink>
      <TabGroup tab={bottom.current.value} setTab={tab => bottom.set(tab)}>
        <Tab title="Timeline" id="timeline-tab" tab={EditorPanel.Timeline}>
          <Icon name="movie" />
        </Tab>
      </TabGroup>
    </Tabs>
  );
}
