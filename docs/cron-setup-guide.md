# Setting Up Reliable Background Tasks (WP-Cron)

## 1. Understanding WP-Cron and Low-Traffic Limitations

WordPress relies on a pseudo-cron system known as **WP-Cron** to handle scheduled and background tasks automatically. In ImgSentry, WP-Cron powers critical background automation such as:
- **Scheduled Background Scans** (`imgsentry_scheduled_scan`)
- **Automated Trash Auto-Purge** (`imgsentry_auto_purge_trash`)
- **Daily Reports & Statistics Snapshots** (`imgsentry_daily_snapshot_event`)
- **Unused Storage & Limit Alerts**

### How WP-Cron Works (and Why It Can Fail)
Unlike real operating system cron jobs that execute on a strict time schedule, standard WP-Cron **does not run continuously in the background**. Instead, WordPress triggers WP-Cron *only when a visitor or administrator loads a page on your site*. 

On **low-traffic websites**, this creates a significant reliability issue:
* If no visitor visits your site for 12 hours, scheduled tasks will not run for 12 hours.
* If a scan or heavy cleanup task is overdue, it will only attempt to execute when someone happens to browse your site, which can cause unexpected page load slowdowns for that visitor.

To ensure your media cleanups, daily snapshots, and automated scans run reliably and punctually without relying on visitor traffic, you should set up a **real system cron job** on your hosting server.

---

## 2. Setting Up a Real Server Cron Job

Below are step-by-step instructions for configuring a true system cron job across different hosting environments.

### Recommended Cron Interval
Set your cron job to run **every 15 minutes** (`*/15 * * * *`). This ensures your scheduled hooks execute close to their scheduled times while maintaining minimal server resource usage.

---

### Scenario A: cPanel Hosting
1. Log in to your cPanel control panel.
2. Scroll down to the **Advanced** section and click on **Cron Jobs**.
3. In the **Add New Cron Job** section:
   - **Common Settings**: Select `Twice An Hour` or `Once Per 15 Minutes` (`*/15 * * * *`).
   - **Command**: Enter the following command (replace `https://example.com` with your actual website URL):
     ```bash
     wget -q -O - https://example.com/wp-cron.php?doing_wp_cron >/dev/null 2>&1
     ```
     *(Alternatively, if `wget` is disabled on your host, use: `curl -s https://example.com/wp-cron.php?doing_wp_cron >/dev/null 2>&1`)*
4. Click **Add New Cron Job**.

---

### Scenario B: Plesk Hosting
1. Log in to your Plesk control panel.
2. Go to **Websites & Domains** and locate your domain.
3. Click on **Scheduled Tasks** (or **Cron Jobs** depending on your Plesk version).
4. Click **Add Task**:
   - **Task type**: Select `Run a command`.
   - **Run**: Select `Cron style` and enter `*/15 * * * *` (every 15 minutes).
   - **Command**: Enter the execution command:
     ```bash
     wget -q -O - https://example.com/wp-cron.php?doing_wp_cron >/dev/null 2>&1
     ```
5. Click **OK** or **Run** to save.

---

### Scenario C: VPS / Dedicated Server (SSH Access)
If you have root or user shell access via SSH:
1. Connect to your server via SSH.
2. Open the crontab editor for the web user (e.g., `www-data` or your system user):
   ```bash
   crontab -e
   ```
3. Add the following line at the bottom of the file (running every 15 minutes):
   ```bash
   */15 * * * * wget -q -O - https://example.com/wp-cron.php?doing_wp_cron >/dev/null 2>&1
   ```
4. Save and close the editor (`Ctrl+O`, `Enter`, `Ctrl+X` in nano).

---

### Scenario D: No Server / Hosting Access (External Cron Services)
If your host does not provide cPanel, Plesk, or SSH access, you can use a free external web cron monitoring service (such as **cron-job.org**, **EasyCron**, or **SetCronJob**):
1. Create a free account on [cron-job.org](https://cron-job.org/).
2. Create a **New Cronjob**:
   - **Title**: ImgSentry Cron
   - **URL**: `https://example.com/wp-cron.php?doing_wp_cron`
   - **Execution Schedule**: Select `Every 15 minutes` (or custom schedule).
3. Save the cron job. The external service will now ping your WordPress site every 15 minutes to guarantee reliable background execution.

---

## 3. Disabling Default WP-Cron (`DISABLE_WP_CRON`)

Once you have set up a real server cron job (or external cron service), it is strongly recommended to disable WordPress's default visitor-triggered cron execution. This prevents duplicate cron runs, improves page load performance for visitors, and ensures tasks execute only through your scheduled server job.

### How to Add It
1. Access your WordPress site files via FTP, SFTP, or your host's File Manager.
2. Locate the `wp-config.php` file in your WordPress root directory.
3. Open `wp-config.php` for editing and add the following line **right before** the comment line `/* That's all, stop editing! Happy publishing. */`:
   ```php
   define( 'DISABLE_WP_CRON', true );
   ```
4. Save the file.

### Example in `wp-config.php`:
```php
// ** Database settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
define( 'DB_NAME', 'wordpress_db' );

// ... existing database credentials ...

/** Disable default visitor-triggered WP-Cron in favor of server system cron */
define( 'DISABLE_WP_CRON', true );

/* That's all, stop editing! Happy publishing. */
```
