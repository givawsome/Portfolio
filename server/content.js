import config from '../shared/content-config.json' with { type: 'json' };
export { config };
export const contentDefaults = Object.fromEntries(
  [...config.fields, ...config.lists].map((field) => [field.key, field.default]),
);
export async function readSettings(database) {
  const stored = database
    ? await database.collection('content').findOne({ _id: 'settings' })
    : null;
  return { ...structuredClone(contentDefaults), ...stored?.value };
}
