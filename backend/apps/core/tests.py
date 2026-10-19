from django.db.models import ProtectedError
from django.test import TestCase

from .models import StoreSettings


class StoreSettingsTests(TestCase):
    def test_load_always_returns_the_single_row(self):
        first = StoreSettings.load()
        first.name = "شیوا گالری"
        first.save()
        StoreSettings(name="دومی").save()
        self.assertEqual(StoreSettings.objects.count(), 1)
        self.assertEqual(StoreSettings.load().name, "دومی")

    def test_cannot_delete(self):
        with self.assertRaises(ProtectedError):
            StoreSettings.load().delete()

    def test_api_exposes_branding_and_returns_policy(self):
        s = StoreSettings.load()
        s.name, s.city, s.returns_days = "شیوا گالری", "دزفول", 7
        s.save()
        data = self.client.get("/api/store/").json()
        self.assertEqual(data["name"], "شیوا گالری")
        self.assertEqual(data["city"], "دزفول")
        self.assertEqual(data["returns"], {"enabled": True, "type": "refund", "days": 7, "policy": ""})
