from django.db.models import Q
from rest_framework.filters import SearchFilter

# Text typed on an Arabic keyboard uses different code points for ی and ک.
ARABIC_TO_PERSIAN = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه"})
PERSIAN_TO_ARABIC = str.maketrans({"ی": "ي", "ک": "ك"})


def spellings(term):
    """The term as written, in Persian letters, and in Arabic letters, so either finds the other."""
    persian = term.translate(ARABIC_TO_PERSIAN)
    return {term, persian, persian.translate(PERSIAN_TO_ARABIC)}


class PersianSearchFilter(SearchFilter):
    """DRF's search, but ی/ي and ک/ك match each other."""

    def filter_queryset(self, request, queryset, view):
        fields = getattr(view, "search_fields", None)
        terms = self.get_search_terms(request)
        if not fields or not terms:
            return queryset
        for term in terms:
            match = Q()
            for spelling in spellings(term):
                for field in fields:
                    match |= Q(**{f"{field}__icontains": spelling})
            queryset = queryset.filter(match)
        return queryset.distinct()
