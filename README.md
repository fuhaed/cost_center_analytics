# Cost Center Analytics

A custom advanced financial analytics dashboard portal for Cost Centers and Branches in **Frappe / ERPNext**. This app provides beautiful interactive charts, tabular reports, and core financial summaries (Total Sales, Total Income, Total Expenses, and Net Profit/Loss) fetched directly from general ledger entries.

---

## 🚀 Quick Installation Guide

To install and configure this application on your bench, run the following commands sequentially inside your `frappe-bench` directory:

```bash
# 1. Navigate to your main bench directory
cd ~/frappe-bench

# 2. Fetch the app from the GitHub repository
bench get-app https://github.com/fuhaed/cost_center_analytics.git

# 3. Install the app on your target site
bench --site [your-site-name] install-app cost_center_analytics

# 4. Build assets for production
bench build --app cost_center_analytics

# 5. Clear site cache
bench --site [your-site-name] clear-cache

# 6. Restart the bench supervisors
bench restart
```
*💡 Note: Replace `[your-site-name]` with your active site domain (e.g. `erp.erpnext.support` or `site1.local`).*

---

## 🛡️ User Permission & Roles Guide

During installation, the application automatically provisions a custom role in the database:
* **Custom Role Created:** `Cost Center Analytics User`
* **Default Authorized Roles:**
  * System Manager & Administrator (implicit access for system admins).
  * Any normal user or employee explicitly assigned the `Cost Center Analytics User` role.

### Steps to assign access to an employee:
1. Log in to ERPNext as an Administrator or System Manager.
2. Search and open the **User** list and select the target user.
3. Scroll down to the **Roles** checklist table.
4. Check the box next to **`Cost Center Analytics User`** and save the document.
5. The user will immediately be able to access the dashboard at `/cc-analytics`.

---

## ✨ Key Features

1. **General Ledger Precision:** Core totals (Revenue, Expense, Net Profit) are fetched directly from the general ledger database (`tabGL Entry`), ensuring absolute financial accuracy.
2. **Quick Date Filter Pills:** Dynamic modern date selector buttons (Today, Yesterday, This Week, This Month, Last Month, This Year) that automatically calculate dates and refresh data.
3. **Smart Time-Series Aggregation:** Automatically switches chart X-axis grouping dynamically (Daily for ranges <= 7 days, Weekly for ranges 8 to 31 days, and Monthly for ranges > 31 days) to keep charts legible.
4. **Top-N Performance Grouping:** For companies with many branches/groups, the app automatically plots the top 4 performers and groups the remaining ones into a single `"Others"` dataset, avoiding cluttered visual charts.
5. **Dark & Light Mode Toggle:** Seamless single-click transition with premium color palettes.
6. **RTL Direction & Arabic Support:** Built to adapt correctly to both LTR and RTL orientations based on standard browser language configuration.
