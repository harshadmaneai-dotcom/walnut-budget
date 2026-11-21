package app.walnut.mobile;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns a payment notification into an amount and a merchant, or into nothing at all.
 *
 * Pure Java on purpose: the listener runs while the WebView is closed, so parsing cannot live
 * in the web bundle, and keeping Android out of this class means every rule is unit-tested on
 * the JVM. Only a successful debit produces a payment — anything received, refunded, failed,
 * pending or promotional returns null. Notification text is never stored or logged; only the
 * two extracted fields leave this class.
 */
public final class UpiParser {

    public static final class Payment {
        public final long amountPaise;
        public final String merchant;

        Payment(long amountPaise, String merchant) {
            this.amountPaise = amountPaise;
            this.merchant = merchant;
        }
    }

    /** Anything that means this is not money leaving the account. Checked before the amount. */
    private static final Pattern NOT_A_PAYMENT = Pattern.compile(
        "(?i)\\b(received|credit(?:ed)?|refunds?|refunded|reversed|failed|declined|cancelled"
            + "|canceled|pending|request(?:s|ed)?|collect|cashback|cash back|offers?|rewards?"
            + "|reminder|will be|paid by|you got|mila|aayega)\\b");

    /** "2 payments of ₹250 completed" is a group summary, not one payment. */
    private static final Pattern MULTIPLE_PAYMENTS = Pattern.compile(
        "(?i)\\b[0-9]+\\s+(?:payments?|transactions?)\\b");

    /** Something that means money did leave. Without one of these there is no expense. */
    private static final Pattern PAID_SIGNAL = Pattern.compile(
        "(?i)\\b(paid|sent|debited|transferred|successful|success|completed|bheje|bheja)\\b");

    /** ₹250, Rs.250, Rs 250, INR 250, with comma groups and up to two decimals. */
    private static final Pattern AMOUNT = Pattern.compile(
        "(?:₹|rs\\.?|inr)\\s?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)",
        Pattern.CASE_INSENSITIVE);

    /** "You paid ₹250 to Sharma Store" / "₹250 paid to Sharma Store" both land here. */
    private static final Pattern TO_MERCHANT = Pattern.compile(
        "\\bto\\s+(?:paid\\s+)?([^\\n]{2,60})",
        Pattern.CASE_INSENSITIVE);

    /** "₹150 Rahul ko bheje" — the Hinglish form some apps post. */
    private static final Pattern HINGLISH_MERCHANT = Pattern.compile(
        "([A-Za-z][A-Za-z0-9 .&'_-]{1,40})\\s+ko\\s+(?:bheje|bheja)",
        Pattern.CASE_INSENSITIVE);

    /** Everything after the merchant name: "via UPI", "Tap to view details", "on GPay". */
    private static final Pattern TRAILING_NOISE = Pattern.compile(
        "(?i)\\s+(?:via|using|through|from|upi|ref|reference|txn|transaction|tap"
            + "|on\\s+(?:gpay|google pay|phonepe|paytm|bhim|amazon pay|upi))\\b.*$");

    private static final Pattern EDGE_PUNCT = Pattern.compile(
        "^[\\s\"'.,;:!•|\\-]+|[\\s\"'.,;:!•|\\-]+$");
    private static final Pattern SPACES = Pattern.compile("\\s+");
    private static final Pattern GENERIC_MERCHANT = Pattern.compile(
        "(?i)^(your\\s+)?(account|bank|upi|payment|paid|successful|success|completed)$");

    private UpiParser() {
    }

    /** Null for every notification that is not a completed debit. */
    public static Payment parse(String title, String text) {
        String body = join(title, text);
        if (body.isEmpty()) return null;
        if (NOT_A_PAYMENT.matcher(body).find()) return null;
        if (MULTIPLE_PAYMENTS.matcher(body).find()) return null;
        if (!PAID_SIGNAL.matcher(body).find()) return null;

        Matcher amount = AMOUNT.matcher(body);
        if (!amount.find()) return null;
        long paise = toPaise(amount.group(1));
        if (paise <= 0) return null;

        String merchant = merchantOf(body);
        return new Payment(paise, merchant == null ? "" : merchant);
    }

    private static String join(String title, String text) {
        StringBuilder body = new StringBuilder();
        if (title != null && !title.trim().isEmpty()) body.append(title.trim());
        if (text != null && !text.trim().isEmpty()) {
            if (body.length() > 0) body.append(' ');
            body.append(text.trim());
        }
        return body.toString();
    }

    private static long toPaise(String raw) {
        String cleaned = raw.replace(",", "");
        try {
            // A payment notification is never a fractional paisa, and a wildly large number is
            // a mis-parse by definition.
            double value = Double.parseDouble(cleaned);
            if (value <= 0 || value > 10_000_000) return 0;
            return Math.round(value * 100);
        } catch (NumberFormatException error) {
            return 0;
        }
    }

    private static String merchantOf(String body) {
        Matcher to = TO_MERCHANT.matcher(body);
        if (to.find()) {
            String cleaned = clean(to.group(1));
            if (cleaned != null) return cleaned;
        }
        Matcher hinglish = HINGLISH_MERCHANT.matcher(body);
        if (hinglish.find()) {
            return clean(hinglish.group(1));
        }
        return null;
    }

    /** Trims the greeting around a name: "Sharma Store. Tap to view details" → "Sharma Store". */
    private static String clean(String raw) {
        if (raw == null) return null;
        String value = raw;
        Matcher noise = TRAILING_NOISE.matcher(value);
        if (noise.find()) value = value.substring(0, noise.start());
        value = SPACES.matcher(EDGE_PUNCT.matcher(value).replaceAll("")).replaceAll(" ").trim();
        if (value.length() < 2 || value.length() > 60) return null;
        if (GENERIC_MERCHANT.matcher(value).matches()) return null;
        return value;
    }

    /** Lowercase, letters and digits only: a stable comparison form for dedupe. */
    static String normalize(String value) {
        if (value == null) return "";
        return value.toLowerCase(Locale.US).replaceAll("[^a-z0-9]", "");
    }
}
