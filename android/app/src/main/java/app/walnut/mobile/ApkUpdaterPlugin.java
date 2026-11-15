package app.walnut.mobile;

import android.app.DownloadManager;
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

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashSet;
import java.util.Set;

/**
 * Downloads an update APK with DownloadManager and hands it to the system installer.
 *
 * Android always shows its own install confirmation for apps outside the Play Store; this
 * plugin removes every other step (browser, file manager, unknown-source digging).
 *
 * Downloads are treated as resumable. A second tap, a second screen or a relaunch must never
 * restart a transfer from zero on a slow connection, so:
 *  - a task DownloadManager still owns for the same URL is reused instead of enqueued again;
 *  - a file that already arrived complete short-circuits to "install";
 *  - only a partial file, with no task behind it, is discarded before starting over.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String UPDATE_DIR = "updates";
    private static final String UPDATE_FILE = "Walnut.apk";
    private static final long POLL_INTERVAL_MS = 500;
    /** How long a transfer may report no new bytes before the UI says the link is slow. */
    private static final long SLOW_AFTER_MS = 60_000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private DownloadManager downloadManager;
    private long downloadId = -1;
    private boolean polling = false;
    private long expectedBytes = -1;
    private long lastBytes = -1;
    private long lastBytesAt = 0;

    @Override
    public void load() {
        downloadManager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    @Override
    protected void handleOnDestroy() {
        polling = false;
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
            call.reject("Could not open the install settings", error);
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("A download url is required");
            return;
        }

        // An update must never travel over plain HTTP.
        Uri uri = Uri.parse(url);
        if (!"https".equals(uri.getScheme())) {
            call.reject("Updates must be downloaded over HTTPS");
            return;
        }

        Long published = call.getLong("bytes");
        expectedBytes = published == null ? -1 : published;

        File target = updateFile();
        File directory = target.getParentFile();
        if (directory != null && !directory.exists() && !directory.mkdirs()) {
            call.reject("Could not create the update directory");
            return;
        }

        // Already downloading (a second tap, the other screen, or a relaunch): stay with it.
        long running = activeDownloadId(url);
        if (running != -1) {
            downloadId = running;
            JSObject result = new JSObject();
            result.put("completed", false);
            result.put("resumed", true);
            call.resolve(result);
            startPolling();
            return;
        }

        // Already downloaded in full by an earlier attempt: there is nothing left to fetch.
        if (target.exists() && expectedBytes > 0 && target.length() == expectedBytes) {
            JSObject result = new JSObject();
            result.put("completed", true);
            result.put("resumed", true);
            call.resolve(result);
            return;
        }

        // Only here is the old file useless: it is partial and no task is going to finish it.
        if (target.exists() && !target.delete()) {
            call.reject("Could not replace the previous download");
            return;
        }

        DownloadManager.Request request = new DownloadManager.Request(uri);
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

        try {
            downloadId = downloadManager.enqueue(request);
        } catch (Exception error) {
            call.reject("Could not start the download", error);
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
     * Reports progress about twice a second until it finishes or fails: percentage, bytes so
     * the UI can show real numbers, and a message for the states that are not progress at all
     * (queued behind Wi-Fi, waiting for the network, a slow link). DownloadManager resumes by
     * itself, so waiting is reported rather than treated as failure.
     */
    private void startPolling() {
        if (polling) return;
        polling = true;
        lastBytes = -1;
        lastBytesAt = System.currentTimeMillis();
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

                        progress.put("bytes", downloaded);
                        progress.put("total", total);
                        progress.put("percent", total > 0 ? (int) Math.min(100, (downloaded * 100) / total) : 0);

                        if (status == DownloadManager.STATUS_SUCCESSFUL) {
                            File apk = updateFile();
                            if (!apk.exists() || apk.length() == 0) {
                                progress.put("error", "the downloaded file is missing");
                                finished = true;
                            } else if (expectedBytes > 0 && apk.length() != expectedBytes) {
                                // A truncated file would install over a good build; drop it.
                                //noinspection ResultOfMethodCallIgnored
                                apk.delete();
                                progress.put("error", "the download came through incomplete");
                                finished = true;
                            } else {
                                progress.put("bytes", apk.length());
                                progress.put("total", apk.length());
                                progress.put("percent", 100);
                                progress.put("done", true);
                                finished = true;
                            }
                        } else if (status == DownloadManager.STATUS_FAILED) {
                            progress.put("error", failureReason(reason));
                            finished = true;
                        } else if (status == DownloadManager.STATUS_PAUSED) {
                            progress.put("message", pauseReason(reason));
                        } else if (status == DownloadManager.STATUS_PENDING) {
                            progress.put("message", "Waiting to start…");
                        } else {
                            long now = System.currentTimeMillis();
                            if (downloaded > lastBytes) {
                                lastBytes = downloaded;
                                lastBytesAt = now;
                            } else if (now - lastBytesAt > SLOW_AFTER_MS) {
                                progress.put("message", "Slow connection — still downloading…");
                            }
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
        if (!apk.exists()) {
            call.reject("No downloaded update");
            return;
        }
        if (!signedWithInstalledKey(apk)) {
            // Never hand an unsigned or foreign-signed build to the installer.
            //noinspection ResultOfMethodCallIgnored
            apk.delete();
            call.reject("The downloaded update is not signed by Walnut and was discarded");
            return;
        }
        if (!canInstallPackages()) {
            call.reject("Allow installs from Walnut first");
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
        } catch (Exception error) {
            call.reject("Could not open the installer", error);
        }
    }
}
