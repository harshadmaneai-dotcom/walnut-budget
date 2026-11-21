package app.walnut.mobile;

import android.app.Notification;
import android.content.Context;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Receives payment confirmations from UPI apps and queues them as transactions.
 *
 * This is Android's own API for this job, and it is not a background service: the system wakes
 * it per notification, for a moment. The source package is checked first, so every notification
 * that is not from a known UPI app costs a single string comparison and nothing else. There is
 * deliberately no foreground service, no polling and no wake lock.
 *
 * Only successful debits survive: the parser rejects received, refunded, failed and promotional
 * notifications, and the raw text is never written anywhere.
 */
public class UpiNotificationListener extends NotificationListenerService {

    /** Known UPI apps, mapped to the label the document stores on the transaction. */
    private static final Map<String, String> UPI_APPS = new LinkedHashMap<>();

    static {
        UPI_APPS.put("com.google.android.apps.nbu.paisa.user", "gpay");
        UPI_APPS.put("com.phonepe.app", "phonepe");
        UPI_APPS.put("net.one97.paytm", "paytm");
        UPI_APPS.put("in.org.npci.upiapp", "bhim");
        UPI_APPS.put("in.amazon.mShop.android.shopping", "amazonpay");
    }

    static String sourceAppFor(String packageName) {
        return UPI_APPS.get(packageName);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null || sbn.getNotification() == null) return;
            String pkg = sbn.getPackageName();
            // The whole battery story: everything that is not a UPI app stops here.
            if (sourceAppFor(pkg) == null) return;

            UpiStore store = new UpiStore(this);
            if (!store.isEnabled()) return;

            Notification notification = sbn.getNotification();
            long when = sbn.getPostTime() > 0 ? sbn.getPostTime() : System.currentTimeMillis();
            String title = textOf(notification.extras, Notification.EXTRA_TITLE);
            String body = bodyOf(notification);

            if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) {
                // Android 13+ group summaries often carry no amount, while a child does. When a
                // child already parsed, the summary must not become a second expense.
                if (childCarriesPayment(sbn)) return;
            }

            capture(this, pkg, title, body, when);
        } catch (Exception ignored) {
            // A listener that throws is unbound by the system. A malformed notification must
            // never cost the user the feature.
        }
    }

    /** The one place a payment becomes a queued item; also used by the debug hook. */
    static UpiStore.Item capture(Context context, String pkg, String title, String body, long when) {
        UpiStore store = new UpiStore(context);
        if (!store.isEnabled()) return null;

        UpiParser.Payment payment = UpiParser.parse(title, body);
        if (payment == null) return null;

        String merchantKey = UpiParser.normalize(payment.merchant);
        String key = pkg + "|" + when + "|" + payment.amountPaise + "|" + merchantKey;
        String content = pkg + "|" + payment.amountPaise + "|" + merchantKey;
        if (store.seenBefore(key, content, when / 20_000L)) return null;

        UpiStore.Item item = new UpiStore.Item(
            key,
            payment.amountPaise,
            payment.merchant,
            when,
            sourceAppFor(pkg),
            store.account());
        store.enqueue(item);
        store.setLastDetectedAt(when);

        UpiTrackerPlugin plugin = UpiTrackerPlugin.current();
        if (plugin != null) plugin.emitDetected(item);
        return item;
    }

    private boolean childCarriesPayment(StatusBarNotification summary) {
        Notification summaryNotification = summary.getNotification();
        String group = summaryNotification.getGroup();
        if (group == null) return false;
        try {
            StatusBarNotification[] active = getActiveNotifications();
            if (active == null) return false;
            for (StatusBarNotification other : active) {
                if (other == null) continue;
                if (other.getId() == summary.getId() && other.getPackageName().equals(summary.getPackageName())) {
                    continue;
                }
                if (!other.getPackageName().equals(summary.getPackageName())) continue;
                Notification notification = other.getNotification();
                if (notification == null || !group.equals(notification.getGroup())) continue;
                String title = textOf(notification.extras, Notification.EXTRA_TITLE);
                if (UpiParser.parse(title, bodyOf(notification)) != null) return true;
            }
        } catch (Exception ignored) {
            // Without the active list the summary is parsed on its own, which is still safe.
        }
        return false;
    }

    /** Text, big text, sub text, info text and expanded lines, without repeating any of them. */
    private static String bodyOf(Notification notification) {
        Bundle extras = notification.extras;
        if (extras == null) return "";
        StringBuilder body = new StringBuilder();
        append(body, textOf(extras, Notification.EXTRA_TEXT));
        append(body, textOf(extras, Notification.EXTRA_BIG_TEXT));
        append(body, textOf(extras, Notification.EXTRA_SUB_TEXT));
        append(body, textOf(extras, Notification.EXTRA_INFO_TEXT));
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null) {
            for (CharSequence line : lines) {
                append(body, line == null ? null : line.toString());
            }
        }
        return body.toString().trim();
    }

    private static void append(StringBuilder body, String value) {
        if (value == null) return;
        String trimmed = value.trim();
        if (trimmed.isEmpty()) return;
        if (body.indexOf(trimmed) >= 0) return;
        if (body.length() > 0) body.append(' ');
        body.append(trimmed);
    }

    private static String textOf(Bundle extras, String key) {
        if (extras == null) return null;
        CharSequence value = extras.getCharSequence(key);
        return value == null ? null : value.toString();
    }
}
