import {RefObject} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';

type UseHoverType<T extends HTMLElement> = [RefObject<T>, boolean];

export function useHover<T extends HTMLElement>(
  handleMouseOver?: () => void,
  handleMouseOut?: () => void,
): UseHoverType<T> {
  const [value, setValue] = useState(false);

  const ref = useRef<T>(null);

  const handleMouseOverWrapper = () => {
    setValue(true);
    handleMouseOver?.();
  };

  const handleMouseOutWrapper = () => {
    setValue(false);
    handleMouseOut?.();
  };

  useEffect(
    () => {
      const node = ref.current;
      if (node) {
        node.addEventListener('mouseenter', handleMouseOverWrapper);
        node.addEventListener('mouseleave', handleMouseOutWrapper);

        return () => {
          node.removeEventListener('mouseenter', handleMouseOverWrapper);
          node.removeEventListener('mouseleave', handleMouseOutWrapper);
        };
      }
    },
    [ref.current], // Recall only if ref changes
  );

  return [ref, value];
}
