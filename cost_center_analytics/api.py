# -*- coding: utf-8 -*-
import frappe
from frappe import _
from frappe.utils import flt, getdate
from cost_center_analytics.permission import has_app_permission

@frappe.whitelist()
def get_companies():
    """
    Get a list of active companies the user can access, excluding parent company templates.
    """
    if not has_app_permission():
        frappe.throw(_("You do not have permission to access this application."), frappe.PermissionError)
        
    return frappe.get_all(
        "Company",
        filters={"name": ["not in", ["الشركه الام", "الشركة الام"]]},
        fields=["name", "company_name", "company_logo"]
    )

@frappe.whitelist()
def get_filters_data(company):
    """
    Get warehouses, branches (from Branch doctype) and cost centers for the selected company.
    """
    if not has_app_permission():
        frappe.throw(_("You do not have permission to access this application."), frappe.PermissionError)
        
    warehouses = frappe.get_all(
        "Warehouse",
        filters={"company": company, "disabled": 0},
        fields=["name", "warehouse_name"],
        order_by="warehouse_name asc"
    )
    
    # Branches from global Branch doctype
    branches = frappe.get_all(
        "Branch",
        fields=["name"],
        order_by="name asc"
    )
    
    # All Cost Centers for the company
    cost_centers = frappe.get_all(
        "Cost Center",
        filters={"company": company, "disabled": 0},
        fields=["name", "cost_center_name", "is_group", "parent_cost_center"],
        order_by="lft asc"
    )
    
    return {
        "warehouses": warehouses,
        "branches": branches,
        "cost_centers": cost_centers
    }

