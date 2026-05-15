import {useThread} from '../utils/index.js';
import {DependencyContext} from './DependencyContext.js';

export class DeferredEffectContext extends DependencyContext {
  private readonly unsubscribe;
  public constructor(private readonly callback: () => void) {
    super();
    this.unsubscribe = useThread().onDeferred.subscribe(this.update);
    this.markDirty();
  }

  private update = () => {
    if (this.event.isRaised()) {
      this.clearDependencies();
      this.startCollecting();
      this.callback();
      this.finishCollecting();
      this.event.reset();
    }
  };

  public dispose() {
    super.dispose();
    this.unsubscribe();
  }
}
