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


class BackupCommandTests(TestCase):
    def test_writes_database_zip_and_keeps_only_the_newest(self):
        import tempfile
        import zipfile
        from io import StringIO
        from pathlib import Path

        from django.core.management import call_command
        from django.test import override_settings

        with tempfile.TemporaryDirectory() as tmp, override_settings(BACKUP_DIR=tmp):
            Path(tmp, "db-20000101-000000.zip").write_bytes(b"old")
            call_command("backup", keep=1, stdout=StringIO())
            zips = sorted(Path(tmp).glob("db-*.zip"))
            self.assertEqual(len(zips), 1)
            self.assertNotIn("20000101", zips[0].name)
            with zipfile.ZipFile(zips[0]) as zf:
                self.assertEqual(zf.namelist(), ["db.sqlite3"])


class UploadCachingTests(TestCase):
    def test_uploads_get_a_new_name_and_a_long_cache(self):
        import tempfile
        from io import BytesIO
        from pathlib import Path

        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import RequestFactory
        from PIL import Image

        from apps.panel.images import prepare_photo
        from config.urls import cached

        buf = BytesIO()
        Image.new("RGB", (30, 40)).save(buf, "JPEG")
        names = {prepare_photo(SimpleUploadedFile("banner.jpg", buf.getvalue())).name for _ in range(2)}
        self.assertEqual(len(names), 2)
        self.assertTrue(all(n.startswith("banner-") and n.endswith(".webp") for n in names))

        with tempfile.TemporaryDirectory() as root:
            Path(root, "a.webp").write_bytes(b"x")
            res = cached(3600)(RequestFactory().get("/media/a.webp"), "a.webp", document_root=root)
            res.close()
        self.assertEqual(res["Cache-Control"], "public, max-age=3600")


class CompressionTests(TestCase):
    def test_api_answers_are_compressed_and_files_are_not(self):
        import tempfile
        from pathlib import Path

        from django.http import FileResponse, HttpResponse
        from django.test import RequestFactory

        from config.middleware import CompressJson

        request = RequestFactory().get("/api/products/", HTTP_ACCEPT_ENCODING="gzip")
        self.assertEqual(CompressJson(lambda r: HttpResponse("x" * 1000))(request)["Content-Encoding"], "gzip")

        with tempfile.TemporaryDirectory() as root:
            photo = Path(root, "a.webp")
            photo.write_bytes(b"x" * 1000)
            res = CompressJson(lambda r: FileResponse(photo.open("rb")))(request)
            self.assertFalse(res.has_header("Content-Encoding"))
            res.close()
