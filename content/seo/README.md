# Portfolio SEO — India and international clients

The primary audience is brands hiring a freelance graphic designer, product photographer or AI creative. Jaipur is the actual base; the site does not invent overseas offices, client outcomes, reviews or awards. Keyword targets are relevant topics, not measured search volumes or promised rankings. See `keyword-map.json` for the homepage and nine category plans.

The portfolio now sends its real content and gallery images in the initial HTML, using the same rendering code as the interactive frontend. Clean `/work/<category>` URLs have distinct titles, descriptions, canonicals, social previews and Person / WebSite / CollectionPage / BreadcrumbList structured data. Legacy `/?work=...` links redirect permanently to the corresponding page. Invalid collections return 404, and empty collections are noindexed. The visual design and interactive features are retained.

The Journal already renders article text on the server. Its metadata now includes topic-specific descriptions, full professional identity, article topics and word counts. Article text remains unchanged. The XML sitemap covers populated categories, character collections, Journal topics, articles and their images. It uses real article edit timestamps rather than inventing daily changes. Public rendering endpoints remain crawlable; admin/auth/inquiry endpoints are blocked, and API/admin responses carry noindex headers.

Image tags and keywords classify actual work. Descriptive existing alt text is retained; blank or filename-only alt text receives a concise title and category description. This does not pretend to describe unseen visual details. AI concepts stay separate from real photography and Photoshop work.

## Management and release

- Admin → Brand & SEO: homepage search title and description, full professional name, canonical site URL, sharing image, focus terms and verification tokens.
- Admin → Categories → Edit: per-category search title, description and focus terms.
- Admin → Media library: title, descriptive alt text, tags and keywords for each image.
- Admin → Journal: article title, excerpt, cover description, tags and content.

`node --env-file=.env.production scripts/apply-seo.js` previews the metadata migration. Add `--apply` to save it with a private recovery backup. It preserves artwork and article content. `node scripts/audit-seo.js <public-origin>` checks sitemap URLs and saves results to `live-audit.json`. Unit and isolated browser tests also check server-rendered content, redirects, client navigation and no-JavaScript browsing.

Keep the canonical public origin on the currently connected Vercel domain until the custom domain is connected and working. When moving to the owned primary domain, update APP_ORIGIN and the canonical URL together, configure Vercel's redirects, recheck links and verify the new domain in Search Console.

## Search Console and ongoing work

On 5 November 2026, Google verified `soultouch92@gmail.com` as the owner of the current Vercel URL-prefix property using the managed HTML verification tag. The sitemap was submitted and Google reported “Sitemap processed successfully”, with 36 discovered pages. Keep the verification tag in the homepage settings. Search performance reports are still processing for this new property. The work Google account was not used for ownership. The live audit verified 36 URLs and 240 image entries without errors; see `live-audit.json`.

After verification, submit the sitemap and inspect the homepage, the three most important commercial categories and a Journal article. Monitor clicks, impressions, queries, indexed pages and any security/manual-action reports. Improve the pages using actual query and enquiry data rather than adding repeated keywords.

Add real project case studies with your role, design constraints, original process imagery and outcomes you can substantiate. Earn relevant links through real client credits and professional profiles. Maintain descriptive image titles and alt text during future uploads. No implementation can guarantee a ranking or a number of visits.

## Primary references

- [Google: supported metadata and ignored meta-keywords](https://developers.google.com/search/docs/crawling-indexing/special-tags)
- [Google: JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: image SEO](https://developers.google.com/search/docs/appearance/google-images)
- [Google: article structured data](https://developers.google.com/search/docs/appearance/structured-data/article)
