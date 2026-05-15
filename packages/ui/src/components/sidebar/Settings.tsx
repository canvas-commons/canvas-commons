import {useApplication} from '../../contexts/index.js';
import {Expandable} from '../fields/index.js';
import {MetaFieldView} from '../meta/index.js';
import {Pane} from '../tabs/index.js';

export function Settings() {
  const {settings} = useApplication();

  return (
    <Pane title="Settings" id="app-settings-pane">
      <Expandable title={settings.appearance.name} open>
        <MetaFieldView field={settings.appearance} />
      </Expandable>
      <Expandable title={settings.defaults.name}>
        <MetaFieldView field={settings.defaults} />
      </Expandable>
    </Pane>
  );
}
