# Rajneesh portfolio platform

A separate, deployable Node.js + MongoDB project. The original `../portfolio` remains untouched.

## Structure

- `public/`: existing portfolio HTML, CSS, JavaScript and bundled images. Design retained; landscape frames have softly contoured mats without clipping the artwork.
- `admin/`: separate browser-based portfolio manager at `/admin/`.
- `server/`: Express API, database connection, authentication and validation.
- `api/index.js`: Vercel Function entry point.
- `seed/`: migration snapshot of all 12 categories, 48 collections and 4,261 original images.
- `scripts/`: controlled initial import and administrator creation/reset.
- `test/`: automated security, validation and public integration checks.

## Run locally, from a fresh checkout

### 1. Prerequisites and dependencies

Install Node.js 22+ and have a local MongoDB server running. MongoDB Compass is a database viewer; it does not start the MongoDB server for you.

Open a terminal in `portfolio-platform`, the folder containing `package.json`:

```sh
npm ci
cp .env.example .env
```

Copy the example only on first setup; do not overwrite an existing `.env`.

### 2. Configure your local environment

Edit `.env` with your local MongoDB URL. A typical configuration is:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=rajneesh_portfolio_local
APP_ORIGIN=http://localhost:3000
PORT=3000
NODE_ENV=development
AUTH_SECRET=YOUR_GENERATED_SECRET
ADMIN_ID=admin@50699
ADMIN_PASSWORD=YOUR_CHOSEN_PASSWORD
```

Generate the secret with the command below and paste its output into `AUTH_SECRET`:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Use a password of at least 8 characters. Credentials stay in the ignored `.env` file; do not put them in frontend code. If your MongoDB server requires authentication, use its authenticated connection URL. Keep the local database separate from production.

### 3. Import the portfolio and create your admin account

With MongoDB running, execute these in order:

```sh
npm run seed
npm run admin:create
```

The seed imports 12 categories, 48 collections and 4,261 entries and creates the indexes. It refuses to overwrite an existing imported manifest, so run it only once per database. Re-running `admin:create` for the same ID resets its password and revokes previous sessions.

After successful account creation, remove `ADMIN_ID` and `ADMIN_PASSWORD` from `.env`. Login uses the database's password hash, not these temporary setup values.

### 4. Start and open the app

```sh
npm run dev
```

- Portfolio: http://localhost:3000/
- Admin: http://localhost:3000/admin/
- Database status: http://localhost:3000/api/health

The health response should be `{"database":"connected"}`. Sign in with the ID and password used in step 3. No separate frontend server or build step is required. `npm start` also loads `.env`. Restart the server after changing backend code or environment settings; stop it with Ctrl+C.

Use **localhost** consistently in the browser because write requests must match `APP_ORIGIN`. If you change the port, update both `PORT` and `APP_ORIGIN`.

### 5. Verify before production

```sh
npm run format:check
npm run check
npm test
```

These checks cover formatting, JavaScript syntax, authentication guards, validation and public routes. They do not prove a live MongoDB or Cloudinary integration works. Complete this local browser checklist too:

1. Open category galleries and confirm the images load.
2. Sign in, edit an image title/order, reload the portfolio, and confirm the change. Restore the original values afterward.
3. Add a test image using an existing HTTPS image URL; save as draft, then publish it and check the gallery. Remove the test entry afterward.
4. Update profile text, verify it publicly, then restore it.
5. Submit a test enquiry with a message of at least 10 characters. Confirm it reaches the admin inbox and can be marked read.
6. Restart the app and verify changes persist. Sign out and confirm the admin API requires sign-in.

Cloudinary is optional for local setup. Existing bundled images and HTTPS image URLs work without it; file uploads require the three Cloudinary settings described below.

### Troubleshooting

- **Database connection fails:** confirm MongoDB is running and the host, port, credentials and database URL are correct.
- **Database not configured:** check `.env` is in this project root and restart the server.
- **Origin not allowed:** open exactly the origin specified in `APP_ORIGIN` (including port).
- **Invalid admin ID or password:** check you created the admin in the same database the app uses. Run `admin:create` again to reset it.
- **Port already in use:** stop the previous local server or change both port settings.
- **Already imported:** the seed has already run; continue to account creation/startup. Do not delete your database to fix this message.

Without a MongoDB URI, development can display the bundled snapshot, but admin sign-in and enquiries cannot save. Production has no snapshot fallback.

## Formatting and cleanup

Run `npm run format` after editing; run `npm run format:check` before sharing changes. Prettier settings and `.editorconfig` keep JavaScript, HTML, CSS and documentation consistent. Generated seed snapshots and binary artwork are excluded from formatting.

Removed the obsolete admin preview screenshot and duplicate `public/portfolio.json` / `public/collections/` snapshots. Their URLs are already handled by the backend using MongoDB or the canonical `seed/` files. Keep `seed/`, `public/media/`, `package-lock.json`, tests and the deployment configuration. `node_modules/` is locally installed and ignored; regenerate it with `npm ci` rather than committing or uploading it.

## Deploy the whole project to Vercel

Choose **this folder** as the project's root directory. This is an Express application; no Next.js rewrite is necessary to preserve the approved design. `vercel.json` routes public pages, admin and API to the Node handler and includes the bundled media. No long-running listener is started inside the Function.

Set `MONGODB_URI`, `MONGODB_DB`, `AUTH_SECRET`, `APP_ORIGIN` (the exact final HTTPS site origin), and `NODE_ENV=production` in Vercel. Configure Atlas to accept the deployment's connections using your chosen network access policy. For production, run the one-time seed/admin commands against your separate production database, then configure Vercel to use that database. A localhost MongoDB URL cannot reach your laptop from Vercel. Do not set the temporary admin bootstrap password in Vercel.

Run `npm run check` and `npm test` before deployment. After deployment verify `/api/health`, admin login, draft/publish, gallery refresh and a test enquiry. For preview deployments, set APP_ORIGIN to that preview's actual origin; writes from other origins are intentionally rejected.

No credentials or external deployment have been created. Live database and media-provider integration need your account configuration.

## Uploads

Existing images ship as static assets. **New uploads go directly from the authenticated admin browser to Cloudinary**, avoiding Vercel's ephemeral filesystem and request-body limits. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` only on the server. The browser receives a short-lived signed request for a unique asset ID. Only save an image after its upload completes. Alternatively paste an existing HTTPS image URL.

