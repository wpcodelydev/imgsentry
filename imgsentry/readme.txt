=== ImgSentry - Image Optimizer & Media Cleaner ===
Contributors: wpcodelydev
Tags: image optimizer, compress images, webp, media cleaner, picture optimizer
Requires at least: 5.8
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

Optimize and compress images, convert to WebP and AVIF, and clean up unused and duplicate files in your WordPress media library.

== Description ==

ImgSentry makes your WordPress site lighter and tidier. It compresses your images, converts them to WebP and AVIF, and shows you which files in your media library are in use, which are duplicates, and which you can safely remove.

Most sites collect thousands of images over the years: old uploads, resized copies and forgotten duplicates. ImgSentry helps you shrink the images you keep and clear out the ones you no longer need, all from one dashboard.

= Image optimization =
* Compress JPEG, PNG, GIF, WebP and AVIF images, one at a time or in bulk.
* Pick a compression level: lossless, balanced or aggressive.
* Convert images to WebP or AVIF to reduce file size.
* Optimize images automatically when you upload them (turn this on in the settings). Each optimized image counts toward your monthly allowance.
* Keep or remove image metadata.
* Your original file is backed up before optimization, so you can restore it later.
* See how much disk space you saved.

= Media cleanup =
* Scan your site to find media files that are not used anywhere.
* The scanner checks post and page content, featured images, WooCommerce product galleries, Elementor, Beaver Builder, Divi and WPBakery content, ACF and custom image fields, logo, header and background images, and widgets.
* Safety labels show when a file is used as your site logo, header, background or featured image.
* Find duplicate images, including near-identical copies.
* Move files to the Trash first. Nothing is removed from your server until you delete it permanently.
* Restore trashed files with one click.
* Exclude folders and files you always want to keep.
* Export reports and review an activity log of every action.
* Schedule recurring scans, and let ImgSentry move old unused files to the Trash for you after each scheduled scan (Business and Professional plans).
* Choose which user roles can open the plugin pages.

= Free and paid plans =
The free version includes image optimization (also automatically on upload) with WebP and AVIF delivery and a CDN address for Next-Gen images, the media scanner, Trash and restore, the duplicate finder, reports and the activity log.

The paid plans (Business and Professional) add scheduled scans, automatic moving of unused files to the Trash after each scheduled scan, bulk actions in the Trash, scheduled auto-delete of the Trash, replacing the references of duplicate images, Media Trends with daily snapshots, the scan webhook, and optimizing on your own site while the optimization server is unreachable. The Professional plan also includes the Advance File Manager. The monthly optimization allowance differs by plan (see "Optimization allowance" below). See all plans at https://wpcodely.com/plugin/imgsentry/

= Your images and privacy =
Image optimization runs on the ImgSentry optimization server, and only the images you choose to optimize are sent there. The scanner, duplicate finder and Trash run on your own server. Please read the "External services" section below for the full details.

= Optimization allowance =
Optimizing images on the ImgSentry optimization server has a monthly allowance. The free plan allows 500 image files or 300 MB per month, whichever is reached first (every image size counts as one file). Business allows 10,000 files or 4 GB per month, and Professional has no limit (fair use). Only successful optimizations are counted. When the allowance is used up, optimization pauses until your next monthly cycle starts; everything else in the plugin keeps working. The scanner, duplicate finder and Trash have no limit on any plan.

= Source code and build instructions =
The admin screens are built with React/TypeScript. The compiled (minified) files shipped in this plugin are in the `build/` folder (`build/assets/plugin.js` and `build/assets/plugin.css`). The complete, human-readable source code is public at: https://github.com/wpcodelydev/imgsentry
To rebuild the compiled files from source: 1) install Node.js 18 or newer, 2) run `npm ci`, 3) run `npm run build`. The build writes its output to `imgsentry/build/`.

== Installation ==

1. Upload the `imgsentry` folder to the `/wp-content/plugins/` directory, or upload the `.zip` file from **Plugins > Add New > Upload Plugin**.
2. Activate the plugin from the **Plugins** menu in WordPress.
3. Open **ImgSentry** in the WordPress admin sidebar.
4. To optimize images, connect your free ImgSentry account when the plugin asks (the connection is handled by Freemius). You can skip this step: the scanner, duplicate finder and Trash work without an account.

== Frequently Asked Questions ==

