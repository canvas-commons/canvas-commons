import clsx from 'clsx';
import {JSX} from 'preact';
import styles from './Controls.module.scss';
import {Icon} from './Icon';

export interface ToggleProps
  extends Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'onToggle'> {
  open?: boolean;
  onToggle?: (value: boolean) => void;
  animated?: boolean;
}

export function Toggle({
  open,
  onToggle,
  animated = true,
  ...props
}: ToggleProps) {
  return (
    // TODO: use IconButton?
    <button
      className={clsx(
        styles.toggle,
        open && styles.open,
        animated && styles.animated,
      )}
      onClick={() => onToggle?.(!open)}
      {...props}
    >
      <Icon name="chevron_right" />
    </button>
  );
}
