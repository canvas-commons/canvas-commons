import styles from './Controls.module.scss';

import clsx from 'clsx';
import {Icon, IconName} from './Icon';

interface IconButtonProps {
  icon: IconName;
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function IconButton({
  icon,
  onClick,
  title,
  className,
  disabled,
}: IconButtonProps) {
  return (
    <button
      title={title}
      className={clsx(
        styles.iconButton,
        className,
        disabled && styles.disabled,
      )}
      type="button"
      onClick={disabled ? null : onClick}
    >
      <Icon name={icon} />
    </button>
  );
}
