from django.core.management.base import BaseCommand

from apps.orders.services import expire_unpaid


class Command(BaseCommand):
    help = "Cancel unpaid orders whose payment deadline has passed and put their items back on sale. Run from cron every few minutes."

    def handle(self, *args, **options):
        count = expire_unpaid()
        self.stdout.write(f"{count} unpaid order(s) cancelled.")
