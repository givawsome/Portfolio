import { normalizeMedia } from './media.js';
export const publicItem = (doc) => {
  const { _id, collectionId, published, order, ...rest } = normalizeMedia(doc);
  return { ...rest, ratio: rest.width / rest.height };
};
export async function readPortfolio(d) {
  const m = await d.collection('content').findOne({ _id: 'manifest' });
  if (!m) throw Object.assign(new Error('Import the portfolio first'), { status: 503 });
  const result = structuredClone(m.value);
  const counts = await d
    .collection('media')
    .aggregate([
      { $match: { published: true } },
      { $group: { _id: '$collectionId', count: { $sum: 1 } } },
    ])
    .toArray();
  const countMap = new Map(counts.map((row) => [row._id, row.count]));
  await Promise.all(
    Object.values(result.collections).map(async (c) => {
      c.count = countMap.get(c.id) || 0;
      c.preview = (
        await d
          .collection('media')
          .find({ collectionId: c.id, published: true })
          .sort({ order: 1, id: 1 })
          .limit(8)
          .toArray()
      ).map(publicItem);
      if (c.coverId) {
        const cover = await d
          .collection('media')
          .findOne({ collectionId: c.id, id: c.coverId, published: true, type: 'image' });
        c.cover = cover ? publicItem(cover) : c.preview[0];
      } else c.cover = c.preview[0];
      c.data = '/api/collections/' + c.id;
    }),
  );
  result.total = Object.values(result.collections).reduce((sum, c) => sum + c.count, 0);
  for (const key of Object.keys(result.hero || {})) {
    const ref = result.hero[key];
    const item = await d.collection('media').findOne({
      id: ref.id,
      ...(ref.collectionId ? { collectionId: ref.collectionId } : {}),
      published: true,
    });
    if (item) result.hero[key] = publicItem(item);
    else delete result.hero[key];
  }
  return result;
}