@frappe.whitelist()
def get_dashboard_data(company, from_date, to_date, warehouse=None, branch=None, cost_center=None):
    """
    Fetch and roll up daily sales and P&L metrics by Cost Centers with optional Warehouse, Branch, and Cost Center filtering.
    """
    if not has_app_permission():
        frappe.throw(_("You do not have permission to access this application."), frappe.PermissionError)
        
    if not company or not from_date or not to_date:
        return {"cost_centers": [], "daily_sales": {}, "pl_data": {}}

    # 1. Fetch all cost centers for the company
    cc_list = frappe.db.get_all(
        "Cost Center",
        filters={"company": company, "disabled": 0},
        fields=["name", "cost_center_name", "is_group", "parent_cost_center", "lft", "rgt"],
        order_by="lft asc"
    )
    
    # 2. Build map of descendants for each cost center to roll up child values
    leaf_ccs = [cc for cc in cc_list if not cc.is_group]
    cc_descendants = {}
    
    for cc in cc_list:
        if not cc.is_group:
            cc_descendants[cc.name] = [cc.name]
        else:
            cc_descendants[cc.name] = [
                leaf.name for leaf in leaf_ccs
                if leaf.lft >= cc.lft and leaf.rgt <= cc.rgt
            ]

    # Compile branch invoices if branch (from Branch Doctype) is selected
    branch_invoices_list = None
    if branch:
        branch_invoices = [
            r.sales_invoice for r in frappe.db.get_all(
                "Sales Invoice Additional Fields",
                filters={"branch": branch, "invoice_doctype": "Sales Invoice"},
                fields=["sales_invoice"]
            )
        ]
        branch_invoices_list = branch_invoices if branch_invoices else ["DUMMY_INVOICE_ID"]

    # 3. Fetch Daily Sales Invoice item amounts
    sales_conditions = [
        "si.company = %(company)s",
        "si.docstatus = 1",
        "si.posting_date BETWEEN %(from_date)s AND %(to_date)s"
    ]
    sales_values = {
        "company": company,
        "from_date": from_date,
        "to_date": to_date
    }
    
    if warehouse:
        sales_conditions.append("sii.warehouse = %(warehouse)s")
        sales_values["warehouse"] = warehouse
        
    if cost_center:
        # Cost Center here is the specific cost center (either group or leaf) selected by the user
        descendants = cc_descendants.get(cost_center, [cost_center])
        descendants_list = descendants if descendants else ["DUMMY"]
        sales_conditions.append("sii.cost_center IN %(descendants)s")
        sales_values["descendants"] = descendants_list

    if branch_invoices_list is not None:
        sales_conditions.append("si.name IN %(branch_invoices_list)s")
        sales_values["branch_invoices_list"] = branch_invoices_list

    sales_query = frappe.db.sql(f"""
        SELECT
            si.posting_date,
            sii.cost_center,
            SUM(CASE WHEN si.is_return = 1 THEN -sii.base_net_amount ELSE sii.base_net_amount END) as sales_amount
        FROM
            `tabSales Invoice Item` sii
        INNER JOIN
            `tabSales Invoice` si ON sii.parent = si.name
        WHERE
            { " AND ".join(sales_conditions) }
        GROUP BY
            si.posting_date, sii.cost_center
    """, sales_values, as_dict=True)

    # Organize raw sales: { date: { leaf_cc: amount } }
    raw_daily_sales = {}
    dates_set = set()
    for row in sales_query:
        d_str = str(row.posting_date)
        dates_set.add(d_str)
        if d_str not in raw_daily_sales:
            raw_daily_sales[d_str] = {}
        raw_daily_sales[d_str][row.cost_center or ""] = flt(row.sales_amount)

    # Roll up daily sales for all cost centers (groups and branches)
    daily_sales = {}
    for d_str in sorted(list(dates_set)):
        daily_sales[d_str] = {}
        day_raw = raw_daily_sales.get(d_str, {})
        for cc in cc_list:
            total_sales = sum(flt(day_raw.get(desc, 0)) for desc in cc_descendants[cc.name])
            daily_sales[d_str][cc.name] = total_sales

    # Query daily sales grouped by Branch Doctype
    branch_sales_query = frappe.db.sql(f"""
        SELECT
            si.posting_date,
            siaf.branch,
            SUM(CASE WHEN si.is_return = 1 THEN -sii.base_net_amount ELSE sii.base_net_amount END) as sales_amount
        FROM
            `tabSales Invoice Item` sii
        INNER JOIN
            `tabSales Invoice` si ON sii.parent = si.name
        LEFT JOIN
            `tabSales Invoice Additional Fields` siaf ON siaf.sales_invoice = si.name
        WHERE
            { " AND ".join(sales_conditions) }
        GROUP BY
            si.posting_date, siaf.branch
    """, sales_values, as_dict=True)

    branch_sales = {}
    for row in branch_sales_query:
        d_str = str(row.posting_date)
        b_name = row.branch or "غير محدد"
        if d_str not in branch_sales:
            branch_sales[d_str] = {}
        branch_sales[d_str][b_name] = flt(row.sales_amount)

    # 4. Fetch GL Entry records for P&L (Income and Expense account types)
    pl_conditions = [
        "gle.company = %(company)s",
        "gle.is_cancelled = 0",
        "gle.posting_date BETWEEN %(from_date)s AND %(to_date)s",
        "acc.root_type IN ('Income', 'Expense')"
    ]
    pl_values = {
        "company": company,
        "from_date": from_date,
        "to_date": to_date
    }
    
    if warehouse:
        vouchers = []
        # Sales Invoice Items
        si_v = [r.parent for r in frappe.db.get_all("Sales Invoice Item", filters={"warehouse": warehouse}, fields=["parent"], distinct=True)]
        vouchers.extend(si_v)
        # Purchase Invoice Items
        pi_v = [r.parent for r in frappe.db.get_all("Purchase Invoice Item", filters={"warehouse": warehouse}, fields=["parent"], distinct=True)]
        vouchers.extend(pi_v)
        # Delivery Note Items
        dn_v = [r.parent for r in frappe.db.get_all("Delivery Note Item", filters={"warehouse": warehouse}, fields=["parent"], distinct=True)]
        vouchers.extend(dn_v)
        # Purchase Receipt Items
        pr_v = [r.parent for r in frappe.db.get_all("Purchase Receipt Item", filters={"warehouse": warehouse}, fields=["parent"], distinct=True)]
        vouchers.extend(pr_v)
        # Stock Entry Details
        se_v = [r.parent for r in frappe.db.sql("""
            SELECT DISTINCT parent FROM `tabStock Entry Detail` 
            WHERE s_warehouse = %(warehouse)s OR t_warehouse = %(warehouse)s
        """, {"warehouse": warehouse}, as_dict=True)]
        vouchers.extend(se_v)

        vouchers_list = list(set(vouchers)) if vouchers else ["DUMMY"]
        pl_conditions.append("""
            (
                gle.voucher_no IN %(vouchers_list)s 
                OR gle.voucher_type NOT IN ('Sales Invoice', 'Purchase Invoice', 'Stock Entry', 'Delivery Note', 'Purchase Receipt')
            )
        """)
        pl_values["vouchers_list"] = vouchers_list

    if cost_center:
        descendants = cc_descendants.get(cost_center, [cost_center])
        descendants_list = descendants if descendants else ["DUMMY"]
        pl_conditions.append("gle.cost_center IN %(descendants)s")
        pl_values["descendants"] = descendants_list

    if branch_invoices_list is not None:
        pl_conditions.append("""
            (
                gle.voucher_no IN %(branch_invoices_list)s 
                OR gle.voucher_type != 'Sales Invoice'
            )
        """)
        pl_values["branch_invoices_list"] = branch_invoices_list

    pl_query = frappe.db.sql(f"""
        SELECT
            gle.cost_center,
            acc.root_type,
            SUM(gle.debit) as total_debit,
            SUM(gle.credit) as total_credit
        FROM
            `tabGL Entry` gle
        INNER JOIN
            `tabAccount` acc ON gle.account = acc.name
        WHERE
            { " AND ".join(pl_conditions) }
        GROUP BY
            gle.cost_center, acc.root_type
    """, pl_values, as_dict=True)

    # Organize raw GL Entry balances by leaf cost center: { leaf_cc: { income: X, expense: Y } }
    raw_cc_pl = {}
    for row in pl_query:
        cc_name = row.cost_center or ""
        if cc_name not in raw_cc_pl:
            raw_cc_pl[cc_name] = {"income": 0.0, "expense": 0.0}
            
        deb = flt(row.total_debit)
        crd = flt(row.total_credit)
        
        if row.root_type == "Income":
            raw_cc_pl[cc_name]["income"] += (crd - deb)
        elif row.root_type == "Expense":
            raw_cc_pl[cc_name]["expense"] += (deb - crd)

    # Roll up P&L for all cost centers (groups and branches)
    pl_data = {}
    for cc in cc_list:
        cc_income = sum(flt(raw_cc_pl.get(desc, {}).get("income", 0)) for desc in cc_descendants[cc.name])
        cc_expense = sum(flt(raw_cc_pl.get(desc, {}).get("expense", 0)) for desc in cc_descendants[cc.name])
        cc_profit = cc_income - cc_expense
        cc_margin = (cc_profit / cc_income * 100.0) if cc_income > 0 else 0.0
        
        pl_data[cc.name] = {
            "income": cc_income,
            "expense": cc_expense,
            "profit": cc_profit,
            "margin": cc_margin
        }

    return {
        "cost_centers": cc_list,
        "daily_sales": daily_sales,
        "branch_sales": branch_sales,
        "pl_data": pl_data
    }