= How do I optimize images in WordPress with ImgSentry? =
Connect your free ImgSentry account, open the optimization screen, choose the images you want and start the process. To optimize new uploads automatically, turn on automatic optimization in the plugin settings. Each optimized image counts toward your monthly allowance.

= How do I compress images without losing quality? =
Choose the lossless level to reduce file size without changing how the image looks. The balanced level gives a smaller file with very little visible difference, and the aggressive level gives the smallest files. ImgSentry backs up your original before it optimizes, so you can restore it at any time.

= Can ImgSentry convert images to WebP and AVIF? =
Yes. You can create WebP or AVIF versions of your images. Turn on the next-gen delivery option in the settings and browsers that support WebP or AVIF get the smaller file automatically. You choose how the file is delivered: with rewrite rules (Apache and LiteSpeed servers; the page code is not changed) or with <picture> tags in the page. If you use a CDN, choose the <picture> tags option and enter your CDN address.

= Does ImgSentry change my .htaccess file? =
Only if you choose "Use rewrite rules" for next-gen delivery, and only after you save that setting. ImgSentry then adds one block of lines between "# BEGIN ImgSentry" and "# END ImgSentry" and does not touch anything outside it. The block is removed when you switch the option off, deactivate the plugin or delete it. If the file cannot be edited, ImgSentry shows a message and makes no change; the <picture> tags option still works.

= Why does PageSpeed Insights say "Serve images in next-gen formats"? =
This message appears when your pages load JPEG or PNG files that could be smaller as WebP or AVIF. Converting your images with ImgSentry addresses this audit. Your final score also depends on your theme, hosting and other plugins.

= Which image formats can I optimize? =
JPEG, PNG, GIF, WebP and AVIF.

= How many images can I optimize? =
The free plan allows 500 image files or 300 MB per month, whichever comes first. Business allows 10,000 files or 4 GB per month. Professional has no limit (fair use). Each image size counts as one file. Optimization is not available on local, test or staging sites.

= What is the maximum image size? =
Images up to 20 MB can be optimized on the ImgSentry optimization server.

= Do I need an account to use ImgSentry? =
Image optimization needs a free ImgSentry account, which you connect from the plugin. The media scanner, duplicate finder, Trash and reports work without an account.

= Does ImgSentry send my images to another server? =
When you optimize images, the files you selected are sent to the ImgSentry optimization server, processed and returned to your site. Nothing else from your media library is sent. The scanner, duplicate finder and Trash run on your own server. See the "External services" section for the exact data and policy links.

= What happens if the optimization server is not available? =
ImgSentry retries for a few minutes. If the server is still unreachable, optimization pauses and the plugin shows a message; try again later. On the Business and Professional plans you can turn on a setting that lets ImgSentry optimize on your own server using GD or Imagick while the server is down, up to a daily limit you can change (200 images by default). That local option is not used when your allowance is used up or your license is not active.

= What happens when I use up my optimization allowance? =
Optimization pauses until your allowance renews or you upgrade your plan. The scanner, duplicate finder and Trash keep working.

= Does ImgSentry delete or replace my original images? =
No. Before an image is optimized, ImgSentry saves a backup of the original, and you can restore it from the plugin. Backups stay until you delete them, or you can set them to expire after 30 or 90 days.

= How do I find unused images in WordPress? =
Run a scan from ImgSentry. It checks your posts, pages, featured images, WooCommerce galleries, page builder content, custom fields, widgets and theme images, then lists the files it could not find in use.

= Is it safe to delete unused images? =
ImgSentry checks many places, but no tool can see every custom setup. That is why files go to the Trash first instead of being deleted. Review the list, keep a backup of your site, and delete permanently only when you are sure.

= Does moving a file to the Trash delete it from my server? =
No. Moving a file to the Trash hides it from your active Media Library and keeps the file on disk. It stays there until you restore it or delete it permanently. Paid plans can also delete Trash items automatically after a number of days you choose.

= Can ImgSentry scan my media library automatically? =
Yes, on the Business and Professional plans. Turn on **Enable Scheduled Scan** in the settings, then choose how often it runs (every 7, 15, 30 or 60 days) and at what time. You can also turn on **Auto-Trash Unused Files** so that unused files older than the minimum age you set are moved to the Trash after each scheduled scan. Files in the Trash can still be restored. On the free plan you can run a scan yourself at any time.

= Can I restore a file from the Trash? =
Yes. Open the **Trash Bin** tab, find the file and click **Restore**.