Removing a portfolio entry does not delete the original from Cloudinary. This avoids accidental irreversible asset loss; provider cleanup remains an explicit account action. Uploaded images default to draft until published. Archive sprite-sheet entries are retained but cannot be edited as standalone photos; add a new image instead.

## Admin workflow

The manager at `/admin/` has a persistent sidebar and independent, bookmarkable screens:

- `#dashboard`: live published/draft totals, category and collection counts, and new enquiries.
- `#categories`: create, edit, delete and reorder categories using forms, collection checkboxes and a featured-collection selector. Deleting a category keeps its underlying work. At least one category must remain.
- `#collections`: create and edit collections, open their images, or delete an empty collection after removing category references. IDs remain stable when editing.
- `#media`: browse by collection, search by title/filename, filter drafts/published work, paginate, add/edit/delete entries, and publish/unpublish. Archive entries support metadata updates without losing contact-sheet information.
- `#hero`: review the three homepage artworks and remove a slot. To replace a slot, open an image in Media library and select its hero position. Only saved, published standalone images qualify.
- `#profile`: edit the introduction and biography.
- `#contact`: edit email, phone and social links independently of profile content.
- `#welcome`: edit the timed welcome message.
- `#inquiries`: read client briefs, change status to new/read/archived, and delete enquiries with confirmation. The screen shows the newest 100 messages. Enquiries are created by the public contact form.

Settings screens save only their own fields. Image removal retains original files; deleting an enquiry removes that database record permanently. Cloudinary must be configured for new file uploads; existing HTTPS image URLs work without it.

After updating admin/backend files, restart `npm run dev` and refresh `/admin/`. No database reset or repeated seed is needed. The admin UI is responsive; navigation becomes horizontally scrollable on small screens. No public portfolio redesign is included in this admin update.

## Security and operating limits

Admin passwords use salted scrypt. Sessions use expiring signed HTTP-only, SameSite=Strict cookies (Secure in production). Server-side auth protects every admin endpoint; origin validation protects writes. Mongo-backed rate limits survive serverless restarts. Inputs use Zod allowlists and HTML is never injected from admin text. Setup creates unique/TTL indexes. APP_ORIGIN and the session secret must be configured before sign-in works.

This is an owner-admin application, not a multi-tenant CMS. Password recovery is a local operator command, not an email flow. Keep secrets rotated and back up Atlas before substantial content edits. No database credentials are included in this project.

## Current phases

**Implemented:** backend foundation; authentication; categories/collections/media API; direct-upload signing; separate admin interface; public content integration; enquiry inbox; migration scripts; configuration and tests.

**Requires your accounts to verify:** Cloudinary uploads and actual Vercel deployment. Local MongoDB sign-in, collection/media CRUD and nonempty collection deletion protection were verified during the admin update. These cannot be claimed as tested until configured.

**Later refinements:** drag-and-drop category ordering (currently Move up/Move down controls), richer hero/about layout controls, email notifications, audit history and undo, upload cleanup, and multi-admin roles if needed.

## References

- Express on Vercel: https://vercel.com/docs/frameworks/backend/express
- MongoDB connection pooling: https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/

## Complete content management (review update)

The About editor now controls its image (library picker, HTTPS URL or Cloudinary upload), alt text, introduction, both biography paragraphs, expandable biography sections, facts, captions and tools. Other content screens manage homepage copy, services, process steps, brand/SEO, contact and welcome timing. Repeatable sections support add/remove/reorder. Empty optional values clear the corresponding content.

`shared/content-config.json` defines editable fields and original defaults. The backend validates those fields; `public/content.js` renders them safely. Existing settings override defaults without replacing your imported content. Saves are read back to verify persistence. Homepage artwork can be chosen directly from the library.

Run `npm run migrate` after updating an existing installation. This repairs one imported placeholder SVG's missing dimensions and ensures indexes; it does not re-seed the database. Restart the old server once with `npm run dev`; development now watches backend changes automatically. The admin reports when it detects an older running backend.

Validation commands:

```sh
npm run format:check
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

The browser test requires local MongoDB. It creates a uniquely named temporary database, tests sign-in, navigation, About image and biography persistence, public rendering, contact/services/welcome/homepage updates, media CRUD and mobile overflow, then deletes only that test database. Screenshots are saved under `/tmp/portfolio-review/`. It never uses your configured portfolio database for test edits. Cloudinary uploads still require your provider credentials and are not covered by this local browser test.
