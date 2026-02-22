// We're manually importing the icons here rather than using import.meta.glob
// to make the name property strongly typed.
// Most icons are from Material Icons (https://fonts.google.com/icons?icon.set=Material+Icons).
// When adding a new icon be sure to edit it to have fill="currentColor".

/* eslint-disable @typescript-eslint/naming-convention */
import canvas_commons from '../../img/icons/canvas_commons.svg?raw';
import account_tree from '../../img/icons/material/account_tree.svg?raw';
import bug from '../../img/icons/material/bug.svg?raw';
import chevron_right from '../../img/icons/material/chevron_right.svg?raw';
import clear from '../../img/icons/material/clear.svg?raw';
import close from '../../img/icons/material/close.svg?raw';
import colorize from '../../img/icons/material/colorize.svg?raw';
import drag_indicator from '../../img/icons/material/drag_indicator.svg?raw';
import fast_forward from '../../img/icons/material/fast_forward.svg?raw';
import fast_rewind from '../../img/icons/material/fast_rewind.svg?raw';
import fullscreen from '../../img/icons/material/fullscreen.svg?raw';
import grid from '../../img/icons/material/grid.svg?raw';
import hourglass_bottom from '../../img/icons/material/hourglass_bottom.svg?raw';
import locate from '../../img/icons/material/locate.svg?raw';
import movie from '../../img/icons/material/movie.svg?raw';
import open_in_new from '../../img/icons/material/open_in_new.svg?raw';
import pause from '../../img/icons/material/pause.svg?raw';
import photo_camera from '../../img/icons/material/photo_camera.svg?raw';
import play_arrow from '../../img/icons/material/play_arrow.svg?raw';
import recenter from '../../img/icons/material/recenter.svg?raw';
import repeat from '../../img/icons/material/repeat.svg?raw';
import school from '../../img/icons/material/school.svg?raw';
import science from '../../img/icons/material/science.svg?raw';
import settings from '../../img/icons/material/settings.svg?raw';
import skip_next from '../../img/icons/material/skip_next.svg?raw';
import skip_previous from '../../img/icons/material/skip_previous.svg?raw';
import video_settings from '../../img/icons/material/video_settings.svg?raw';
import videocam from '../../img/icons/material/videocam.svg?raw';
import volume_off from '../../img/icons/material/volume_off.svg?raw';
import volume_on from '../../img/icons/material/volume_on.svg?raw';

const ICONS = {
  account_tree,
  bug,
  canvas_commons,
  chevron_right,
  clear,
  close,
  colorize,
  drag_indicator,
  fast_forward,
  fast_rewind,
  fullscreen,
  grid,
  hourglass_bottom,
  locate,
  movie,
  open_in_new,
  pause,
  photo_camera,
  play_arrow,
  recenter,
  repeat,
  school,
  science,
  settings,
  skip_next,
  skip_previous,
  videocam,
  video_settings,
  volume_off,
  volume_on,
} as const;
/* eslint-enable @typescript-eslint/naming-convention */

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
}

export function Icon({name}: IconProps) {
  return <span dangerouslySetInnerHTML={{__html: ICONS[name]}} />;
}
