import styles from '@site/src/components/Release/styles.module.css';
import Heading from '@theme/Heading';
import React, {ReactNode} from 'react';

export interface IssueGroupProps {
  type: 'feat' | 'fix' | 'change';
  children: ReactNode | ReactNode[];
}

const Titles = {
  feat: 'New features 🎉',
  fix: 'Fixed bugs 🐛',
  change: 'Other changes',
};

const IDs = {
  feat: 'new-features',
  fix: 'fixed-bugs',
  change: 'other-changes',
};

export default function IssueGroup({type, children}: IssueGroupProps) {
  return (
    <>
      <Heading id={IDs[type]} as="h3">
        {Titles[type]}
      </Heading>
      <ul className={styles.group}>{children}</ul>
    </>
  );
}
