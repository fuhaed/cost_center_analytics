# -*- coding: utf-8 -*-
import frappe
from frappe import _
from cost_center_analytics.permission import has_app_permission

no_cache = 1
RTL_LANGUAGES = ["ar", "he", "fa", "ur"]

def get_context(context):
    """
    Context for the Cost Center Analytics portal index.
    Checks authentication and permissions.
    """
    # 1. Check if user is logged in
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login?redirect-to=/cc-analytics"
        raise frappe.Redirect
        
    # 2. Check if user has permission
    if not has_app_permission():
        frappe.throw(
            _("You do not have permission to access the Cost Center Analytics. Please contact your administrator."),
            frappe.PermissionError
        )
        
    context.no_cache = 1
    context.show_sidebar = False
    
    # Get user details
    context.user = frappe.session.user
    context.user_fullname = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user
    
    # Get default company
    default_company = frappe.defaults.get_user_default("Company")
    if not default_company:
        companies = frappe.get_all("Company", limit=1, pluck="name")
        default_company = companies[0] if companies else ""
    context.default_company = default_company
    
    # Language and Direction (RTL support)
    context.language = frappe.local.lang or "ar"
    context.is_rtl = any(context.language.startswith(rtl) for rtl in RTL_LANGUAGES)
    context.direction = "rtl" if context.is_rtl else "ltr"
    
    return context
