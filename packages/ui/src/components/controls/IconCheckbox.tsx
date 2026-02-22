import styles from './Controls.module.scss';

import clsx from 'clsx';
import {IconName} from './Icon';
import {IconButton} from './IconButton';

interface IconCheckboxProps {
  iconOn: IconName;
  iconOff: IconName;
  titleOn?: string;
  titleOff?: string;
  onChange?: (value: boolean) => void;
  checked?: boolean;
  main?: boolean;
}

export function IconCheckbox({
  iconOn,
  iconOff,
  titleOn,
  titleOff,
  onChange,
  checked = false,
  main = false,
}: IconCheckboxProps) {
  return (
    <IconButton
      icon={checked ? iconOn : iconOff}
      className={clsx(
        styles.iconCheckbox,
        main && styles.main,
        checked && styles.checked,
      )}
      title={titleOff && !checked ? titleOff : titleOn}
      onClick={() => onChange?.(!checked)}
    />
  );
}
