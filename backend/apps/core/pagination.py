from rest_framework.pagination import PageNumberPagination


class Pages(PageNumberPagination):
    """The usual page of results, plus how many pages there are, so the pager can show numbers around the current one."""

    def get_paginated_response(self, data):
        response = super().get_paginated_response(data)
        response.data["pages"] = self.page.paginator.num_pages
        return response


class StockPages(Pages):
    page_size = 80
