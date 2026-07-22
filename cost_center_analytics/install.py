# -*- coding: utf-8 -*-
import frappe

def after_install():
    """
    Code to run after the Cost Center Analytics app is installed.
    Automatically creates the custom 'Cost Center Analytics User' Role if it doesn't exist.
    """
    create_custom_roles()

def create_custom_roles():
    role_name = "Cost Center Analytics User"
    if not frappe.db.exists("Role", role_name):
        role = frappe.new_doc("Role")
        role.role_name = role_name
        role.insert(ignore_permissions=True)
        frappe.db.commit()
