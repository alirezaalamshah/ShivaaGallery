"""Entry point for cPanel's "Setup Python App" (Phusion Passenger)."""

import os
import sys
from urllib.parse import unquote_to_bytes

sys.path.insert(0, os.path.dirname(__file__))

from config.wsgi import application as django_application  # noqa: E402


def wsgi_path(path):
    """Undo URL escapes, keeping the bytes in the latin-1 form WSGI promises and Django expects."""
    return unquote_to_bytes(path.encode("latin-1")).decode("latin-1")


def application(environ, start_response):
    # This host hands the path over still escaped, so a Persian slug never matches and the
    # product page is a 404. Django also compares the path with SCRIPT_URL to work out a prefix
    # for every URL it builds; the site lives at the root, so there is no prefix to find.
    environ["PATH_INFO"] = wsgi_path(environ.get("PATH_INFO", ""))
    environ.pop("SCRIPT_URL", None)
    environ.pop("REDIRECT_URL", None)
    return django_application(environ, start_response)