@frappe.whitelist()
def get_branch_details(company, cost_center, from_date, to_date, warehouse=None, branch=None):
    """
    Get account-wise Income & Expense details and total sales for a specific Cost Center.
    """
    if not has_app_permission():
        frappe.throw(_("You do not have permission to access this application."), frappe.PermissionError)

    if not frappe.db.exists("Cost Center", cost_center):
        return {"error": "Cost Center does not exist"}

    cc_info = frappe.db.get_value("Cost Center", cost_center, ["name", "cost_center_name", "is_group", "lft", "rgt"], as_dict=True)
    
    # Get descendants
    descendants = [r.name for r in frappe.db.get_all(
        "Cost Center",
        filters={"company": company, "lft": (">=", cc_info.lft), "rgt": ("<=", cc_info.rgt), "disabled": 0},
        fields=["name"]
    )]
    descendants_list = descendants if descendants else [cost_center]

    # Compile branch invoices if branch (from Branch Doctype) is selected
    branch_invoices_list = None
    if branch:
        branch_invoices = [
            r.sales_invoice for r in frappe.db.get_all(
                "Sales Invoice Additional Fields",
                filters={"branch": branch, "invoice_doctype": "Sales Invoice"},
                fields=["sales_invoice"]
            )
        ]
        branch_invoices_list = branch_invoices if branch_invoices else ["DUMMY_INVOICE_ID"]

    # Build GL Entry conditions
    pl_conditions = [
        "gle.company = %(company)s",
        "gle.is_cancelled = 0",
        "gle.posting_date BETWEEN %(from_date)s AND %(to_date)s",
        "gle.cost_center IN %(descendants)s",
        "acc.root_type IN ('Income', 'Expense')"
    ]
    pl_values = {
        "company": company,
        "from_date": from_date,
        "to_date": to_date,
        "descendants": descendants_list
    }

    if warehouse:
        vouchers = []
        # Sales Invoice Items
        si_v = [r.parent for r in frappe.db.get_all("Sales Invoice Item", filters={"warehouse": warehouse}, fields=["parent"], distinct=True)]
        vouchers.extend(si_v)
        # Purchase Invoice Items
        pi_v = [r.parent for r in frappe.db.get_all("Purchase Invoice Item", filters={"warehouse": warehouse}, fields=["parent"], distinct=True)]
        vouchers.extend(pi_v)
        # Delivery Note Items
        dn_v = [r.parent for r in frappe.db.get_all("Delivery Note Item", filters={"warehouse": warehouse}, fields=["parent"], distinct=True)]
        vouchers.extend(dn_v)
        # Purchase Receipt Items
        pr_v = [r.parent for r in frappe.db.get_all("Purchase Receipt Item", filters={"warehouse": warehouse}, fields=["parent"], distinct=True)]
        vouchers.extend(pr_v)
        # Stock Entry Details
        se_v = [r.parent for r in frappe.db.sql("""
            SELECT DISTINCT parent FROM `tabStock Entry Detail` 
            WHERE s_warehouse = %(warehouse)s OR t_warehouse = %(warehouse)s
        """, {"warehouse": warehouse}, as_dict=True)]
        vouchers.extend(se_v)

        vouchers_list = list(set(vouchers)) if vouchers else ["DUMMY"]
        pl_conditions.append("""
            (
                gle.voucher_no IN %(vouchers_list)s 
                OR gle.voucher_type NOT IN ('Sales Invoice', 'Purchase Invoice', 'Stock Entry', 'Delivery Note', 'Purchase Receipt')
            )
        """)
        pl_values["vouchers_list"] = vouchers_list

    if branch_invoices_list is not None:
        pl_conditions.append("""
            (
                gle.voucher_no IN %(branch_invoices_list)s 
                OR gle.voucher_type != 'Sales Invoice'
            )
        """)
        pl_values["branch_invoices_list"] = branch_invoices_list

    # Execute query grouped by account
    accounts_query = frappe.db.sql(f"""
        SELECT
            gle.account,
            acc.account_name,
            acc.root_type,
            SUM(gle.debit) as total_debit,
            SUM(gle.credit) as total_credit
        FROM
            `tabGL Entry` gle
        INNER JOIN
            `tabAccount` acc ON gle.account = acc.name
        WHERE
            { " AND ".join(pl_conditions) }
        GROUP BY
            gle.account, acc.account_name, acc.root_type
        ORDER BY
            acc.root_type DESC, acc.account_name ASC
    """, pl_values, as_dict=True)

    # Format account list
    incomes = []
    expenses = []
    
    total_income = 0.0
    total_expense = 0.0

    for row in accounts_query:
        deb = flt(row.total_debit)
        crd = flt(row.total_credit)
        
        if row.root_type == "Income":
            bal = crd - deb
            if bal != 0:
                incomes.append({
                    "account": row.account,
                    "account_name": row.account_name,
                    "amount": bal
                })
                total_income += bal
        elif row.root_type == "Expense":
            bal = deb - crd
            if bal != 0:
                expenses.append({
                    "account": row.account,
                    "account_name": row.account_name,
                    "amount": bal
                })
                total_expense += bal

    # Fetch daily sales trend specifically for this cost center
    sales_conditions = [
        "si.company = %(company)s",
        "si.docstatus = 1",
        "si.posting_date BETWEEN %(from_date)s AND %(to_date)s",
        "sii.cost_center IN %(descendants)s"
    ]
    sales_values = {
        "company": company,
        "from_date": from_date,
        "to_date": to_date,
        "descendants": descendants_list
    }
    if warehouse:
        sales_conditions.append("sii.warehouse = %(warehouse)s")
        sales_values["warehouse"] = warehouse
        
    if branch_invoices_list is not None:
        sales_conditions.append("si.name IN %(branch_invoices_list)s")
        sales_values["branch_invoices_list"] = branch_invoices_list

    sales_trend_query = frappe.db.sql(f"""
        SELECT
            si.posting_date,
            SUM(CASE WHEN si.is_return = 1 THEN -sii.base_net_amount ELSE sii.base_net_amount END) as sales_amount
        FROM
            `tabSales Invoice Item` sii
        INNER JOIN
            `tabSales Invoice` si ON sii.parent = si.name
        WHERE
            { " AND ".join(sales_conditions) }
        GROUP BY
            si.posting_date
        ORDER BY
            si.posting_date ASC
    """, sales_values, as_dict=True)

    sales_trend = [{"date": str(r.posting_date), "amount": flt(r.sales_amount)} for r in sales_trend_query]
    total_sales = sum(r["amount"] for r in sales_trend)

    return {
        "cost_center_name": cc_info.cost_center_name,
        "is_group": cc_info.is_group,
        "total_sales": total_sales,
        "total_income": total_income,
        "total_expense": total_expense,
        "net_profit": total_income - total_expense,
        "incomes": incomes,
        "expenses": expenses,
        "sales_trend": sales_trend
    }


