import {useApplication} from '../../contexts';
import styles from './Versions.module.scss';

export function Versions() {
  const {project} = useApplication();
  const versions = {
    core: '0.0.0',
    ...(project.versions ?? {}),
  };

  return (
    <div className={styles.root}>
      <div
        title="Copy version information"
        className={styles.link}
        onClick={() => {
          const text = Object.entries(versions)
            .filter(([, version]) => !!version)
            .map(([name, version]) => `- ${name}: ${version}`)
            .join('\n');

          navigator.clipboard.writeText(text);
        }}
      >
        <code>{versions.core}</code>
      </div>
    </div>
  );
}
