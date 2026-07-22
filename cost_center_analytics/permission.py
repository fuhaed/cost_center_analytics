# -*- coding: utf-8 -*-
import frappe
from frappe import _

ALLOWED_ROLES = ["System Manager", "Administrator", "Cost Center Analytics User"]

@frappe.whitelist()
def has_app_permission(user=None):
    """
    Check if the user has permission to access the Cost Center Analytics app.
    Allowed roles: System Manager, Administrator, Cost Center Analytics User
    """
    if not user:
        user = frappe.session.user
        
    if user == "Guest":
        return False
        
    if user == "Administrator":
        return True
        
    user_roles = frappe.get_roles(user)
    if any(role in user_roles for role in ALLOWED_ROLES):
        return True
        
    return False

@frappe.whitelist(allow_guest=True)
def logout_and_redirect():
    """
    Log out the current user and return redirection target.
    """
    if frappe.session.user and frappe.session.user != "Guest":
        frappe.local.login_manager.logout()
    return {
        "success": True,
        "message": _("Logged out successfully"),
        "redirect": "/login?redirect-to=/cc-analytics"
    }
