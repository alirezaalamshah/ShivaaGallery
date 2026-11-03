from datetime import date, timedelta

from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.roles import needs
from apps.panel.views import StaffMixin
from apps.pos.services import day_range

from .models import Expense
from .reports import full_report


class ExpenseSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = Expense
        fields = ["id", "day", "category", "category_label", "amount", "note", "from_till", "created_at"]


class ExpenseViewSet(StaffMixin, viewsets.ModelViewSet):
    access = {"read": "expenses.view", "write": "expenses.edit", "destroy": "expenses.delete"}
    """The shop's running costs. ?from=&to= (days) narrow the list; the response adds the total."""

    serializer_class = ExpenseSerializer
    pagination_class = None

    def get_queryset(self):
        qs = Expense.objects.all()
        p = self.request.query_params
        for key, lookup in (("from", "day__gte"), ("to", "day__lte")):
            try:
                qs = qs.filter(**{lookup: date.fromisoformat(p.get(key, ""))})
            except ValueError:
                pass
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        return Response({
            "total": qs.aggregate(n=Coalesce(Sum("amount"), 0))["n"],
            "categories": [{"value": v, "label": label} for v, label in Expense.Category.choices],
            "results": ExpenseSerializer(qs[:1000], many=True).data,
        })


def _days(params):
    """?from=YYYY-MM-DD&to=YYYY-MM-DD, both included. Defaults to the last 30 days."""
    today = timezone.localdate()
    try:
        last = min(date.fromisoformat(params.get("to", "")), today)
    except ValueError:
        last = today
    try:
        first = date.fromisoformat(params.get("from", ""))
    except ValueError:
        first = last - timedelta(days=29)
    return min(first, last), last


@api_view(["GET"])
@permission_classes([needs("reports.view")])
def report(request):
    first, last = _days(request.query_params)
    start, end = day_range(first)[0], day_range(last)[1]
    return Response(full_report(start, end, first, last))
