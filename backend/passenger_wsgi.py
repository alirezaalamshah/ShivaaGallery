"""Entry point for cPanel's "Setup Python App" (Phusion Passenger)."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from config.wsgi import application  # noqa: E402,F401