def build_gl_conditions(company, from_date, to_date, warehouse=None, branch=None, cost_center=None):
    conditions = [
        "gle.company = %(company)s",
        "gle.is_cancelled = 0",
        "gle.posting_date BETWEEN %(from_date)s AND %(to_date)s"
    ]
    values = {
        "company": company,
        "from_date": from_date,
        "to_date": to_date
    }
    
    # 1. Warehouse filter
    if warehouse:
        vouchers = []
        si_v = [r.parent for r in frappe.db.get_all("Sales Invoice Item", filters={"warehouse": warehouse}, fields=["parent"], distinct=True)]
        vouchers.extend(si_v)
        pi_v = [r.parent for r in frappe.db.get_all("Purchase Invoice Item", filters={"warehouse": warehouse}, fields=["parent"], distinct=True)]
        vouchers.extend(pi_v)
        dn_v = [r.parent for r in frappe.db.get_all("Delivery Note Item", filters={"warehouse": warehouse}, fields=["parent"], distinct=True)]
        vouchers.extend(dn_v)
        pr_v = [r.parent for r in frappe.db.get_all("Purchase Receipt Item", filters={"warehouse": warehouse}, fields=["parent"], distinct=True)]
        vouchers.extend(pr_v)
        se_v = [r.parent for r in frappe.db.sql("""
            SELECT DISTINCT parent FROM `tabStock Entry Detail` 
            WHERE s_warehouse = %(warehouse)s OR t_warehouse = %(warehouse)s
        """, {"warehouse": warehouse}, as_dict=True)]
        vouchers.extend(se_v)
        
        vouchers_list = list(set(vouchers)) if vouchers else ["DUMMY"]
        conditions.append("""
            (
                gle.voucher_no IN %(vouchers_list)s 
                OR gle.voucher_type NOT IN ('Sales Invoice', 'Purchase Invoice', 'Stock Entry', 'Delivery Note', 'Purchase Receipt')
            )
        """)
        values["vouchers_list"] = vouchers_list

    # 2. Branch filter
    if branch:
        branch_invoices = [
            r.sales_invoice for r in frappe.db.get_all(
                "Sales Invoice Additional Fields",
                filters={"branch": branch, "invoice_doctype": "Sales Invoice"},
                fields=["sales_invoice"]
            )
        ]
        branch_invoices_list = branch_invoices if branch_invoices else ["DUMMY_INVOICE_ID"]
        conditions.append("""
            (
                gle.voucher_no IN %(branch_invoices_list)s 
                OR gle.voucher_type != 'Sales Invoice'
            )
        """)
        values["branch_invoices_list"] = branch_invoices_list

    # 3. Cost Center filter
    if cost_center:
        # Resolve descendants (including subgroups)
        cc_info = frappe.db.get_value("Cost Center", cost_center, ["lft", "rgt"], as_dict=True)
        if cc_info:
            descendants = frappe.get_all(
                "Cost Center",
                filters={"lft": (">=", cc_info.lft), "rgt": ("<=", cc_info.rgt), "company": company},
                pluck="name"
            )
            descendants_list = descendants if descendants else [cost_center]
        else:
            descendants_list = [cost_center]
            
        conditions.append("gle.cost_center IN %(descendants)s")
        values["descendants"] = descendants_list

    return conditions, values


