package app.walnut.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/**
 * Parser rules against the notification wording the apps actually post. The negative cases are
 * the important half: a received, failed or promotional notification must never become an
 * expense, and it is cheaper to prove that here than on a phone.
 */
public class UpiParserTest {

    private static void accepts(String title, String text, long paise, String merchant) {
        UpiParser.Payment payment = UpiParser.parse(title, text);
        assertNotNull("expected a payment from: " + text, payment);
        assertEquals("amount for: " + text, paise, payment.amountPaise);
        assertEquals("merchant for: " + text, merchant, payment.merchant);
    }

    private static void rejects(String title, String text) {
        assertNull("expected no payment from: " + text, UpiParser.parse(title, text));
    }

    @Test
    public void googlePay() {
        accepts("Payment successful", "You paid ₹250 to Sharma Store", 250_00, "Sharma Store");
        accepts("", "You paid ₹250 to Sharma Store. Tap to view details", 250_00, "Sharma Store");
    }

    @Test
    public void phonePe() {
        accepts("Paid", "Paid ₹99 to Rahul", 99_00, "Rahul");
        accepts("", "You paid ₹99 to Rahul via UPI", 99_00, "Rahul");
    }

    @Test
    public void paytm() {
        accepts("", "₹1,299 paid to Croma", 1_299_00, "Croma");
    }

    @Test
    public void bhimAndAmazonPay() {
        accepts("", "Rs 500 paid to Suresh", 500_00, "Suresh");
        accepts("", "You paid ₹1,500 to Amazon", 1_500_00, "Amazon");
    }

    @Test
    public void amountsWithPrefixesAndDecimals() {
        accepts("", "You paid Rs.1,250.50 to ABC Traders", 1_250_50, "ABC Traders");
        accepts("", "You paid INR 40 to Chai Corner", 40_00, "Chai Corner");
    }

    @Test
    public void truncatedMerchantIsKept() {
        accepts("", "You paid ₹40 to Chai Ce", 40_00, "Chai Ce");
    }

    @Test
    public void hinglishVariant() {
        accepts("", "₹150 Rahul ko bheje", 150_00, "Rahul");
    }

    @Test
    public void moneyComingInIsIgnored() {
        rejects("", "You received ₹500 from Amit");
        rejects("", "Rs 2,000 credited to your account");
        rejects("", "₹750 credited to your UPI ID");
    }

    @Test
    public void unsuccessfulPaymentsAreIgnored() {
        rejects("", "Payment of ₹250 to Sharma Store failed");
        rejects("", "Payment of ₹250 to Sharma Store is pending");
        rejects("", "Payment of ₹250 to Sharma Store was declined");
        rejects("", "You cancelled the payment of ₹250 to Sharma Store");
    }

    @Test
    public void refundsAndPromotionsAreIgnored() {
        rejects("", "Refund of ₹250 credited to your account");
        rejects("", "₹50 cashback received");
        rejects("", "Flat ₹100 cashback on your next payment");
        rejects("", "Offers for you: get ₹75 off your next payment");
    }

    @Test
    public void requestsAndRemindersAreIgnored() {
        rejects("", "Rahul has requested ₹250");
        rejects("", "Reminder: your bill of ₹500 is due tomorrow");
        rejects("", "Your account will be debited by ₹250");
    }

    @Test
    public void summariesAndStatementsAreIgnored() {
        rejects("", "2 payments of ₹250 completed today");
        rejects("", "1 payment of ₹250 completed");
    }

    @Test
    public void textWithoutMoneyIsIgnored() {
        rejects("", "You paid to Sharma Store");
        rejects("", "Sharma Store");
        rejects("", "Your bill of ₹500 is unpaid");
        rejects("", "");
        rejects(null, null);
    }

    @Test
    public void normalizeGivesStableComparisonForm() {
        assertEquals("sharmastore", UpiParser.normalize("Sharma Store"));
        assertEquals("sharmastore", UpiParser.normalize("  SHARMA   STORE "));
    }
}
