from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import StoreSettings
from .serializers import StoreSettingsSerializer


@api_view(["GET"])
def store_settings(request):
    serializer = StoreSettingsSerializer(StoreSettings.load(), context={"request": request})
    return Response(serializer.data)
