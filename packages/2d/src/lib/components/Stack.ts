import {nodeName} from '../decorators';
import {Layout, LayoutProps} from './Layout';

export interface HStackProps
  extends Omit<LayoutProps, 'layout' | 'direction'> {}

export interface VStackProps
  extends Omit<LayoutProps, 'layout' | 'direction'> {}

@nodeName('HStack')
export class HStack extends Layout {
  public constructor(props: HStackProps) {
    super({...props, layout: true, direction: 'row'});
  }
}

@nodeName('VStack')
export class VStack extends Layout {
  public constructor(props: VStackProps) {
    super({...props, layout: true, direction: 'column'});
  }
}
