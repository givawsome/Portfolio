# API

Public endpoints:

- GET `/api/health`: database readiness.
- GET `/api/portfolio`: categories, collection counts/previews, hero.
- GET `/api/collections/:id`: all published items in a collection, sorted by order then ID.
- GET `/api/settings`: public profile/contact settings.
- POST `/api/inquiries`: name, email, service, message, optional budget/timeline and empty honeypot `website`.

Authentication:

- POST `/api/auth/login`: email/password, sets HTTP-only cookie.
- GET `/api/auth/me`: requires session.
- POST `/api/auth/logout`: clears session.

All writes require Origin matching APP_ORIGIN. All `/api/admin/*` endpoints require a valid session.

- GET `/api/admin/manifest`: source configuration.
- PUT `/api/admin/collections/:id`: title, folder, frame, method, note.
- DELETE `/api/admin/collections/:id`: only empty, unreferenced collections.
- PUT `/api/admin/sections`: complete category array with id/title/subtitle/collections/featured. Array order is display order; removing a category leaves its collection data intact.
- GET `/api/admin/media?collectionId=...&page=1`: 48 items per page including drafts.
- PUT `/api/admin/media/:id`: id, collectionId, title, name, src, optional thumb, width, height, order, published; preserves supported archive metadata.
- DELETE `/api/admin/media/:collection/:id`: remove database entry only.
- GET/PUT `/api/admin/settings`: profile/contact/welcome fields defined in server/schemas.js.
- GET `/api/admin/inquiries`: newest 100 enquiries.
- PATCH `/api/admin/inquiries/:id`: status new/read/archived.
- POST `/api/admin/upload-signature`: direct Cloudinary upload parameters.

Responses are JSON. Validation errors return 400, unauthenticated access 401, incorrect Origin 403, dependency conflicts 409, throttling 429 and missing configuration 503. Internal errors omit database credentials and stack traces.

## Admin management additions

- `GET /api/admin/stats`: published/draft image totals and new enquiry count.
- `GET /api/admin/media?collectionId=...&page=1&q=...&status=draft`: escaped literal title/filename search and optional `draft`/`published` filter.
- `PATCH /api/admin/settings`: validated partial update for separate profile/contact/welcome forms.
- `DELETE /api/admin/hero/:slot`: remove a homepage slot, retaining the underlying image.
- `DELETE /api/admin/inquiries/:id`: delete a single enquiry; 404 if absent.

All routes require an authenticated session; all mutations require matching `APP_ORIGIN`.

## Journal and category media

- `GET /api/admin/media?categoryId=<id>&collectionId=<id>&q=<terms>&status=draft&page=1`: category/collection filters; search titles, filenames, tags and keywords. Collection is optional for browsing.
- Media PUT accepts `tags` (up to 30), `keywords` (up to 50), and `alt` in addition to existing image fields.
- `GET /api/blog?page=1`: published article summaries, 12 per page.
- `GET /api/blog/:slug`: published article; drafts/missing articles return 404.
- `GET /api/admin/posts?page=1`: private article list, 30 per page.
- `POST /api/admin/posts`, `PUT /api/admin/posts/:id`, `DELETE /api/admin/posts/:id`: authenticated journal CRUD. Slugs are unique; duplicate slug writes return 409.
