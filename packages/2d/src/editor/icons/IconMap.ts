/* eslint-disable @typescript-eslint/naming-convention */

import {FunctionComponent} from 'preact';
import {CircleIcon} from './CircleIcon.js';
import {CodeIcon} from './CodeIcon.js';
import {CurveIcon} from './CurveIcon.js';
import {GridIcon} from './GridIcon.js';
import {ImgIcon} from './ImgIcon.js';
import {LayoutIcon} from './LayoutIcon.js';
import {LineIcon} from './LineIcon.js';
import {NodeIcon} from './NodeIcon.js';
import {RayIcon} from './RayIcon.js';
import {RectIcon} from './RectIcon.js';
import {ShapeIcon} from './ShapeIcon.js';
import {TxtIcon} from './TxtIcon.js';
import {VideoIcon} from './VideoIcon.js';
import {View2DIcon} from './View2DIcon.js';

export const IconMap: Record<string, FunctionComponent> = {
  Circle: CircleIcon,
  Code: CodeIcon,
  Curve: CurveIcon,
  Grid: GridIcon,
  Img: ImgIcon,
  Layout: LayoutIcon,
  Line: LineIcon,
  Node: NodeIcon,
  Ray: RayIcon,
  Rect: RectIcon,
  Shape: ShapeIcon,
  Txt: TxtIcon,
  TxtLeaf: TxtIcon,
  Video: VideoIcon,
  View2D: View2DIcon,
};