@frappe.whitelist()
def get_expense_analysis(company, from_date, to_date, warehouse=None, branch=None, cost_center=None):
    """
    Fetch all expenses grouped by account for the selected period and filters.
    """
    from cost_center_analytics.permission import has_app_permission
    if not has_app_permission():
        frappe.throw(_("Not permitted"), frappe.PermissionError)
        
    conditions, values = build_gl_conditions(company, from_date, to_date, warehouse, branch, cost_center)
    conditions.append("acc.root_type = 'Expense'")
    
    query = frappe.db.sql(f"""
        SELECT
            gle.account,
            acc.account_name,
            SUM(gle.debit - gle.credit) as amount
        FROM
            `tabGL Entry` gle
        INNER JOIN
            `tabAccount` acc ON gle.account = acc.name
        WHERE
            { " AND ".join(conditions) }
        GROUP BY
            gle.account
        ORDER BY
            amount DESC
    """, values, as_dict=True)
    
    result = []
    for r in query:
        val = flt(r.amount)
        if val > 0:
            result.append({
                "account": r.account,
                "account_name": r.account_name,
                "amount": val
            })
            
    return result


@frappe.whitelist()
def get_cash_flow(company, from_date, to_date, warehouse=None, branch=None, cost_center=None):
    """
    Fetch bank and cash account balances for the selected filters.
    """
    from cost_center_analytics.permission import has_app_permission
    if not has_app_permission():
        frappe.throw(_("Not permitted"), frappe.PermissionError)
        
    conditions, values = build_gl_conditions(company, from_date, to_date, warehouse, branch, cost_center)
    conditions.append("acc.account_type IN ('Bank', 'Cash')")
    
    query = frappe.db.sql(f"""
        SELECT
            gle.account,
            acc.account_name,
            acc.account_type,
            SUM(gle.debit - gle.credit) as balance
        FROM
            `tabGL Entry` gle
        INNER JOIN
            `tabAccount` acc ON gle.account = acc.name
        WHERE
            { " AND ".join(conditions) }
        GROUP BY
            gle.account
    """, values, as_dict=True)
    
    result = []
    for r in query:
        val = flt(r.balance)
        result.append({
            "account": r.account,
            "account_name": r.account_name,
            "account_type": r.account_type,
            "balance": val
        })
        
    return result

