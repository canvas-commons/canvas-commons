import {HTMLAttributes} from 'preact/compat';

export function ChevronLeft(props: HTMLAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <polygon points="13.29 16.71 8.59 12 13.29 7.29 14.71 8.71 11.41 12 14.71 15.29 13.29 16.71" />
    </svg>
  );
}
