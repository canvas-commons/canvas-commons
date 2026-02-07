import type {
  LabeledPreset,
  Preset,
  VariableType,
} from '@canvas-commons/core/lib/scenes/editableVariables';
import styles from './Controls.module.scss';

function resolvePreset<T>(preset: Preset<T>): {label: string; value: T} {
  if (typeof preset === 'object' && preset !== null && 'label' in preset) {
    const labeled = preset as LabeledPreset<T>;
    return {label: labeled.label, value: labeled.value};
  }
  return {label: String(preset), value: preset as T};
}

interface PresetPickerProps {
  presets: Preset<unknown>[];
  type: VariableType;
  onSelect: (value: unknown) => void;
  onPreview?: (value: unknown) => void;
  onPreviewEnd?: () => void;
}

export function PresetPicker({
  presets,
  type,
  onSelect,
  onPreview,
  onPreviewEnd,
}: PresetPickerProps) {
  return (
    <div className={styles.presetRow}>
      {presets.map((preset, i) => {
        const {label, value} = resolvePreset(preset);
        const isColor = type === 'color' && typeof value === 'string';
        return (
          <button
            key={i}
            className={styles.presetChip}
            title={label}
            onPointerEnter={() => onPreview?.(value)}
            onPointerLeave={() => onPreviewEnd?.()}
            onClick={() => onSelect(value)}
          >
            {isColor ? (
              <div
                className={styles.presetSwatch}
                style={{backgroundColor: value}}
              />
            ) : (
              label
            )}
          </button>
        );
      })}
    </div>
  );
}
