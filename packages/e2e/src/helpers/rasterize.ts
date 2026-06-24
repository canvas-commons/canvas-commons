import {Page} from 'playwright';

/**
 * Rasterizes an SVG string to PNG bytes in the browser, at the SVG's intrinsic
 * size. Drawing it through an `<img>` sandboxes it from document fonts and
 * external resources, so any non-default font has to be embedded in the SVG to
 * show up in the raster.
 */
export async function rasterizeSvg(page: Page, svg: string): Promise<Buffer> {
  const dataUrl = await page.evaluate(async svg => {
    const blob = new Blob([svg], {type: 'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('SVG failed to load as image'));
        image.src = url;
      });
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not acquire a 2D context for rasterization.');
      }
      context.drawImage(image, 0, 0, width, height);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  }, svg);

  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}
