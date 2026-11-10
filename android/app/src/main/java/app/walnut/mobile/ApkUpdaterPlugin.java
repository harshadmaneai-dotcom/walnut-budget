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
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String UPDATE_DIR = "updates";
    private static final String UPDATE_FILE = "Walnut.apk";
    private static final long POLL_INTERVAL_MS = 500;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private DownloadManager downloadManager;
    private long downloadId = -1;
    private boolean polling = false;

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

        File target = updateFile();
        File directory = target.getParentFile();
        if (directory != null && !directory.exists() && !directory.mkdirs()) {
            call.reject("Could not create the update directory");
            return;
        }
        // DownloadManager refuses to overwrite, and a stale file would install the old build.
        if (target.exists() && !target.delete()) {
            call.reject("Could not replace the previous download");
            return;
        }

        DownloadManager.Request request = new DownloadManager.Request(uri);
        request.setTitle("Walnut update");
        request.setDescription("Downloading the new version");
        request.setMimeType("application/vnd.android.package-archive");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
        request.setDestinationInExternalFilesDir(getContext(), null, UPDATE_DIR + "/" + UPDATE_FILE);

        try {
            downloadId = downloadManager.enqueue(request);
        } catch (Exception error) {
            call.reject("Could not start the download", error);
            return;
        }

        call.resolve();
        startPolling();
    }

    /** Reports download progress about twice a second until it finishes or fails. */
    private void startPolling() {
        if (polling) return;
        polling = true;
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (!polling) return;
                boolean finished = false;
                JSObject progress = new JSObject();
                progress.put("percent", 0);

                DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
                try (Cursor cursor = downloadManager.query(query)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        long downloaded = cursor.getLong(
                            cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                        long total = cursor.getLong(
                            cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                        progress.put("percent", total > 0 ? (int) Math.min(100, (downloaded * 100) / total) : 0);

                        if (status == DownloadManager.STATUS_SUCCESSFUL) {
                            progress.put("done", true);
                            finished = true;
                        } else if (status == DownloadManager.STATUS_FAILED) {
                            progress.put("error", "download failed");
                            finished = true;
                        }
                    }
                } catch (Exception error) {
                    progress.put("error", "download failed");
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
