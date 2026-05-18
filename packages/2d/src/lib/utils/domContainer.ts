let Container: HTMLDivElement | null = null;

export function getDomContainer(): HTMLDivElement {
  if (!Container) {
    Container = document.createElement('div');
    Container.style.position = 'fixed';
    Container.style.left = '-99999px';
    Container.style.top = '-99999px';
    Container.style.width = '0';
    Container.style.height = '0';
    Container.style.overflow = 'hidden';
    Container.style.visibility = 'hidden';
    document.body.appendChild(Container);
  }
  return Container;
}
