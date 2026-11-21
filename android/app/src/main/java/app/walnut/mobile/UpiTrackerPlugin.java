package app.walnut.mobile;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.ref.WeakReference;
import java.util.List;

/**
 * The web layer's only door to auto-tracking: permission state, the opt-in toggle, and the
 * queue of parsed payments. It never hands over notification text, and it never uploads
 * anything — the budget document is saved by the web app through its own sync path.
 */
@CapacitorPlugin(name = "UpiTracker")
public class UpiTrackerPlugin extends Plugin {

    /** The listener runs in the same process, so it can nudge an open app about a new payment. */
    private static WeakReference<UpiTrackerPlugin> current = new WeakReference<>(null);

    static UpiTrackerPlugin current() {
        return current.get();
    }

    @Override
    public void load() {
        current = new WeakReference<>(this);
    }

    @Override
    protected void handleOnDestroy() {
        if (current.get() == this) current = new WeakReference<>(null);
        super.handleOnDestroy();
    }

    private UpiStore store() {
        return new UpiStore(getContext());
    }

    /**
     * The system owns this permission, so it is read from the setting itself rather than
     * cached: the user can revoke it while the app is open.
     */
    private boolean hasNotificationAccess() {
        try {
            String flat = Settings.Secure.getString(
                getContext().getContentResolver(), "enabled_notification_listeners");
            return flat != null && flat.contains(getContext().getPackageName());
        } catch (Exception error) {
            return false;
        }
    }

    private JSObject statusOf(UpiStore store) {
        JSObject result = new JSObject();
        result.put("enabled", store.isEnabled());
        result.put("notificationAccess", hasNotificationAccess());
        result.put("lastDetectedAt", store.lastDetectedAt());
        result.put("pending", store.pendingCount());
        return result;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusOf(store()));
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("enabled is required", "INVALID_INPUT");
            return;
        }
        UpiStore store = store();
        store.setEnabled(enabled);
        call.resolve(statusOf(store));
    }

    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open notification settings", "SETTINGS_UNAVAILABLE");
        }
    }

    /** Hands over everything queued and clears it; merging the same item twice is harmless. */
    @PluginMethod
    public void drain(PluginCall call) {
        UpiStore store = store();
        List<UpiStore.Item> items = store.drain();
        JSArray array = new JSArray();
        for (UpiStore.Item item : items) array.put(item.toJSObject());

        JSObject result = new JSObject();
        result.put("items", array);
        result.put("lastDetectedAt", store.lastDetectedAt());
        call.resolve(result);
    }

    @PluginMethod
    public void setAccount(PluginCall call) {
        String userId = call.getString("userId");
        if (userId == null || userId.isEmpty()) {
            call.reject("userId is required", "INVALID_INPUT");
            return;
        }
        store().setAccount(userId);
        call.resolve();
    }

    @PluginMethod
    public void clearAccount(PluginCall call) {
        store().clearAccount();
        call.resolve();
    }

    /**
     * Debug builds only: feeds sample text through the real parser so the pipeline can be
     * exercised without making a payment. Never available in the APK users install.
     */
    @PluginMethod
    public void debugSimulate(PluginCall call) {
        if (!isDebuggable()) {
            call.reject("Only available in a debug build", "NOT_DEBUGGABLE");
            return;
        }
        String title = call.getString("title", "");
        String text = call.getString("text", "");
        String sourceApp = call.getString("sourceApp", "gpay");
        String pkg = packageFor(sourceApp);
        Long postTime = call.getLong("postTime");
        long when = postTime != null ? postTime : System.currentTimeMillis();

        UpiStore.Item item = UpiNotificationListener.capture(getContext(), pkg, title, text, when);
        JSObject result = new JSObject();
        result.put("parsed", item != null);
        call.resolve(result);
    }

    private boolean isDebuggable() {
        return (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private static String packageFor(String sourceApp) {
        if ("phonepe".equals(sourceApp)) return "com.phonepe.app";
        if ("paytm".equals(sourceApp)) return "net.one97.paytm";
        if ("bhim".equals(sourceApp)) return "in.org.npci.upiapp";
        if ("amazonpay".equals(sourceApp)) return "in.amazon.mShop.android.shopping";
        return "com.google.android.apps.nbu.paisa.user";
    }

    /** Tells an open app about a payment so it lands in seconds instead of at the next launch. */
    void emitDetected(UpiStore.Item item) {
        try {
            notifyListeners("detected", item.toJSObject());
        } catch (Exception ignored) {
            // No bridge, or it is going away; the queue still holds the payment.
        }
    }
}
