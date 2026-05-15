import {LogLevel, LogPayload} from '../app/index.js';
import experimentalFeatures from './__logs__/experimental-features.js';

export function experimentalLog(message: string, remarks?: string): LogPayload {
  return {
    level: LogLevel.Error,
    message,
    remarks: (remarks ?? '') + experimentalFeatures,
  };
}
