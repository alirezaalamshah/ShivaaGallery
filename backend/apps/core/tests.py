import json
from urllib.parse import quote

from django.db.models import ProtectedError
from django.test import RequestFactory, TestCase

from apps.catalog.models import Category, Color, Product, ProductImage, Size, SizeSystem, Variant

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


class HostPathTests(TestCase):
    """This host passes the path still escaped, and sets SCRIPT_URL; Persian slugs must still work."""

    def get(self, path):
        from passenger_wsgi import application

        environ = RequestFactory()._base_environ(PATH_INFO=path, SCRIPT_URL=path)
        statuses = []
        response = application(environ, lambda status, headers: statuses.append(status))
        body = b"".join(response)
        response.close()
        return statuses[0], body

    def test_a_persian_slug_opens_with_clean_urls(self):
        system = SizeSystem.objects.create(name="حروفی")
        category = Category.objects.create(name="مانتو", size_system=system)
        product = Product.objects.create(category=category, name="مانتو کتان", price=1000)
        color = Color.objects.create(name="مشکی", hex="#000000")
        size = Size.objects.create(system=system, label="M")
        Variant.objects.create(product=product, color=color, size=size, stock=1)
        ProductImage.objects.create(product=product, image="products/a.webp")

        status, body = self.get(f"/api/products/{quote(product.slug)}/")

        self.assertTrue(status.startswith("200"), status)
        self.assertEqual(json.loads(body)["images"][0]["image"], "http://testserver/media/products/a.webp")

    def test_a_path_that_is_not_utf8_is_not_found_rather_than_a_crash(self):
        status, _ = self.get("/api/products/ã/")
        self.assertTrue(status.startswith("404"), status)
