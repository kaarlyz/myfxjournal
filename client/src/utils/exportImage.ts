import { toPng } from 'html-to-image';

export async function exportElementAsPng(
  element: HTMLElement,
  filename: string,
  scale = 2
): Promise<void> {
  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: scale,
    backgroundColor: '#0b0e11',
    filter: (node) => {
      if (node instanceof HTMLElement && node.dataset.exportHide) return false;
      return true;
    },
  });
  const a = document.createElement('a');
  a.download = filename;
  a.href = dataUrl;
  a.click();
}

export function buildExportFilename(prefix: string, label: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const clean = label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 28);
  return `replayfx-${prefix}-${clean}-${date}.png`;
}
