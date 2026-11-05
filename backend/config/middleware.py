from django.middleware.gzip import GZipMiddleware


class CompressJson(GZipMiddleware):
    """Shrinks API answers. Files are streamed and already compressed, so they pass through untouched."""

    def process_response(self, request, response):
        if response.streaming:
            return response
        return super().process_response(request, response)
