export const seoDefaults = Object.freeze({
  title: 'Rajneesh Vaishnav | Designer, Photographer & AI Creative',
  description:
    'Freelance graphic design, product photography and AI art direction by Rajneesh Vaishnav. Based in Jaipur, working with brands across India and worldwide.',
});
export const categorySEO = Object.freeze({
  'ai-campaigns': {
    title: 'AI Campaign Design & Advertising Concepts',
    description:
      'Explore AI-assisted advertising campaigns by Rajneesh Vaishnav: art direction, hero banners and creative brand concepts for digital campaigns.',
    keywords: ['AI campaign designer', 'AI advertising design', 'creative campaign banners'],
  },
  'imagined-worlds': {
    title: 'AI Art & Surreal Visual Storytelling',
    description:
      'Cinematic AI art, surreal environments and imagined worlds by Rajneesh Vaishnav. Explore original visual storytelling and creative concept development.',
    keywords: ['AI artist portfolio', 'surreal AI art', 'AI visual storytelling'],
  },
  'character-stories': {
    title: 'AI Character Design & Reference Sheets',
    description:
      'Explore original character concepts, reference sheets and expression studies by Rajneesh Vaishnav. Browse each character’s collection and visual story.',
    keywords: ['AI character designer', 'character reference sheets', 'character design portfolio'],
  },
  'brand-identities': {
    title: 'Logo Design & Brand Identity Portfolio',
    description:
      'Discover logo concepts, visual identities and creative brand systems by freelance designer Rajneesh Vaishnav, available for clients in India and worldwide.',
    keywords: ['freelance logo designer', 'brand identity designer', 'logo design portfolio'],
  },
  'product-stories': {
    title: 'Product Advertising & Creative Detail Design',
    description:
      'Product advertising concepts, detail visuals and creative e-commerce artwork by Rajneesh Vaishnav. Explore carefully directed product stories and layouts.',
    keywords: [
      'product advertising designer',
      'product detail image design',
      'e-commerce creative design',
    ],
  },
  photography: {
    title: 'Product Photography & Retouching Portfolio',
    description:
      'Product photography and retouching by Rajneesh Vaishnav, based in Jaipur. Explore e-commerce imagery, product lighting and carefully crafted commercial visuals.',
    keywords: [
      'product photographer Jaipur',
      'e-commerce product photography',
      'product retouching services',
    ],
  },
  'digital-experiences': {
    title: 'Figma UI Design & Website Design Portfolio',
    description:
      'Explore Figma UI concepts, website layouts and digital design by Rajneesh Vaishnav, a freelance visual designer working with clients in India and worldwide.',
    keywords: ['freelance Figma designer', 'website UI designer', 'Figma portfolio'],
  },
  'art-studies': {
    title: 'Paintings, Illustration & Art Studies',
    description:
      'Explore paintings, illustrations and personal art studies in Rajneesh Vaishnav’s visual portfolio, alongside photography, graphic design and AI-assisted concepts.',
    keywords: ['painting portfolio', 'illustration portfolio', 'visual artist Jaipur'],
  },
  'sns-photoshop': {
    title: 'Social Media Design & Photoshop Portfolio',
    description:
      'Handcrafted social media posts, Photoshop compositions and digital creatives by Rajneesh Vaishnav. Explore design work curated separately from AI-generated concepts.',
    keywords: ['social media post designer', 'Photoshop designer', 'freelance social media design'],
  },
});
export function sectionSEO(section, collection, settings = {}) {
  const base = categorySEO[section.id] || {
    title: section.title,
    description:
      section.subtitle ||
      `Explore ${section.title} in ${settings.seoName || 'Rajneesh Vaishnav'}’s creative portfolio.`,
    keywords: [],
  };
  if (collection?.character)
    return {
      title: `${collection.title} | Character Design by ${settings.seoName || 'Rajneesh Vaishnav'}`,
      description:
        `Explore ${collection.title}: character artwork and visual studies by ${settings.seoName || 'Rajneesh Vaishnav'}. ${collection.note || section.subtitle || ''}`.slice(
          0,
          300,
        ),
    };
  return {
    title: section.seoTitle || `${base.title} | ${settings.seoName || 'Rajneesh Vaishnav'}`,
    description: section.seoDescription || base.description,
  };
}
export function galleryPath(section, collection) {
  return (
    '/work/' +
    encodeURIComponent(section) +
    (collection ? '/' + encodeURIComponent(collection) : '')
  );
}
export function siteOrigin(settings = {}) {
  const value =
    settings.publicSiteUrl ||
    process.env.APP_ORIGIN ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : 'http://localhost:3000');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol))
    throw Error('Configure a valid public site origin');
  return url.origin;
}
export const jsonForHTML = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
export const publicAsset = (src) =>
  /^https:\/\/[^\s<>"']+$/.test(src || '')
    ? src
    : /^media\/[a-zA-Z0-9_.-]+$/.test(src || '')
      ? '/' + src
      : '';
