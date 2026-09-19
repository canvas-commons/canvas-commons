import clsx from 'clsx';
import React, {useState} from 'react';
import styles from './styles.module.css';

const COMMAND = 'npm create @canvas-commons@latest';

export default function CommandBox({className}: {className?: string}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(COMMAND).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <div className={clsx(styles.commandBox, className)}>
      <span className={styles.commandPrompt}>$</span>
      <span className={styles.commandText}>{COMMAND}</span>
      <button className={styles.copyBtn} onClick={copy} type="button">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
