from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import SAFE_METHODS


class CsrfSessionAuthentication(SessionAuthentication):
    """
    DRF only checks CSRF for signed-in users. Check it for every unsafe request,
    so login, code requests and checkout can't be triggered from another site.
    """

    def authenticate(self, request):
        user = getattr(request._request, "user", None)
        if request.method not in SAFE_METHODS:
            self.enforce_csrf(request)
        if not user or not user.is_active:
            return None
        return (user, None)
