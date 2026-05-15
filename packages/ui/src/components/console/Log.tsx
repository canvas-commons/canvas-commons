import styles from './Console.module.scss';

import {LogLevel, LogPayload} from '@canvas-commons/core';
import clsx from 'clsx';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {useApplication} from '../../contexts/index.js';
import {useFormattedNumber} from '../../hooks/index.js';
import {
  StackTraceEntry,
  renderMarkdown,
  resolveStackTrace,
} from '../../utils/index.js';
import {IconButton, Toggle} from '../controls/index.js';
import {Locate} from '../icons/index.js';
import {Collapse} from '../layout/index.js';
import {SourceCodeFrame} from './SourceCodeFrame.js';
import {StackTrace} from './StackTrace.js';

export interface LogProps {
  payload: LogPayload;
}

export function Log({payload}: LogProps) {
  const {logger} = useApplication();
  const [open, setOpen] = useState(payload.level === LogLevel.Error);
  const [entries, setEntries] = useState<StackTraceEntry[] | null>(null);
  const duration = useFormattedNumber(payload.durationMs, 2);
  const object = useMemo(() => {
    if (!payload.object) {
      return null;
    }

    if (typeof payload.object === 'object' && 'byteLength' in payload.object) {
      return `${payload.object.prototype?.name ?? 'ArrayLike'}[${
        payload.object.byteLength
      }]`;
    }

    return JSON.stringify(payload.object, undefined, 2);
  }, [payload]);
  const userEntry = useMemo(() => {
    return entries?.find(entry => !entry.isExternal) ?? null;
  }, [entries]);
  const remarksHtml = useMemo(
    () => (payload.remarks ? renderMarkdown(payload.remarks) : null),
    [payload.remarks],
  );

  const hasBody = !!object || !!entries || !!payload.remarks;

  useEffect(() => {
    if (payload.stack) {
      resolveStackTrace(payload.stack).then(setEntries);
    }
  }, [payload]);

  return (
    <div
      className={clsx(
        styles.log,
        styles[payload.level],
        !hasBody && styles.empty,
      )}
    >
      <div className={styles.header}>
        {hasBody && <Toggle open={open} onToggle={setOpen} />}
        <div className={styles.message}>{payload.message}</div>
        {duration !== null && (
          <code className={styles.duration}>{duration} ms</code>
        )}
        {payload.inspect && (
          <IconButton
            title="Select related node"
            onClick={() => {
              logger.inspect(payload.inspect);
            }}
          >
            <Locate />
          </IconButton>
        )}
      </div>
      {hasBody && (
        <Collapse open={open}>
          {remarksHtml && (
            <div
              className={clsx(styles.section, styles.remarks)}
              dangerouslySetInnerHTML={{__html: remarksHtml}}
            />
          )}
          {object && (
            <div className={styles.section}>
              Related object:
              <pre className={styles.code}>{object}</pre>
            </div>
          )}
          {entries && (
            <div className={styles.section}>
              The problem occurred here:
              {userEntry && <SourceCodeFrame entry={userEntry} />}
              <StackTrace entries={entries} />
            </div>
          )}
        </Collapse>
      )}
    </div>
  );
}
