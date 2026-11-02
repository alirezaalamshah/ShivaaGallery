from django.contrib import admin

from .models import Expense


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ["day", "category", "amount", "note", "from_till"]
    list_filter = ["category", "from_till"]
    search_fields = ["note"]
