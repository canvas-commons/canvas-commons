import {signal} from '@preact/signals';

export interface Inspection {
  key: string;
  payload: unknown;
}

export const inspectionSignal = signal<Inspection>({key: '', payload: null});
