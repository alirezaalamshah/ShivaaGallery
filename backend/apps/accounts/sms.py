"""
Pluggable SMS sending. Pick a backend with SMS_BACKEND:

- "console" (default): prints the message to the server log. For development.
- "melipayamak": Melipayamak REST web service, shared service line. The account may only send
  approved patterns, never free text. Needs SMS_USERNAME (the panel's username), SMS_API_KEY
  (the panel's API key, sent in place of the password) and one
  approved pattern code (bodyId) per message kind. Variables are {0}, {1}, … in order:
    SMS_PATTERN_OTP            {0} = code
    SMS_PATTERN_ORDER_PLACED   {0} = order number, {1} = total
    SMS_PATTERN_ORDER_STATUS   {0} = order number, {1} = new status, worded to fit the pattern
    SMS_PATTERN_ORDER_SHIPPED  {0} = order number, {1} = shipping method, {2} = tracking code
    SMS_PATTERN_ADMIN_ORDER    {0} = order number, {1} = total  (sent to the store)
    SMS_PATTERN_BACK_IN_STOCK  {0} = product, color and size  (no link: needs a starred eNamad)
    SMS_PATTERN_RETURN_STATUS  {0} = order number, {1} = return request status, worded to fit
  The approved texts are in deploy/sms-patterns.md.
"""

import json
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
        if not pattern or not settings.SMS_USERNAME or not settings.SMS_API_KEY:
            log.error("Melipayamak username, API key or pattern for %s is not set", kind)
            return
        data = urllib.parse.urlencode({
            "username": settings.SMS_USERNAME,
            # Melipayamak takes the API key in place of the password.
            "password": settings.SMS_API_KEY,
            "to": phone,
            "bodyId": pattern,
            # Pattern variables in order, separated by ";". An empty one makes Melipayamak reject the message.
            "text": ";".join(str(a) if str(a).strip() else "-" for a in args),
        }).encode()
        try:
            with urllib.request.urlopen(urllib.request.Request(self.URL, data=data), timeout=10) as res:
                body = res.read()
        except Exception:  # SMS failure must never break checkout or login flow
            log.exception("Melipayamak send failed for %s", kind)
            return
        # A sent message answers {"Value": "<long message id>", "RetStatus": 1, ...}; anything else is an error code.
        try:
            reply = json.loads(body)
        except ValueError:
            reply = {}
        if reply.get("RetStatus") == 1 and len(str(reply.get("Value", ""))) > 5:
            log.info("Melipayamak %s → %s: sent, id %s", kind, phone, reply["Value"])
        else:
            log.error("Melipayamak %s → %s failed: %s", kind, phone, body[:200])


def get_backend():
    return MelipayamakBackend() if settings.SMS_BACKEND == "melipayamak" else ConsoleBackend()


def send_sms(phone, kind, *args):
    get_backend().send(phone, kind, args)
