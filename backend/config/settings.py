"""
Django settings for the store backend.

Every deployment-specific value comes from environment variables (or a
local `.env` file next to manage.py), so the same code runs any store.
"""

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(BASE_DIR / ".env")


def env(key, default=None):
    return os.environ.get(key, default)


def env_bool(key, default=False):
    value = os.environ.get(key)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(key, default=""):
    return [item.strip() for item in env(key, default).split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)
SECRET_KEY = env("DJANGO_SECRET_KEY") or ("dev-only-insecure-key" if DEBUG else None)
if not SECRET_KEY:
    raise RuntimeError("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is off.")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
# The storefront proxies /api to Django, so browser requests carry the site's origin.
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:3100,http://127.0.0.1:3100")
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:3100,http://127.0.0.1:3100")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "corsheaders",
    "apps.core",
    "apps.catalog",
    "apps.inventory",
    "apps.accounts",
    "apps.orders",
    "apps.payments",
    "apps.pos",
    "apps.finance",
    "apps.panel",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "config.middleware.CompressJson",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# SQLite for development; PostgreSQL in production via DB_ENGINE=postgresql.
if env("DB_ENGINE", "sqlite") == "postgresql":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("DB_NAME", "store"),
            "USER": env("DB_USER", "store"),
            "PASSWORD": env("DB_PASSWORD", ""),
            "HOST": env("DB_HOST", "localhost"),
            "PORT": env("DB_PORT", "5432"),
            "CONN_MAX_AGE": 60,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fa"
TIME_ZONE = env("TIME_ZONE", "Asia/Tehran")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = Path(env("MEDIA_ROOT", str(BASE_DIR / "media")))
# Where `manage.py backup` writes its zips. Outside the web root, next to the project.
BACKUP_DIR = Path(env("BACKUP_DIR", str(BASE_DIR.parent / "backups")))
# Shared hosting has no separate web server for uploads, so Django serves them itself.
SERVE_FILES = env_bool("DJANGO_SERVE_FILES", DEBUG)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.Pages",
    "PAGE_SIZE": 24,
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.core.auth.CsrfSessionAuthentication"],
    "DEFAULT_THROTTLE_RATES": {"auth": env("THROTTLE_AUTH", "20/hour"), "track": env("THROTTLE_TRACK", "30/hour")},
}

SESSION_COOKIE_AGE = 60 * 60 * 24 * 30  # customers stay signed in for a month
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"

# SMS: "console" prints messages to the server log; "melipayamak" sends them.
SMS_BACKEND = env("SMS_BACKEND", "console")
if "test" in sys.argv:  # a real backend in .env must never cost money during tests
    SMS_BACKEND = "console"
SMS_USERNAME = env("SMS_USERNAME", "")
SMS_API_KEY = env("SMS_API_KEY", "")  # sent in place of the panel password
SMS_PATTERN_OTP = env("SMS_PATTERN_OTP", "")
SMS_PATTERN_ORDER_PLACED = env("SMS_PATTERN_ORDER_PLACED", "")
SMS_PATTERN_ORDER_STATUS = env("SMS_PATTERN_ORDER_STATUS", "")
SMS_PATTERN_ORDER_SHIPPED = env("SMS_PATTERN_ORDER_SHIPPED", "")
SMS_PATTERN_ADMIN_ORDER = env("SMS_PATTERN_ADMIN_ORDER", "")
SMS_PATTERN_BACK_IN_STOCK = env("SMS_PATTERN_BACK_IN_STOCK", "")
SMS_PATTERN_RETURN_STATUS = env("SMS_PATTERN_RETURN_STATUS", "")

# The storefront's public address. Payment gateways send the customer back here.
SITE_URL = env("SITE_URL", "http://localhost:3100").rstrip("/")

# Online payment: "none" (the store arranges payment by phone), "fake" (a local
# test page, development only) or "zarinpal".
PAYMENT_GATEWAY = env("PAYMENT_GATEWAY", "none")
ZARINPAL_MERCHANT_ID = env("ZARINPAL_MERCHANT_ID", "")
ZARINPAL_SANDBOX = env_bool("ZARINPAL_SANDBOX", False)
# Prices are kept in toman; gateways charge in rial.
PAYMENT_RIAL_PER_UNIT = int(env("PAYMENT_RIAL_PER_UNIT", "10"))
# A customer who leaves the gateway without paying gets the items back in stock after this long.
PAYMENT_TIMEOUT_MINUTES = int(env("PAYMENT_TIMEOUT_MINUTES", "20"))

FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 30 * 1024 * 1024

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
