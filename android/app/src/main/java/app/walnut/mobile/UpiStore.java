package app.walnut.mobile;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The device-local side of auto-tracking: the opt-in toggle, which account is signed in, and a
 * small queue of parsed payments waiting to be merged into the budget document.
 *
 * Nothing here talks to the network. The web layer drains the queue through the existing save
 * path, which is what keeps a whole-document sync from being written by two processes at once.
 *
 * Every read-modify-write of the queue runs under {@link #LOCK}: the notification listener and
 * the bridge call from different threads, and SharedPreferences alone does not make a read
 * followed by a write atomic across them.
 */
final class UpiStore {

    /**
     * Process-wide, because each call site builds its own thin UpiStore over the same prefs.
     * Without it an enqueue that reads the queue while a drain is clearing it can be erased
     * without ever being handed to the web layer.
     */
    private static final Object LOCK = new Object();

    private static final String PREFS = "walnut_upi";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_ACCOUNT = "account";
    private static final String KEY_LAST = "lastDetectedAt";
    private static final String KEY_PENDING = "pending";
    private static final String KEY_SEEN = "seen";

    /** A short queue is a safety net, not a backlog: every app open drains it. */
    private static final int PENDING_LIMIT = 50;
    /** Enough memory to swallow a burst of re-posts without growing forever. */
    private static final int SEEN_LIMIT = 60;

    private final SharedPreferences prefs;

    UpiStore(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** One parsed payment. Only these fields are persisted — never the notification text. */
    static final class Item {
        final String key;
        final long amount;
        final String merchant;
        final long postTime;
        final String sourceApp;
        final String owner;

        Item(String key, long amount, String merchant, long postTime, String sourceApp, String owner) {
            this.key = key;
            this.amount = amount;
            this.merchant = merchant;
            this.postTime = postTime;
            this.sourceApp = sourceApp;
            this.owner = owner;
        }

        /** The bridge's own object type; the web layer receives exactly these five fields. */
        com.getcapacitor.JSObject toJSObject() {
            com.getcapacitor.JSObject json = new com.getcapacitor.JSObject();
            json.put("key", key);
            json.put("amount", amount);
            json.put("merchant", merchant);
            json.put("postTime", postTime);
            json.put("sourceApp", sourceApp);
            return json;
        }

        JSONObject toJson() {
            JSONObject json = new JSONObject();
            try {
                json.put("key", key);
                json.put("amount", amount);
                json.put("merchant", merchant);
                json.put("postTime", postTime);
                json.put("sourceApp", sourceApp);
            } catch (JSONException error) {
                // Every value is a primitive, so this cannot fail in practice.
            }
            return json;
        }

        static Item fromJson(JSONObject json) {
            if (json == null) return null;
            String key = json.optString("key", "");
            if (key.isEmpty()) return null;
            return new Item(
                key,
                json.optLong("amount", 0),
                json.optString("merchant", ""),
                json.optLong("postTime", 0),
                json.optString("sourceApp", ""),
                json.optString("owner", ""));
        }
    }

    /** Off unless the user turns it on: auto-tracking is never enabled by default. */
    boolean isEnabled() {
        return prefs.getBoolean(KEY_ENABLED, false);
    }

    void setEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    String account() {
        String value = prefs.getString(KEY_ACCOUNT, "");
        return value == null || value.isEmpty() ? null : value;
    }

    /** Pins the signed-in account and drops anything captured for a different one. */
    void setAccount(String userId) {
        if (userId == null || userId.isEmpty()) return;
        synchronized (LOCK) {
            String previous = account();
            if (previous != null && !previous.equals(userId)) {
                List<Item> kept = new ArrayList<>();
                for (Item item : readPending()) {
                    if (item.owner == null || item.owner.isEmpty() || item.owner.equals(userId)) {
                        kept.add(item);
                    }
                }
                writePending(kept);
            }
            prefs.edit().putString(KEY_ACCOUNT, userId).apply();
        }
    }

    /** Signing out must not leave a captured payment waiting for whoever signs in next. */
    void clearAccount() {
        synchronized (LOCK) {
            // Committed, not applied: the next sign-in must never see this account's payment.
            prefs.edit().remove(KEY_ACCOUNT).remove(KEY_PENDING).commit();
        }
    }

    long lastDetectedAt() {
        return prefs.getLong(KEY_LAST, 0L);
    }

    void setLastDetectedAt(long when) {
        prefs.edit().putLong(KEY_LAST, when).apply();
    }

    int pendingCount() {
        return pending().size();
    }

    List<Item> pending() {
        synchronized (LOCK) {
            return readPending();
        }
    }

    private List<Item> readPending() {
        List<Item> items = new ArrayList<>();
        String raw = prefs.getString(KEY_PENDING, "");
        if (raw == null || raw.isEmpty()) return items;
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i += 1) {
                Item item = Item.fromJson(array.optJSONObject(i));
                if (item != null) items.add(item);
            }
        } catch (JSONException error) {
            // A damaged queue is discarded rather than crashing the listener.
        }
        return items;
    }

    void enqueue(Item item) {
        if (item == null) return;
        synchronized (LOCK) {
            List<Item> items = readPending();
            items.add(item);
            while (items.size() > PENDING_LIMIT) items.remove(0);
            writePending(items);
        }
    }

    /**
     * Takes everything queued and clears it in one step. Reading and clearing separately is the
     * race: a payment enqueued between them was deleted without ever being returned. The web
     * merge is idempotent, so a repeated drain after a crash is still harmless.
     */
    List<Item> drain() {
        synchronized (LOCK) {
            List<Item> items = readPending();
            if (items.isEmpty()) return items;
            // Committed so the queue is empty on disk before these items leave the process.
            prefs.edit().remove(KEY_PENDING).commit();
            return items;
        }
    }

    /** Only called while holding LOCK. */
    private void writePending(List<Item> items) {
        JSONArray array = new JSONArray();
        for (Item item : items) array.put(item.toJson());
        prefs.edit().putString(KEY_PENDING, array.toString()).apply();
    }

    /**
     * True when this notification was already handled. The exact key catches a re-post of the
     * same notification; the content key with a short bucket catches a re-delivery by the app.
     * Two genuinely identical payments a few seconds apart stay two, which is why the bucket is
     * short rather than the whole day.
     */
    boolean seenBefore(String key, String content, long bucket) {
        // The same read-modify-write problem as the queue: the listener and the debug hook both
        // record here, and a lost entry becomes a duplicate expense.
        synchronized (LOCK) {
            JSONArray seen = readSeen();
            String contentEntry = "c:" + content + "|" + bucket;
            boolean duplicate = false;
            List<String> next = new ArrayList<>();
            for (int i = 0; i < seen.length(); i += 1) {
                String value = seen.optString(i, "");
                if (value.isEmpty()) continue;
                if (value.equals(key) || value.equals(contentEntry)) duplicate = true;
                next.add(value);
            }
            next.add(key);
            next.add(contentEntry);
            while (next.size() > SEEN_LIMIT) next.remove(0);

            JSONArray array = new JSONArray();
            for (String value : next) array.put(value);
            prefs.edit().putString(KEY_SEEN, array.toString()).apply();
            return duplicate;
        }
    }

    private JSONArray readSeen() {
        String raw = prefs.getString(KEY_SEEN, "");
        if (raw == null || raw.isEmpty()) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (JSONException error) {
            return new JSONArray();
        }
    }
}
