"""
Pluggable SMS sending. Pick a backend with SMS_BACKEND:

- "console" (default): prints the message to the server log. For development.
- "melipayamak": Melipayamak shared-number pattern API. Needs SMS_USERNAME,
  SMS_PASSWORD and one approved pattern id per message kind:
    SMS_PATTERN_OTP            {0} = code
    SMS_PATTERN_ORDER_PLACED   {0} = order number, {1} = total
    SMS_PATTERN_ORDER_STATUS   {0} = order number, {1} = new status
    SMS_PATTERN_ORDER_SHIPPED  {0} = order number, {1} = shipping method, {2} = tracking code
    SMS_PATTERN_ADMIN_ORDER    {0} = order number, {1} = total  (sent to the store)
    SMS_PATTERN_BACK_IN_STOCK  {0} = product, color and size, {1} = link
    SMS_PATTERN_RETURN_STATUS  {0} = order number, {1} = return request status
"""

import logging
import urllib.parse
import urllib.request

from django.conf import settings

log = logging.getLogger("sms")


class ConsoleBackend:
    def send(self, phone, kind, args):
        line = f"[SMS to {phone}] {kind}: {' ; '.join(map(str, args))}"
        log.info(line)
        try:
            print(line, flush=True)
        except UnicodeEncodeError:  # Windows consoles may not handle Persian text
            print(line.encode("ascii", "backslashreplace").decode(), flush=True)


class MelipayamakBackend:
    URL = "https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber"
    PATTERNS = {
        "otp": "SMS_PATTERN_OTP",
        "order_placed": "SMS_PATTERN_ORDER_PLACED",
        "order_status": "SMS_PATTERN_ORDER_STATUS",
        "order_shipped": "SMS_PATTERN_ORDER_SHIPPED",
        "admin_order": "SMS_PATTERN_ADMIN_ORDER",
        "back_in_stock": "SMS_PATTERN_BACK_IN_STOCK",
        "return_status": "SMS_PATTERN_RETURN_STATUS",
    }

    def send(self, phone, kind, args):
        pattern = getattr(settings, self.PATTERNS[kind], "")
        if not pattern:
            log.error("No Melipayamak pattern configured for %s", kind)
            return
        data = urllib.parse.urlencode({
            "username": settings.SMS_USERNAME,
            "password": settings.SMS_PASSWORD,
            "to": phone,
            "bodyId": pattern,
            # An empty pattern variable makes Melipayamak reject the message.
            "text": ";".join(str(a) if str(a).strip() else "-" for a in args),
        }).encode()
        try:
            with urllib.request.urlopen(urllib.request.Request(self.URL, data=data), timeout=10) as res:
                log.info("Melipayamak %s → %s: %s", kind, phone, res.read()[:200])
        except Exception:  # SMS failure must never break checkout or login flow
            log.exception("Melipayamak send failed for %s", kind)


def get_backend():
    return MelipayamakBackend() if settings.SMS_BACKEND == "melipayamak" else ConsoleBackend()


def send_sms(phone, kind, *args):
    get_backend().send(phone, kind, args)
