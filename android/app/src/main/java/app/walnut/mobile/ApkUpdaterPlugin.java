package app.walnut.mobile;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Downloads an update APK with DownloadManager and hands it to the system installer.
 *
 * Android always shows its own install confirmation for apps outside the Play Store; this
 * plugin removes every other step (browser, file manager, unknown-source digging).
 *
 * Downloads are resumable and source-aware. A second tap, a second screen or a relaunch must
 * never restart a transfer from zero, and a source that is slow or unavailable must not block
 * the update:
 *  - a task DownloadManager still owns for any candidate URL is reused instead of enqueued again;
 *  - a file that already arrived complete short-circuits to "install";
 *  - a failing source moves to the next candidate (usually the website mirror, then GitHub);
 *  - a partial file is discarded only when no task behind it can finish it.
 *
 * When the feed publishes a SHA-256 the finished file is hashed off the main thread before it
 * is accepted. A mismatch (a stale APK from an older build, a truncated transfer, a captive
 * portal page) is deleted and the next source is tried instead of handing Android an APK it
 * would refuse with a bare "App not installed".
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String UPDATE_DIR = "updates";
    private static final String UPDATE_FILE = "Walnut.apk";
    private static final long POLL_INTERVAL_MS = 500;
    /** How long a transfer may report no new bytes before the UI says the link is slow. */
    private static final long SLOW_AFTER_MS = 60_000;
    /** No new bytes for this long means the transfer is dead, not slow: move to the next source. */
    private static final long STALL_AFTER_MS = 90_000;
    /** A queued download that never starts is stuck behind a broken queue. */
    private static final long START_AFTER_MS = 45_000;
    /** Paused for this long (no network, data saver) is treated as a failed source. */
    private static final long PAUSE_AFTER_MS = 300_000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private DownloadManager downloadManager;
    private long downloadId = -1;
    private boolean polling = false;
    private long expectedBytes = -1;
    private String expectedSha256 = null;
    private boolean verifying = false;
    private boolean verified = false;
    private long lastBytes = -1;
    private long lastProgressAt = 0;
    private long statusSince = 0;
    private int lastStatus = -1;
    private List<String> candidates = new ArrayList<>();
    private int candidateIndex = 0;

    @Override
    public void load() {
        downloadManager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    @Override
    protected void handleOnDestroy() {
        polling = false;
        verifying = false;
        super.handleOnDestroy();
    }

    private File updateFile() {
        return new File(getContext().getExternalFilesDir(null), UPDATE_DIR + File.separator + UPDATE_FILE);
    }

    /** SHA-256 of a signing certificate, hex encoded. */
    private static String fingerprint(Signature signature) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(signature.toByteArray());
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) hex.append(String.format("%02x", b & 0xff));
            return hex.toString();
        } catch (NoSuchAlgorithmException error) {
            return null;
        }
    }

    /** SHA-256 of the whole file, lowercase hex, or null when it cannot be read. */
    private static String sha256(File file) {
        try (InputStream in = new FileInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) digest.update(buffer, 0, read);
            StringBuilder hex = new StringBuilder(64);
            for (byte b : digest.digest()) hex.append(String.format("%02x", b & 0xff));
            return hex.toString();
        } catch (Exception error) {
            return null;
        }
    }

    /**
     * True when the downloaded APK is signed by the same certificate as the installed app.
     * Android would refuse a mismatched update anyway, but checking first means a tampered or
     * substituted download is deleted instead of being handed to the installer.
     */
    @SuppressWarnings("deprecation")
    private boolean signedWithInstalledKey(File apk) {
        PackageManager manager = getContext().getPackageManager();
        PackageInfo archive = manager.getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.GET_SIGNATURES);
        if (archive == null || !getContext().getPackageName().equals(archive.packageName)) return false;
        if (archive.signatures == null || archive.signatures.length == 0) return false;

        try {
            PackageInfo installed = manager.getPackageInfo(
                getContext().getPackageName(), PackageManager.GET_SIGNATURES);
            if (installed.signatures == null || installed.signatures.length == 0) return false;

            Set<String> expected = new HashSet<>();
            for (Signature signature : installed.signatures) {
                String value = fingerprint(signature);
                if (value != null) expected.add(value);
            }
            for (Signature signature : archive.signatures) {
                String value = fingerprint(signature);
                if (value != null && expected.contains(value)) return true;
            }
        } catch (PackageManager.NameNotFoundException error) {
            return false;
        }
        return false;
    }

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    /** Every candidate URL handed in, preferring the modern array form. */
    private static List<String> readUrls(PluginCall call) {
        List<String> urls = new ArrayList<>();
        JSArray list = call.getArray("urls");
        if (list != null) {
            for (int i = 0; i < list.length(); i++) {
                try {
                    String value = list.getString(i);
                    if (value != null && !value.isEmpty() && !urls.contains(value)) urls.add(value);
                } catch (Exception ignored) {
                    // A non-string entry is simply skipped.
                }
            }
        }
        if (urls.isEmpty()) {
            String single = call.getString("url");
            if (single != null && !single.isEmpty()) urls.add(single);
        }
        return urls;
    }

    /**
     * An unfinished DownloadManager task for this exact URL, so pressing Install again keeps
     * the bytes already downloaded. A task left over from a different build is dropped, since
     * resuming it would install the wrong version.
     */
    private long activeDownloadId(String url) {
        long active = -1;
        long stale = -1;
        try (Cursor cursor = downloadManager.query(new DownloadManager.Query())) {
            if (cursor == null) return -1;
            while (cursor.moveToNext()) {
                String taskUrl = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_URI));
                if (!url.equals(taskUrl)) continue;

                int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                boolean running = status == DownloadManager.STATUS_RUNNING
                    || status == DownloadManager.STATUS_PENDING
                    || status == DownloadManager.STATUS_PAUSED;
                if (!running) continue;

                long id = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_ID));
                long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                if (expectedBytes > 0 && total > 0 && total != expectedBytes) {
                    stale = id;
                    continue;
                }
                active = id;
                break;
            }
        } catch (Exception ignored) {
            // An unusual ROM with a missing column must not break updating.
        }
        // Cancelling inside the open cursor would invalidate it, so the stale task goes after.
        if (stale != -1) dislikeQuietly(stale);
        return active;
    }

    private void dislikeQuietly(long id) {
        try {
            downloadManager.remove(id);
        } catch (Exception ignored) {
            // Nothing to clean up if the task already finished or was cleared.
        }
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", canInstallPackages());
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open the install settings", "SETTINGS_UNAVAILABLE");
        }
    }

    /** Opens a page in the real browser, which a WebView cannot do for itself. */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !"https".equals(Uri.parse(url).getScheme())) {
            call.reject("A secure url is required", "INVALID_URL");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open the download page", "NO_BROWSER");
        }
    }

    /** Enqueues one source. Returns false when DownloadManager refuses it. */
    private boolean enqueue(String url) {
        try {
            File target = updateFile();
            if (target.exists() && !target.delete()) return false;

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("Walnut update");
            request.setDescription("Downloading the new version");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            // A phone on mobile data must not sit queued for Wi-Fi: this file is a few megabytes.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                request.setAllowedOverMetered(true);
            }
            request.setAllowedOverRoaming(true);
            request.setDestinationInExternalFilesDir(getContext(), null, UPDATE_DIR + "/" + UPDATE_FILE);

            downloadId = downloadManager.enqueue(request);
            lastBytes = -1;
            lastProgressAt = System.currentTimeMillis();
            statusSince = 0;
            lastStatus = -1;
            verified = false;
            verifying = false;
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    /**
     * Moves to the next source, so one dead or crawling host cannot stall an update. A task
     * that is still running is cancelled first: leaving it alive would let it keep writing to
     * the same destination the next source is about to use.
     */
    private boolean tryNextCandidate(boolean cancelRunning) {
        if (cancelRunning) dislikeQuietly(downloadId);
        File partial = updateFile();
        if (partial.exists()) {
            //noinspection ResultOfMethodCallIgnored
            partial.delete();
        }
        while (candidateIndex + 1 < candidates.size()) {
            candidateIndex += 1;
            if (enqueue(candidates.get(candidateIndex))) return true;
        }
        return false;
    }

    @PluginMethod
    public void download(PluginCall call) {
        List<String> urls = readUrls(call);
        if (urls.isEmpty()) {
            call.reject("A download url is required", "NO_URL");
            return;
        }

        // An update must never travel over plain HTTP.
        for (String url : urls) {
            if (!"https".equals(Uri.parse(url).getScheme())) {
                call.reject("Updates must be downloaded over HTTPS", "INSECURE_URL");
                return;
            }
        }

        Long published = call.getLong("bytes");
        expectedBytes = published == null ? -1 : published;
        String checksum = call.getString("sha256");
        expectedSha256 = checksum != null && checksum.matches("(?i)^[0-9a-f]{64}$")
            ? checksum.toLowerCase(Locale.US)
            : null;
        candidates = urls;
        candidateIndex = 0;
        verified = false;
        verifying = false;

        File directory = updateFile().getParentFile();
        if (directory != null && !directory.exists() && !directory.mkdirs()) {
            call.reject("Could not create the update directory", "NO_STORAGE");
            return;
        }

        // Already downloading (a second tap, the other screen, a relaunch): stay with it.
        for (int i = 0; i < urls.size(); i++) {
            long running = activeDownloadId(urls.get(i));
            if (running != -1) {
                candidateIndex = i;
                downloadId = running;
                JSObject result = new JSObject();
                result.put("completed", false);
                result.put("resumed", true);
                call.resolve(result);
                startPolling();
                return;
            }
        }

        // Already downloaded in full by an earlier attempt: there is nothing left to fetch.
        // The checksum still decides; a stale file for another build fails it and is replaced.
        File target = updateFile();
        if (target.exists() && expectedBytes > 0 && target.length() == expectedBytes) {
            if (expectedSha256 == null || expectedSha256.equalsIgnoreCase(String.valueOf(sha256(target)))) {
                JSObject result = new JSObject();
                result.put("completed", true);
                result.put("resumed", true);
                call.resolve(result);
                return;
            }
            //noinspection ResultOfMethodCallIgnored
            target.delete();
        }

        // Only here is the old file useless: it is partial and no task is going to finish it.
        if (target.exists() && !target.delete()) {
            call.reject("Could not replace the previous download", "NO_STORAGE");
            return;
        }

        if (!enqueue(urls.get(0)) && !tryNextCandidate(false)) {
            call.reject("Could not start the download", "DOWNLOAD_FAILED");
            return;
        }

        JSObject result = new JSObject();
        result.put("completed", false);
        result.put("resumed", false);
        call.resolve(result);
        startPolling();
    }

    private static String failureReason(int reason) {
        switch (reason) {
            case DownloadManager.ERROR_INSUFFICIENT_SPACE:
                return "there is not enough free space";
            case DownloadManager.ERROR_FILE_ERROR:
                return "the file could not be written";
            case DownloadManager.ERROR_HTTP_DATA_ERROR:
                return "the connection dropped";
            case DownloadManager.ERROR_UNHANDLED_HTTP_CODE:
                return "the download server refused it";
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS:
                return "the download was redirected too often";
            case DownloadManager.ERROR_CANNOT_RESUME:
                return "it could not resume";
            default:
                return "the download failed";
        }
    }

    private static String pauseReason(int reason) {
        switch (reason) {
            case DownloadManager.PAUSED_QUEUED_FOR_WIFI:
                return "waiting for Wi-Fi — mobile data downloads are blocked";
            case DownloadManager.PAUSED_WAITING_FOR_NETWORK:
                return "waiting for a connection…";
            case DownloadManager.PAUSED_WAITING_TO_RETRY:
                return "waiting to retry…";
            default:
                return "download paused…";
        }
    }

    /**
     * Hashes the finished APK on a worker thread; a few megabytes on the main thread would
     * stall the WebView for no reason. The result lands back on the main handler, where it can
     * either finish the download or move on to the next source.
     */
    private void verifyAsync(final File apk) {
        final String expected = expectedSha256;
        final long id = downloadId;
        final long size = apk.length();
        new Thread(() -> {
            final String actual = sha256(apk);
            handler.post(() -> {
                verifying = false;
                if (!polling || downloadId != id) return;

                if (actual != null && actual.equalsIgnoreCase(expected)) {
                    verified = true;
                    JSObject done = new JSObject();
                    done.put("percent", 100);
                    done.put("bytes", size);
                    done.put("total", size);
                    done.put("done", true);
                    notifyListeners("progress", done);
                    polling = false;
                    return;
                }

                //noinspection ResultOfMethodCallIgnored
                apk.delete();
                verified = false;
                JSObject progress = new JSObject();
                progress.put("percent", 0);
                progress.put("bytes", 0);
                progress.put("total", expectedBytes > 0 ? expectedBytes : 0);
                if (tryNextCandidate(false)) {
                    progress.put("message", "Trying another server…");
                } else {
                    progress.put("error", "the download did not match the published checksum");
                    polling = false;
                }
                notifyListeners("progress", progress);
            });
        }, "walnut-apk-verify").start();
    }

    /**
     * Reports progress about twice a second until it finishes or fails: percentage, bytes so
     * the UI can show real numbers, and a message for the states that are not progress at all
     * (queued behind Wi-Fi, waiting for the network, a slow link, changing source, hashing).
     * DownloadManager resumes by itself, so waiting is reported rather than treated as failure.
     */
    private void startPolling() {
        if (polling) return;
        polling = true;
        lastBytes = -1;
        lastProgressAt = System.currentTimeMillis();
        statusSince = 0;
        lastStatus = -1;
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (!polling) return;
                boolean finished = false;
                JSObject progress = new JSObject();
                progress.put("percent", 0);
                progress.put("bytes", 0);
                progress.put("total", 0);

                DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
                try (Cursor cursor = downloadManager.query(query)) {
                    if (cursor == null || !cursor.moveToFirst()) {
                        progress.put("error", "the download was cleared");
                        finished = true;
                    } else {
                        int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                        long downloaded = cursor.getLong(
                            cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                        long total = cursor.getLong(
                            cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                        if (total <= 0 && expectedBytes > 0) total = expectedBytes;

                        long now = System.currentTimeMillis();
                        if (status != lastStatus) {
                            lastStatus = status;
                            statusSince = now;
                        }
                        if (downloaded > lastBytes) {
                            lastBytes = downloaded;
                            lastProgressAt = now;
                        }

                        progress.put("bytes", downloaded);
                        progress.put("total", total);
                        progress.put("percent", total > 0 ? (int) Math.min(100, (downloaded * 100) / total) : 0);

                        if (status == DownloadManager.STATUS_SUCCESSFUL) {
                            File apk = updateFile();
                            boolean usable = apk.exists() && apk.length() > 0
                                && (expectedBytes <= 0 || apk.length() == expectedBytes);
                            if (!usable) {
                                // A mirror that answered with something else (a 404 page, a stale
                                // build) must not reach the installer; try the next source.
                                if (tryNextCandidate(false)) {
                                    progress.put("message", "Trying another server…");
                                } else {
                                    if (apk.exists()) {
                                        //noinspection ResultOfMethodCallIgnored
                                        apk.delete();
                                    }
                                    progress.put("error", "the download came through incomplete");
                                    finished = true;
                                }
                            } else if (!verified && (expectedSha256 != null || verifying)) {
                                progress.put("bytes", apk.length());
                                progress.put("total", apk.length());
                                progress.put("percent", 100);
                                progress.put("message", "Checking the download…");
                                if (!verifying) {
                                    verifying = true;
                                    verifyAsync(apk);
                                }
                            } else {
                                progress.put("bytes", apk.length());
                                progress.put("total", apk.length());
                                progress.put("percent", 100);
                                progress.put("done", true);
                                finished = true;
                            }
                        } else if (status == DownloadManager.STATUS_FAILED) {
                            if (tryNextCandidate(false)) {
                                progress.put("message", "Trying another server…");
                            } else {
                                progress.put("error", failureReason(reason));
                                finished = true;
                            }
                        } else if (status == DownloadManager.STATUS_PAUSED) {
                            if (now - statusSince > PAUSE_AFTER_MS) {
                                if (tryNextCandidate(true)) {
                                    progress.put("message", "Trying another server…");
                                } else {
                                    progress.put("error", "the download stayed paused");
                                    finished = true;
                                }
                            } else {
                                progress.put("message", pauseReason(reason));
                            }
                        } else if (status == DownloadManager.STATUS_PENDING) {
                            if (now - statusSince > START_AFTER_MS) {
                                if (tryNextCandidate(true)) {
                                    progress.put("message", "Trying another server…");
                                } else {
                                    progress.put("error", "the download never started");
                                    finished = true;
                                }
                            } else {
                                progress.put("message", "Waiting to start…");
                            }
                        } else if (now - lastProgressAt > STALL_AFTER_MS) {
                            if (tryNextCandidate(true)) {
                                progress.put("message", "Trying another server…");
                            } else {
                                progress.put("error", "the download stalled");
                                finished = true;
                            }
                        } else if (now - lastProgressAt > SLOW_AFTER_MS) {
                            progress.put("message", "Slow connection — still downloading…");
                        }
                    }
                } catch (Exception error) {
                    progress.put("error", "the download failed");
                    finished = true;
                }

                notifyListeners("progress", progress);
                if (finished) {
                    polling = false;
                    return;
                }
                handler.postDelayed(this, POLL_INTERVAL_MS);
            }
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        File apk = updateFile();
        if (!apk.exists() || apk.length() == 0) {
            call.reject("No update has been downloaded yet", "NO_DOWNLOAD");
            return;
        }
        if (expectedSha256 != null && !expectedSha256.equalsIgnoreCase(String.valueOf(sha256(apk)))) {
            // A stale or substituted file must never reach the installer.
            //noinspection ResultOfMethodCallIgnored
            apk.delete();
            call.reject("The downloaded update did not match the published checksum", "CHECKSUM_MISMATCH");
            return;
        }
        if (!signedWithInstalledKey(apk)) {
            // Never hand an unsigned or foreign-signed build to the installer.
            //noinspection ResultOfMethodCallIgnored
            apk.delete();
            call.reject("The downloaded update is not signed by Walnut and was discarded", "SIGNATURE_MISMATCH");
            return;
        }
        if (!canInstallPackages()) {
            call.reject("Allow installs from Walnut first", "INSTALL_PERMISSION_REQUIRED");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(
                getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("No app on this phone can open the installer", "INSTALLER_UNAVAILABLE");
        } catch (Exception error) {
            call.reject("Could not open the installer", "INSTALL_FAILED");
        }
    }
}
