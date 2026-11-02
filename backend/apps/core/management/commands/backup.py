import sqlite3
import tempfile
import zipfile
from datetime import datetime
from io import StringIO
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = (
        "Save the database, and optionally the uploaded photos, into one zip under BACKUP_DIR "
        "and delete the oldest zips beyond --keep. Run from cron once a day."
    )

    def add_arguments(self, parser):
        parser.add_argument("--media", action="store_true", help="Also include uploaded photos (larger).")
        parser.add_argument("--keep", type=int, default=14, help="How many zips of this kind to keep.")

    def handle(self, *args, media=False, keep=14, **options):
        out_dir = Path(settings.BACKUP_DIR)
        out_dir.mkdir(parents=True, exist_ok=True)
        kind = "full" if media else "db"
        path = out_dir / f"{kind}-{datetime.now():%Y%m%d-%H%M%S}.zip"

        with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
            if connection.vendor == "sqlite":
                # The backup API takes a consistent copy even while the site is writing.
                copy = Path(tmp) / "db.sqlite3"
                connection.ensure_connection()
                dst = sqlite3.connect(copy)
                connection.connection.backup(dst)
                dst.close()
                zf.write(copy, "db.sqlite3")
            else:
                buf = StringIO()
                call_command("dumpdata", natural_foreign=True, exclude=["contenttypes", "auth.permission", "sessions"], stdout=buf)
                zf.writestr("data.json", buf.getvalue())
            if media:
                root = Path(settings.MEDIA_ROOT)
                for f in root.rglob("*"):
                    if f.is_file():
                        zf.write(f, Path("media") / f.relative_to(root))

        old = sorted(out_dir.glob(f"{kind}-*.zip"))[:-keep] if keep > 0 else []
        for f in old:
            f.unlink()
        self.stdout.write(f"Saved {path} ({path.stat().st_size // 1024} KB). Removed {len(old)} old backup(s).")
