import styles from './Playback.module.scss';

import {useApplication} from '../../contexts';
import {GLOBAL_EDITOR_SHORTCUTS, useShortcuts} from '../../contexts/shortcuts';
import {usePlayerState} from '../../hooks';
import {IconButton, IconCheckbox, Input, Select, Slider} from '../controls';
import {Framerate} from './Framerate';

export function PlaybackControls() {
  const {player, renderer, meta, project} = useApplication();
  const state = usePlayerState();

  useShortcuts(GLOBAL_EDITOR_SHORTCUTS, {
    togglePlayback: () => player.togglePlayback(),
    previousFrame: () => player.requestPreviousFrame(),
    nextFrame: () => player.requestNextFrame(),
    firstFrame: () => player.requestReset(),
    lastFrame: () => player.requestSeek(Infinity),
    toggleAudio: () => player.toggleAudio(),
    toggleLoop: () => player.toggleLoop(),
    volumeUp: () => player.addAudioVolume(0.1),
    volumeDown: () => player.addAudioVolume(-0.1),
  });

  return (
    <div className={styles.controls}>
      <Select
        title="Playback speed"
        options={[
          {value: 0.25, text: 'x0.25'},
          {value: 0.5, text: 'x0.5'},
          {value: 1, text: 'x1'},
          {value: 1.5, text: 'x1.5'},
          {value: 2, text: 'x2'},
        ]}
        value={state.speed}
        onChange={speed => player.setSpeed(speed)}
      />
      <div className={styles.volumeTrigger}>
        <IconCheckbox
          iconOn="volume_on"
          titleOn="Mute audio [M]"
          iconOff="volume_off"
          titleOff="Unmute audio [M]"
          checked={!state.muted}
          onChange={value => player.toggleAudio(value)}
        />

        {!state.muted && (
          <div className={styles.volumeMargin}>
            <div className={styles.volume}>
              <Slider
                value={state.volume}
                onChange={volume => {
                  if (isNaN(volume)) {
                    volume = 0;
                  }
                  player.setAudioVolume(volume);
                }}
              />
            </div>
          </div>
        )}
      </div>
      <IconButton
        icon="skip_previous"
        title="Start [Shift + Left arrow]"
        onClick={() => player.requestReset()}
      />
      <IconButton
        icon="fast_rewind"
        title="Previous frame [Left arrow]"
        onClick={() => player.requestPreviousFrame()}
      />
      <IconCheckbox
        main
        iconOn="play_arrow"
        titleOn="Pause [Space]"
        iconOff="pause"
        titleOff="Play [Space]"
        checked={!state.paused}
        onChange={value => player.togglePlayback(value)}
      />
      <IconButton
        icon="fast_forward"
        title="Next frame [Right arrow]"
        onClick={() => player.requestNextFrame()}
      />
      <IconButton
        icon="skip_next"
        title="End [Shift + Right arrow]"
        onClick={() => player.requestSeek(Infinity)}
      />
      <IconCheckbox
        iconOn="repeat"
        titleOn="Disable looping [L]"
        iconOff="repeat"
        titleOff="Enable looping [L]"
        checked={state.loop}
        onChange={() => player.toggleLoop()}
      />
      <Framerate
        render={(framerate, paused) => (
          <Input
            title="Current framerate"
            readOnly
            value={paused ? 'PAUSED' : `${framerate} FPS`}
          />
        )}
      />
      <IconButton
        icon="photo_camera"
        title="Save snapshot"
        onClick={() =>
          renderer.renderFrame(
            {
              ...meta.getFullRenderingSettings(),
              name: project.name,
            },
            player.status.time,
          )
        }
      />
    </div>
  );
}
