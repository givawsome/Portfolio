// This legacy placeholder SVG has a 400 × 400 viewBox but omitted dimensions in the original import.
export function normalizeMedia(item) {
  if (item.id === 'acc8a004d929828e' && item.src === 'media/acc8a004d929828e.svg')
    return { ...item, width: item.width || 400, height: item.height || 400, ratio: 1 };
  return item;
}