= How does the duplicate finder work? =
It compares your images using exact and visual (perceptual) matching, so it can find identical files and near-identical copies.

= What is the difference between the free and paid plans? =
The paid plans (Business and Professional) add scheduled scans, Auto-Trash of unused files, bulk Trash actions, scheduled auto-delete of the Trash, replacing the references of duplicate images, Media Trends with daily snapshots, the scan webhook, and optimizing on your own site while the optimization server is unreachable. The Professional plan also includes the Advance File Manager. See https://wpcodely.com/plugin/imgsentry/ for current plans and optimization allowances.

== Third-party libraries ==

This plugin bundles the following open-source software:

* **Action Scheduler** (v3.8.2, GPLv3): background task and queue runner developed by Automattic. Located in `lib/action-scheduler/`.
* **PHP Cron Expression Parser** (MIT License): cron expression parsing library bundled inside Action Scheduler. Located in `lib/action-scheduler/lib/cron-expression/`.
* **Freemius WordPress SDK** (v2.13.5, GPLv3): handles the optional account connection, licensing and updates. Located in `vendor/freemius/`. See "External services" below.
* **Inter** and **Red Hat Display** fonts (SIL Open Font License 1.1): served locally from `assets/fonts/`.
* **CodeMirror** (v5.65.13, MIT License): code editor used by the Advance File Manager. It is included only in the paid version of the plugin.

For complete license notices, see `THIRD-PARTY-LICENSES.txt` in the plugin folder.

== External services ==

ImgSentry connects to two external services, and it can also send an optional notification to a web address that you enter yourself. All three are described below.

**1. ImgSentry optimization server (https://api.wpcodely.com)**
* What it is used for: optimizing and converting your images. All plans (Free, Business and Professional) use it.
* When data is sent: only when you optimize images (individually, in bulk, or automatically on upload if you turned that on), and when the plugin checks your plan and remaining optimization allowance. Scanning, duplicate detection and Trash never contact this server.
* What data is sent: the image files you chose to optimize, the optimization settings you selected (output format, compression level and whether to keep metadata), your site domain, the plugin version, your installation ID, and an authentication token for your installation (your license key on paid plans). On the paid plans, if images were optimized locally while the server was unavailable, the number of those images is reported later so your allowance stays accurate.
* What is returned: the optimized image files and your allowance status.
* Service provider: WPCodely. Terms of Service: https://wpcodely.com/terms-of-service/ - Privacy Policy: https://wpcodely.com/privacy-policy/

**2. Freemius (https://freemius.com)**
* What it is used for: connecting your free ImgSentry account, activating and verifying paid licenses (Business and Professional plans), and delivering plugin updates.
* When data is sent: only after you choose to connect your account (the "Allow & Continue" button on the opt-in screen), when you activate a license key, or when you open the Account page. You can click "Skip" on the opt-in screen. Image optimization needs a connected account, and all other features work without one.
* What data is sent: the information shown on the opt-in screen before you agree, such as your WordPress admin name and email address, your site URL and title, WordPress, PHP and plugin versions, and your site language. License keys are sent when you activate a license.
* Service provider: Freemius, Inc. Terms of Service: https://freemius.com/terms/ - Privacy Policy: https://freemius.com/privacy/

**3. Scan webhook (optional, off by default, address entered by you)**
* What it is used for: telling another service of your choice (for example a chat tool or your own server) that a scan has finished. It is a Business and Professional feature, and it does nothing unless you enter a web address in the plugin settings.
* When data is sent: after each completed scan, and when you click the test button in the settings. Only HTTPS addresses are accepted, and addresses that point to private or local networks are refused.
* What data is sent: the event name (`scan.completed` or `webhook.test`), your site URL, the scan type and what started it, the number of used and unused files, the total size of the unused files, and a timestamp. If you set a secret, each request is signed with it (the secret itself is never sent). No images, file names or personal data are sent.
* Service provider: whichever service owns the address you enter. ImgSentry does not control it. Please read that service's own terms and privacy policy.



Other network behavior:
* **No external scripts, styles or web fonts** are loaded from outside CDNs. All assets are bundled and served from the plugin folder.
* **Internal loopback requests**: for background task processing, the plugin sends local non-blocking HTTP requests to your own site's `admin-ajax.php`.

== Changelog ==

= 1.0.0 =
* Initial release.