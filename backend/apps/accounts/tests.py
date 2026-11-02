from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings

from .models import OtpCode
from .otp import OtpError, request_code, verify_code

User = get_user_model()


@override_settings(DEBUG=True, SMS_BACKEND="console")
class OtpFlowTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_request_normalizes_phone_and_verify_logs_in(self):
        with mock.patch("apps.accounts.otp.send_sms") as sms:
            res = self.client.post("/api/auth/otp/request/", {"phone": "۰۹۱۲ ۱۲۳ ۴۵۶۷"}, content_type="application/json")
        self.assertEqual(res.status_code, 200)
        code = res.json()["debug_code"]
        sms.assert_called_once_with("09121234567", "otp", code)
        self.assertNotEqual(OtpCode.objects.get().code_hash, code)  # only the hash is stored

        res = self.client.post("/api/auth/otp/verify/", {"phone": "09121234567", "code": code}, content_type="application/json")
        self.assertEqual(res.json()["phone"], "09121234567")
        self.assertTrue(self.client.get("/api/auth/me/").json()["authenticated"])
        self.assertFalse(User.objects.get(username="09121234567").has_usable_password())

    def test_resend_is_rate_limited(self):
        request_code("09121234567")
        with self.assertRaises(OtpError) as ctx:
            request_code("09121234567")
        self.assertTrue(ctx.exception.retry_in)

    def test_wrong_code_counts_attempts_then_locks(self):
        request_code("09121234567")
        for _ in range(5):
            with self.assertRaises(OtpError):
                verify_code("09121234567", "00000")
        self.assertEqual(OtpCode.objects.get().attempts, 5)
        with self.assertRaisesMessage(OtpError, "دفعات"):
            verify_code("09121234567", "00000")

    def test_expired_code_is_rejected(self):
        _, code = request_code("09121234567")
        OtpCode.objects.update(created_at=OtpCode.objects.get().created_at - timedelta(minutes=3))
        with self.assertRaisesMessage(OtpError, "منقضی"):
            verify_code("09121234567", code)

    def test_code_cannot_open_a_staff_account(self):
        User.objects.create_user("09120000000", password="x", is_staff=True)
        _, code = request_code("09120000000")
        with self.assertRaises(OtpError):
            verify_code("09120000000", code)

    def test_invalid_phone(self):
        res = self.client.post("/api/auth/otp/request/", {"phone": "12345"}, content_type="application/json")
        self.assertEqual(res.status_code, 400)

    @override_settings(DEBUG=False)
    def test_code_is_not_exposed_outside_debug(self):
        res = self.client.post("/api/auth/otp/request/", {"phone": "09121234567"}, content_type="application/json")
        self.assertNotIn("debug_code", res.json())


class StaffLoginTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_only_staff_can_use_password_login(self):
        User.objects.create_user("admin", password="secret-pass", is_staff=True)
        User.objects.create_user("09121234567", password="secret-pass")
        bad = self.client.post("/api/auth/login/", {"username": "09121234567", "password": "secret-pass"}, content_type="application/json")
        self.assertEqual(bad.status_code, 400)
        ok = self.client.post("/api/auth/login/", {"username": "admin", "password": "secret-pass"}, content_type="application/json")
        self.assertTrue(ok.json()["is_staff"])

    def test_session_endpoints_enforce_csrf(self):
        client = self.client_class(enforce_csrf_checks=True)
        res = client.post("/api/auth/logout/")
        self.assertEqual(res.status_code, 403)
        client.get("/api/auth/csrf/")
        token = client.cookies["csrftoken"].value
        self.assertEqual(client.post("/api/auth/logout/", HTTP_X_CSRFTOKEN=token).status_code, 200)


@override_settings(SMS_BACKEND="melipayamak", SMS_USERNAME="9123456789", SMS_API_KEY="key-123", SMS_PATTERN_ORDER_SHIPPED="4321", SMS_PATTERN_OTP="")
class MelipayamakTests(TestCase):
    def test_sends_pattern_code_and_args_with_api_key_as_password(self):
        from urllib.parse import parse_qs

        from .sms import send_sms

        with mock.patch("apps.accounts.sms.urllib.request.urlopen") as urlopen, self.assertLogs("sms", "INFO") as logs:
            urlopen.return_value.__enter__.return_value.read.return_value = b'{"Value":"6271394011236751234","RetStatus":1,"StrRetStatus":"Ok"}'
            send_sms("09121234567", "order_shipped", "1405001", "پست", "")
        sent = {k: v[0] for k, v in parse_qs(urlopen.call_args.args[0].data.decode()).items()}
        # An empty variable is sent as "-", which Melipayamak accepts.
        self.assertEqual(sent, {"username": "9123456789", "password": "key-123", "to": "09121234567", "bodyId": "4321", "text": "1405001;پست;-"})
        self.assertIn("sent", logs.output[0])

    def test_error_code_is_logged(self):
        from .sms import send_sms

        with mock.patch("apps.accounts.sms.urllib.request.urlopen") as urlopen, self.assertLogs("sms", "ERROR"):
            urlopen.return_value.__enter__.return_value.read.return_value = b'{"Value":"0","RetStatus":0,"StrRetStatus":"InvalidUserPass"}'
            send_sms("09121234567", "order_shipped", "1405001", "پست", "1")

    def test_missing_pattern_sends_nothing(self):
        from .sms import send_sms

        with mock.patch("apps.accounts.sms.urllib.request.urlopen") as urlopen, self.assertLogs("sms", "ERROR"):
            send_sms("09121234567", "otp", "12345")
        urlopen.assert_not_called()
