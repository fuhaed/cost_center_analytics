/*
   Cost Center Analytics Dashboard Logic
   Path: public/js/analytics.js
*/

// Global state variables
let companies = [];
let currentCompany = "";
let currentTab = "dashboard";
let dashboardData = null;
let charts = {};

// Pagination state variables
let salesPageSize = 10;
let salesCurrentPage = 1;
let plPageSize = 10;
let plCurrentPage = 1;

// Default dates: start of current month to today
const today = new Date();
const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

const formatDateForInput = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

document.addEventListener("DOMContentLoaded", function() {
    // 1. Initialize Date Filters
    document.getElementById("filter-from-date").value = formatDateForInput(firstDayOfMonth);
    document.getElementById("filter-to-date").value = formatDateForInput(today);
    
    // 2. Set Theme from local storage or system preference
    if (localStorage.getItem("cc-theme") === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
        updateThemeIcon("dark");
    } else {
        document.documentElement.setAttribute("data-theme", "light");
        updateThemeIcon("light");
    }
    
    // 3. Tab switching listeners
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", function() {
            document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
            this.classList.add("active");
            
            const tabId = this.getAttribute("data-tab");
            switchTab(tabId);
        });
    });

    // 4. Filter listeners
    document.getElementById("filter-cc-type").addEventListener("change", function() {
        if (dashboardData) {
            salesCurrentPage = 1;
            plCurrentPage = 1;
            renderDailySalesTable();
            renderDailySalesCharts();
            renderPLTable();
            renderPLCharts();
        }
    });
    
    document.getElementById("filter-warehouse").addEventListener("change", loadData);
    document.getElementById("filter-cost-center").addEventListener("change", loadData);

    const clearActivePills = () => {
        document.querySelectorAll(".btn-pill").forEach(btn => btn.classList.remove("active"));
    };
    document.getElementById("filter-from-date").addEventListener("input", clearActivePills);
    document.getElementById("filter-to-date").addEventListener("input", clearActivePills);

    // 5. Load Companies list
    initCompanies();
});

// Theme Management
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("cc-theme", newTheme);
    updateThemeIcon(newTheme);
    
    // Re-draw charts with adjusted theme colors if data exists
    if (dashboardData) {
        renderDailySalesCharts();
        renderPLCharts();
    }
}

function updateThemeIcon(theme) {
    const icon = document.querySelector("#themeToggleBtn i");
    if (!icon) return;
    if (theme === "dark") {
        icon.className = "fa-solid fa-sun";
    } else {
        icon.className = "fa-solid fa-moon";
    }
}

// Tab Switching
function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.getElementById(`tab-${tabId}`).classList.add("active");
    
    // Show/Hide KPI grid based on active tab
    const kpiGrid = document.querySelector(".kpi-grid");
    if (kpiGrid) {
        if (tabId === "dashboard") {
            kpiGrid.style.display = "grid";
        } else {
            kpiGrid.style.display = "none";
        }
    }
    
    const mainTitle = document.getElementById("page-main-title");
    const subTitle = document.getElementById("page-sub-title");
    
    if (tabId === "dashboard") {
        mainTitle.innerText = "لوحة التحكم الرئيسية لمراكز التكلفة";
        subTitle.innerText = "نظرة شاملة ومؤشرات أداء المبيعات والأرباح والتكاليف";
    } else if (tabId === "daily-sales") {
        mainTitle.innerText = "تقرير المبيعات اليومي لمراكز التكلفة";
        subTitle.innerText = "تحليلات وجدول المبيعات اليومية التفصيلية حسب مراكز التكلفة";
    } else if (tabId === "pl-report") {
        mainTitle.innerText = "تقرير الأرباح والخسائر لمراكز التكلفة";
        subTitle.innerText = "تحليل شامل للإيرادات والمصروفات وصافي الأرباح لمراكز التكلفة";
    } else if (tabId === "leaderboard") {
        mainTitle.innerText = "ترتيب أداء مراكز التكلفة";
        subTitle.innerText = "تصنيف وترتيب مراكز التكلفة الأكثر مبيعاً وربحية خلال الفترة";
        renderLeaderboard();
    } else if (tabId === "expenses") {
        mainTitle.innerText = "تحليل بنود المصروفات";
        subTitle.innerText = "نظرة تفصيلية ومخططات بيانية لأماكن صرف ميزانية الشركة";
        loadExpenseAnalysis();
    } else if (tabId === "cashflow") {
        mainTitle.innerText = "التدفقات النقدية والسيولة";
        subTitle.innerText = "أرصدة حسابات الصناديق والسيولة المالية المتوفرة للبنوك";
        loadCashFlow();
    } else if (tabId === "stock") {
        mainTitle.innerText = "مخزون المستودعات وتقييمها";
        subTitle.innerText = "تحليل كميات وقيمة البضاعة المتوفرة في مستودعات الشركة";
        loadWarehouseStock();
    }
}

// API calling utility
function callAPI(method, args = {}) {
    return new Promise((resolve, reject) => {
        if (window.frappe && window.frappe.call) {
            frappe.call({
                method: method,
                args: args,
                callback: function(r) {
                    resolve(r.message);
                },
                error: function(err) {
                    reject(err);
                }
            });
        } else {
            // fallback fetch
            fetch(`/api/method/${method}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Frappe-CSRF-Token': window.csrf_token || ''
                },
                body: JSON.stringify(args)
            })
            .then(res => res.json())
            .then(data => {
                if (data.exc) {
                    reject(data.exc);
                } else {
                    resolve(data.message);
                }
            })
            .catch(err => reject(err));
        }
    });
}

function showLoader(show) {
    const overlay = document.getElementById("loading-overlay");
    if (show) {
        overlay.classList.add("active");
    } else {
        overlay.classList.remove("active");
    }
}

// Initialize Companies filter
async function initCompanies() {
    showLoader(true);
    try {
        const response = await callAPI("cost_center_analytics.api.get_companies");
        companies = response || [];
        const select = document.getElementById("filter-company");
        select.innerHTML = "";
        
        if (companies.length === 0) {
            select.innerHTML = "<option value=''>لا توجد شركات</option>";
            showLoader(false);
            return;
        }

        window.companiesList = companies;
        companies.forEach(company => {
            const option = document.createElement("option");
            option.value = company.name;
            option.text = company.company_name;
            select.appendChild(option);
        });

        // Set default company
        let defaultCompany = "{{ default_company }}";
        if (defaultCompany === "الشركه الام" || defaultCompany === "الشركة الام" || !companies.some(c => c.name === defaultCompany)) {
            defaultCompany = companies[0].name;
        }
        select.value = defaultCompany;
        
        currentCompany = select.value;
        
        // Load Warehouses and Branches filters
        await loadFiltersData(currentCompany);
        
        // Load initial dashboard data
        await loadData();
    } catch (err) {
        console.error("Failed to load companies:", err);
        alert("فشل تحميل قائمة الشركات المصرح بها.");
    } finally {
        showLoader(false);
    }
}

// Load Warehouses and Branches metadata filters list
async function loadFiltersData(company) {
    try {
        const res = await callAPI("cost_center_analytics.api.get_filters_data", { company });
        const warehouseSelect = document.getElementById("filter-warehouse");
        const costCenterSelect = document.getElementById("filter-cost-center");
        
        warehouseSelect.innerHTML = '<option value="">كل المستودعات</option>';
        costCenterSelect.innerHTML = '<option value="">كل مراكز التكلفة</option>';
        
        if (res) {
            if (res.warehouses) {
                res.warehouses.forEach(w => {
                    const option = document.createElement("option");
                    option.value = w.name;
                    option.text = w.warehouse_name || w.name;
                    warehouseSelect.appendChild(option);
                });
            }
            if (res.cost_centers) {
                res.cost_centers.forEach(cc => {
                    const option = document.createElement("option");
                    option.value = cc.name;
                    
                    // Calculate visual indentation based on group hierarchy depth
                    let depth = 0;
                    let parent = cc.parent_cost_center;
                    while (parent && res.cost_centers.some(c => c.name === parent)) {
                        depth++;
                        parent = res.cost_centers.find(c => c.name === parent).parent_cost_center;
                    }
                    
                    let indent = "";
                    for (let i = 0; i < depth; i++) {
                        indent += "\u00A0\u00A0\u00A0\u00A0"; // 4 non-breaking spaces
                    }
                    
                    option.text = indent + (cc.cost_center_name || cc.name);
                    costCenterSelect.appendChild(option);
                });

                // Populate comparison selectors
                const comp1 = document.getElementById("compare-cc-1");
                const comp2 = document.getElementById("compare-cc-2");
                if (comp1 && comp2) {
                    comp1.innerHTML = "";
                    comp2.innerHTML = "";
                    res.cost_centers.forEach((cc) => {
                        const opt1 = document.createElement("option");
                        opt1.value = cc.name;
                        opt1.text = cc.cost_center_name || cc.name;
                        comp1.appendChild(opt1);
                        
                        const opt2 = document.createElement("option");
                        opt2.value = cc.name;
                        opt2.text = cc.cost_center_name || cc.name;
                        comp2.appendChild(opt2);
                    });
                    
                    if (res.cost_centers.length > 1) {
                        comp1.selectedIndex = 0;
                        comp2.selectedIndex = 1;
                    }
                }
            }
        }
    } catch (err) {
        console.error("Error loading filters data:", err);
    }
}

// Company Change listener
window.onCompanyChange = async function() {
    const select = document.getElementById("filter-company");
    currentCompany = select.value;
    showLoader(true);
    await loadFiltersData(currentCompany);
    await loadData();
    showLoader(false);
};

// Load Dashboard Data
async function loadData() {
    const company = document.getElementById("filter-company").value;
    const from_date = document.getElementById("filter-from-date").value;
    const to_date = document.getElementById("filter-to-date").value;
    const warehouse = document.getElementById("filter-warehouse").value;
    const cost_center = document.getElementById("filter-cost-center").value;
    
    if (!company || !from_date || !to_date) {
        alert("يرجى إكمال جميع حقول التصفية أولاً.");
        return;
    }
    
    showLoader(true);
    try {
        const result = await callAPI("cost_center_analytics.api.get_dashboard_data", {
            company: company,
            from_date: from_date,
            to_date: to_date,
            warehouse: warehouse,
            cost_center: cost_center
        });
        
        dashboardData = result;
        updateSidebarBranding(company);
        
        // Reset pages on fresh loads
        salesCurrentPage = 1;
        plCurrentPage = 1;
        
        // 1. Calculate and update KPI Cards
        calculateKPIs();
        
        // 2. Render Daily Sales Report Tab Elements
        renderDailySalesTable();
        renderDailySalesCharts();
        
        // 3. Render P&L Report Tab Elements
        renderPLTable();
        renderPLCharts();
        
        // 4. Render active Executive tab if selected
        if (currentTab === "leaderboard") {
            renderLeaderboard();
        } else if (currentTab === "expenses") {
            loadExpenseAnalysis();
        } else if (currentTab === "cashflow") {
            loadCashFlow();
        } else if (currentTab === "stock") {
            loadWarehouseStock();
        } else if (currentTab === "comparison") {
            renderComparison();
        } else if (currentTab === "peakhours") {
            loadPeakHours();
        } else if (currentTab === "salespersons") {
            loadSalespersons();
        }
        
    } catch (err) {
        console.error("Error loading dashboard data:", err);
        alert("حدث خطأ أثناء تحميل بيانات تقارير مراكز التكلفة.");
    } finally {
        showLoader(false);
    }
}

// Calculate top KPI totals
function calculateKPIs() {
    if (!dashboardData) return;
    
    // Total Sales (from Daily Sales sums)
    let totalSales = 0;
    const leafCCs = dashboardData.cost_centers.filter(cc => !cc.is_group);
    
    // Accumulate total sales across all dates for leaf cost centers
    for (const d in dashboardData.daily_sales) {
        leafCCs.forEach(cc => {
            totalSales += (dashboardData.daily_sales[d][cc.name] || 0);
        });
    }
    
    // Accumulate total Income and Expense for leaf cost centers
    let totalIncome = 0;
    let totalExpenses = 0;
    leafCCs.forEach(cc => {
        const pl = dashboardData.pl_data[cc.name] || {};
        totalIncome += (pl.income || 0);
        totalExpenses += (pl.expense || 0);
    });
    
    let netProfit = totalIncome - totalExpenses;
    
    // Format values to display
    document.getElementById("kpi-total-sales").innerText = formatCurrency(totalSales);
    document.getElementById("kpi-total-income").innerText = formatCurrency(totalIncome);
    document.getElementById("kpi-total-expenses").innerText = formatCurrency(totalExpenses);
    
    // 1. Sales Badge (leaf cost centers count)
    document.getElementById("kpi-sales-badge").innerHTML = `<i class="fa-solid fa-circle" style="font-size: 5px; color:#10b981; margin-left:4px;"></i>${leafCCs.length} مركزاً`;
    
    // 2. Income Badge (ratio of Income to Sales)
    const incomeRatio = totalSales > 0 ? (totalIncome / totalSales * 100).toFixed(0) : 100;
    document.getElementById("kpi-income-badge").innerText = `معدل: ${incomeRatio}%`;
    
    // 3. Expenses Badge (ratio of Expenses to Income)
    const expenseRatio = totalIncome > 0 ? (totalExpenses / totalIncome * 100).toFixed(0) : 0;
    const expBadge = document.getElementById("kpi-expenses-badge");
    expBadge.innerText = `معدل: ${expenseRatio}%`;
    if (expenseRatio > 100) {
        expBadge.className = "kpi-badge danger";
    } else {
        expBadge.className = "kpi-badge neutral";
    }

    // 4. Profit Badge (Margin)
    const profitEl = document.getElementById("kpi-net-profit");
    const profitIcon = document.getElementById("kpi-profit-icon");
    const profitDesc = document.getElementById("kpi-profit-desc");
    const profitBadge = document.getElementById("kpi-profit-badge");
    
    profitEl.innerText = formatCurrency(netProfit);
    
    const profitMargin = totalIncome > 0 ? (netProfit / totalIncome * 100).toFixed(1) : 0;
    
    if (netProfit >= 0) {
        profitEl.style.color = "#10b981";
        profitIcon.className = "kpi-icon profit";
        profitIcon.style.color = "#10b981";
        profitIcon.style.backgroundColor = "rgba(16, 185, 129, 0.12)";
        profitDesc.innerText = "صافي أرباح تشغيلية موجبة للفترة";
        profitBadge.className = "kpi-badge success";
        profitBadge.innerText = `الهامش: +${profitMargin}%`;
    } else {
        profitEl.style.color = "#ef4444";
        profitIcon.className = "kpi-icon profit";
        profitIcon.style.color = "#ef4444";
        profitIcon.style.backgroundColor = "rgba(239, 68, 68, 0.12)";
        profitDesc.innerText = "صافي خسائر تشغيلية متراكمة بالفترة";
        profitBadge.className = "kpi-badge danger";
        profitBadge.innerText = `الهامش: ${profitMargin}%`;
    }
}

// Render Daily Sales Grid Table
function renderDailySalesTable() {
    if (!dashboardData) return;
    
    const typeFilter = document.getElementById("filter-cc-type").value;
    const headerRow = document.getElementById("table-daily-sales-header");
    const body = document.getElementById("table-daily-sales-body");
    
    // Clear elements
    headerRow.innerHTML = "<th>التاريخ</th>";
    body.innerHTML = "";
    
    // Filter cost centers based on choice
    let filteredCCs = getFilteredCostCenters(typeFilter);
    
    if (filteredCCs.length === 0) {
        headerRow.innerHTML += "<th>لا توجد مراكز تكلفة</th>";
        body.innerHTML = "<tr><td colspan='2' class='text-center'>لا توجد بيانات مراكز تكلفة مطابقة لتصميم التصفية.</td></tr>";
        document.getElementById("sales-pagination-bar").innerHTML = "";
        return;
    }
    
    // Create headers (Groups styled differently than Branches)
    filteredCCs.forEach(cc => {
        const th = document.createElement("th");
        th.innerHTML = `<a href="#" class="cc-header-link" onclick="event.preventDefault(); window.showDrilldown('${cc.name}');">${cc.cost_center_name}</a>`;
        if (cc.is_group) {
            th.className = "th-group";
            th.title = `${cc.cost_center_name} (مجموعة)`;
        } else {
            th.className = "th-branch";
            th.title = `${cc.cost_center_name} (مركز فرعي)`;
        }
        headerRow.appendChild(th);
    });
    
    // Total column header
    const thTotal = document.createElement("th");
    thTotal.innerText = "الإجمالي اليومي";
    thTotal.className = "th-total";
    headerRow.appendChild(thTotal);
    
    // Filter dates to only include those that have sales for the currently filtered/displayed cost centers
    const dates = Object.keys(dashboardData.daily_sales)
        .filter(d => {
            return filteredCCs.some(cc => (dashboardData.daily_sales[d][cc.name] || 0) > 0);
        })
        .sort();
        
    if (dates.length === 0) {
        body.innerHTML = `<tr><td colspan="${filteredCCs.length + 2}" style="text-align: center; color: var(--text-muted); padding: 30px;">لا توجد مبيعات مسجلة في الفواتير المعتمدة لمراكز التكلفة المحددة خلال هذه الفترة.</td></tr>`;
        document.getElementById("sales-pagination-bar").innerHTML = "";
        return;
    }
    
    // 1. Client-Side Pagination Slicing for Dates
    const totalDates = dates.length;
    const totalPages = Math.ceil(totalDates / salesPageSize);
    if (salesCurrentPage > totalPages) salesCurrentPage = totalPages || 1;
    
    const startIdx = (salesCurrentPage - 1) * salesPageSize;
    const endIdx = startIdx + salesPageSize;
    const paginatedDates = dates.slice(startIdx, endIdx);
    
    // Fill row cells
    paginatedDates.forEach(d => {
        const tr = document.createElement("tr");
        const tdDate = document.createElement("td");
        tdDate.innerText = d;
        tdDate.style.fontWeight = "bold";
        tr.appendChild(tdDate);
        
        let rowSum = 0;
        
        filteredCCs.forEach(cc => {
            const val = dashboardData.daily_sales[d][cc.name] || 0;
            const td = document.createElement("td");
            td.innerText = val > 0 ? formatCurrency(val) : "-";
            if (cc.is_group) {
                td.className = "td-group";
            } else {
                td.className = "td-branch";
            }
            tr.appendChild(td);
            
            // accumulate only leaf/branch values for total column to prevent group double counting
            if (!cc.is_group) {
                rowSum += val;
            }
        });
        
        // If type filter is "groups", rowSum of branches is 0, so calculate the sum of group top-levels
        if (typeFilter === "groups") {
            filteredCCs.forEach(cc => {
                if (!filteredCCs.some(parent => parent.name === cc.parent_cost_center)) {
                    rowSum += (dashboardData.daily_sales[d][cc.name] || 0);
                }
            });
        }
        
        const tdRowSum = document.createElement("td");
        tdRowSum.innerText = formatCurrency(rowSum);
        tdRowSum.className = "td-total";
        tr.appendChild(tdRowSum);
        
        body.appendChild(tr);
    });

    // Add Grand Total Row at the bottom of the table
    const trTotal = document.createElement("tr");
    trTotal.style.fontWeight = "bold";
    trTotal.style.backgroundColor = "var(--bg-hover)";
    trTotal.style.borderTop = "2px solid var(--border)";
    
    const tdTotalLabel = document.createElement("td");
    tdTotalLabel.innerText = "المجموع الكلي";
    trTotal.appendChild(tdTotalLabel);
    
    let grandTotal = 0;
    
    filteredCCs.forEach(cc => {
        const colSum = dates.reduce((sum, d) => sum + (dashboardData.daily_sales[d][cc.name] || 0), 0);
        const tdColSum = document.createElement("td");
        tdColSum.innerText = colSum > 0 ? formatCurrency(colSum) : "-";
        
        if (cc.is_group) {
            tdColSum.className = "td-group";
        } else {
            tdColSum.className = "td-branch";
            grandTotal += colSum;
        }
        
        trTotal.appendChild(tdColSum);
    });
    
    // If type filter is "groups", calculate the sum of group top-levels for grandTotal
    if (typeFilter === "groups") {
        grandTotal = 0; // reset
        filteredCCs.forEach(cc => {
            if (!filteredCCs.some(parent => parent.name === cc.parent_cost_center)) {
                const colSum = dates.reduce((sum, d) => sum + (dashboardData.daily_sales[d][cc.name] || 0), 0);
                grandTotal += colSum;
            }
        });
    }
    
    const tdGrandTotal = document.createElement("td");
    tdGrandTotal.innerText = formatCurrency(grandTotal);
    tdGrandTotal.className = "td-total";
    trTotal.appendChild(tdGrandTotal);
    
    body.appendChild(trTotal);
    
    // 2. Render Pagination Bar
    renderPagination("sales-pagination-bar", totalDates, salesCurrentPage, salesPageSize, "window.changeSalesPage", "window.changeSalesPageSize");
}

// Helper to group daily sales data by day, week, or month based on date range size
function aggregateSalesData(originalDailySales, originalBranchSales) {
    const dates = Object.keys(originalDailySales).sort();
    if (dates.length === 0) {
        return { labels: [], keys: [], daily_sales: {}, branch_sales: {}, groupTypeText: "يومياً" };
    }
    
    // Calculate the exact selected range in days
    const fromVal = document.getElementById("filter-from-date").value;
    const toVal = document.getElementById("filter-to-date").value;
    
    let diffDays = 1;
    if (fromVal && toVal) {
        const fromDate = new Date(fromVal);
        const toDate = new Date(toVal);
        const diffTime = Math.abs(toDate - fromDate);
        diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
    
    // Determine grouping type:
    // - Range > 31 days (more than a month / annual): Monthly
    // - Range 8 to 31 days (monthly scope): Weekly
    // - Range <= 7 days (weekly scope): Daily
    let groupType = "day"; 
    if (diffDays > 31) {
        groupType = "month";
    } else if (diffDays > 7) {
        groupType = "week";
    }
    
    // Helper to get week start (Sunday)
    function getWeekStart(dateStr) {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = d.getDate() - day; // adjust to Sunday
        const sunday = new Date(d.setDate(diff));
        return formatDateForInput(sunday);
    }
    
    // Helper to get month key (YYYY-MM)
    function getMonthKey(dateStr) {
        return dateStr.substring(0, 7);
    }
    
    const newDailySales = {};
    const newBranchSales = {};
    const labelSet = new Set();
    
    dates.forEach(d => {
        let groupKey = d;
        if (groupType === "week") {
            groupKey = getWeekStart(d);
        } else if (groupType === "month") {
            groupKey = getMonthKey(d);
        }
        
        labelSet.add(groupKey);
        
        if (!newDailySales[groupKey]) newDailySales[groupKey] = {};
        if (!newBranchSales[groupKey]) newBranchSales[groupKey] = {};
        
        // Sum cost center sales
        const ccSales = originalDailySales[d] || {};
        Object.keys(ccSales).forEach(ccName => {
            newDailySales[groupKey][ccName] = (newDailySales[groupKey][ccName] || 0) + (ccSales[ccName] || 0);
        });
        
        // Sum branch sales
        const bSales = originalBranchSales[d] || {};
        Object.keys(bSales).forEach(bName => {
            newBranchSales[groupKey][bName] = (newBranchSales[groupKey][bName] || 0) + (bSales[bName] || 0);
        });
    });
    
    const sortedLabels = Array.from(labelSet).sort();
    
    // Format label names for display
    const displayLabels = sortedLabels.map(label => {
        if (groupType === "month") {
            const parts = label.split("-");
            const monthsAr = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
            const monthIdx = parseInt(parts[1], 10) - 1;
            return `${monthsAr[monthIdx]} ${parts[0]}`;
        } else if (groupType === "week") {
            return `أسبوع ${label}`;
        }
        return label;
    });
    
    return {
        labels: displayLabels,
        keys: sortedLabels,
        daily_sales: newDailySales,
        branch_sales: newBranchSales,
        groupTypeText: groupType === "month" ? "شهرياً" : (groupType === "week" ? "أسبوعياً" : "يومياً")
    };
}

// Render Daily Sales Charts (Split Groups vs Branches)
function renderDailySalesCharts() {
    // Dynamically aggregate sales data based on length of date range
    const aggregated = aggregateSalesData(dashboardData.daily_sales, dashboardData.branch_sales);
    const labels = aggregated.labels;
    const keys = aggregated.keys;
    
    // Update dashboard section title
    const titleEl = document.getElementById("sales-charts-title");
    if (titleEl) {
        titleEl.innerText = `الرسوم البيانية للمبيعات (عرض ${aggregated.groupTypeText})`;
    }
    
    // Destroy existing charts to prevent overlaps
    if (charts.salesBranches) { charts.salesBranches.destroy(); }
    if (charts.salesGroups) { charts.salesGroups.destroy(); }
    
    // Filter cost centers
    const groups = dashboardData.cost_centers.filter(cc => !cc.is_group);
    
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";
    const textColor = isDark ? "#9ca3af" : "#64748b";

    // Helper to get top datasets and aggregate the rest as "Others"
    function getTopDatasets(entities, getValForDate, keyField = 'name', labelField = 'name', isLine = true) {
        const colors = [
            '#6366f1', // Indigo
            '#10b981', // Emerald
            '#f59e0b', // Amber
            '#ef4444', // Rose
            '#8b5cf6', // Purple
            '#06b6d4', // Cyan
            '#ec4899', // Pink
        ];

        // Calculate total sales for each entity over the aggregated keys
        const totals = entities.map(entity => {
            const key = entity[keyField];
            const total = keys.reduce((sum, k) => sum + getValForDate(k, key), 0);
            return { entity, total };
        });

        // Sort by total descending
        totals.sort((a, b) => b.total - a.total);

        let displayEntities = [];
        let hasOthers = false;
        let othersEntities = [];

        if (entities.length <= 5) {
            displayEntities = totals;
        } else {
            displayEntities = totals.slice(0, 4);
            othersEntities = totals.slice(4);
            hasOthers = true;
        }

        const datasets = displayEntities.map((item, index) => {
            const key = item.entity[keyField];
            const label = item.entity[labelField];
            
            if (isLine) {
                const color = colors[index % colors.length];
                return {
                    label: label,
                    data: keys.map(k => getValForDate(k, key)),
                    borderColor: color,
                    backgroundColor: color + '12',
                    borderWidth: 2.2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: color,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5
                };
            } else {
                const hue = (index * 95) % 360;
                return {
                    label: label,
                    data: keys.map(k => getValForDate(k, key)),
                    backgroundColor: `hsl(${hue}, 75%, 60%, 0.85)`,
                    borderColor: `hsl(${hue}, 75%, 50%)`,
                    borderWidth: 1.5
                };
            }
        });

        if (hasOthers) {
            const otherData = keys.map(k => {
                return othersEntities.reduce((sum, item) => sum + getValForDate(k, item.entity[keyField]), 0);
            });
            
            if (isLine) {
                const color = '#94a3b8';
                datasets.push({
                    label: `أخرى (تجميعي لـ ${othersEntities.length} فرع)`,
                    data: otherData,
                    borderColor: color,
                    backgroundColor: color + '12',
                    borderWidth: 2.2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: color,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5
                });
            } else {
                datasets.push({
                    label: `أخرى (تجميعي لـ ${othersEntities.length} مركز)`,
                    data: otherData,
                    backgroundColor: 'rgba(148, 163, 184, 0.85)',
                    borderColor: 'rgb(148, 163, 184)',
                    borderWidth: 1.5
                });
            }
        }

        return datasets;
    }



    // Chart 2: Groups Sales
    if (keys.length > 0 && groups.length > 0) {
        document.getElementById("msg-sales-groups").style.display = "none";
        
        const datasets = getTopDatasets(
            groups,
            (k, key) => aggregated.daily_sales[k][key] || 0,
            'name',
            'cost_center_name',
            false
        );

        const ctx = document.getElementById("chart-sales-groups").getContext("2d");
        charts.salesGroups = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor, font: { family: 'Cairo', weight: 'bold' } } }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Cairo' } } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor } }
                }
            }
        });
    } else {
        document.getElementById("msg-sales-groups").style.display = "block";
    }
}

// Render P&L Report Table
function renderPLTable() {
    if (!dashboardData) return;
    
    const typeFilter = document.getElementById("filter-cc-type").value;
    const body = document.getElementById("table-pl-body");
    body.innerHTML = "";
    
    let filteredCCs = getFilteredCostCenters(typeFilter);
    
    if (filteredCCs.length === 0) {
        body.innerHTML = "<tr><td colspan='6' style='text-align: center; color: var(--text-muted); padding: 30px;'>لا توجد مراكز تكلفة لعرض البيانات المرجعية.</td></tr>";
        document.getElementById("pl-pagination-bar").innerHTML = "";
        return;
    }
    
    // 1. Client-Side Pagination Slicing for Cost Centers
    const totalCCs = filteredCCs.length;
    const totalPages = Math.ceil(totalCCs / plPageSize);
    if (plCurrentPage > totalPages) plCurrentPage = totalPages || 1;
    
    const startIdx = (plCurrentPage - 1) * plPageSize;
    const endIdx = startIdx + plPageSize;
    const paginatedCCs = filteredCCs.slice(startIdx, endIdx);
    
    // Fill row cells
    paginatedCCs.forEach(cc => {
        const pl = dashboardData.pl_data[cc.name] || { income: 0, expense: 0, profit: 0, margin: 0 };
        
        const tr = document.createElement("tr");
        if (cc.is_group) {
            tr.className = "tree-row-group";
        }
        
        // 1. Cost Center Name with hierarchical indentation
        const tdName = document.createElement("td");
        
        // Indentation calculation based on tree level (approximated by lft scale)
        let depth = 0;
        let parent = cc.parent_cost_center;
        while (parent && filteredCCs.some(c => c.name === parent)) {
            depth++;
            parent = filteredCCs.find(c => c.name === parent).parent_cost_center;
        }
        
        let indentHtml = "";
        for (let i = 0; i < depth; i++) {
            indentHtml += "<span class='tree-indent'></span>";
        }
        
        tdName.innerHTML = `${indentHtml}${cc.is_group ? "<i class='fa-solid fa-folder-open cc-tree-folder' style='margin-left: 8px;'></i>" : "<i class='fa-solid fa-building-circle-check cc-tree-leaf' style='margin-left: 8px;'></i>"} <a href="#" class="cc-drilldown-link" onclick="event.preventDefault(); window.showDrilldown('${cc.name}');">${cc.cost_center_name}</a>`;
        tr.appendChild(tdName);
        
        // 2. Type Badge
        const tdType = document.createElement("td");
        if (cc.is_group) {
            tdType.innerHTML = "<span class='badge badge-group'>مجموعة</span>";
        } else {
            tdType.innerHTML = "<span class='badge badge-branch'>مركز فرعي</span>";
        }
        tr.appendChild(tdType);
        
        // 3. Income
        const tdIncome = document.createElement("td");
        tdIncome.innerText = pl.income > 0 ? formatCurrency(pl.income) : "-";
        tdIncome.style.fontWeight = cc.is_group ? "700" : "400";
        tr.appendChild(tdIncome);
        
        // 4. Expense
        const tdExpense = document.createElement("td");
        tdExpense.innerText = pl.expense > 0 ? formatCurrency(pl.expense) : "-";
        tdExpense.style.fontWeight = cc.is_group ? "700" : "400";
        tr.appendChild(tdExpense);
        
        // 5. Net Profit
        const tdProfit = document.createElement("td");
        tdProfit.innerText = formatCurrency(pl.profit);
        tdProfit.className = pl.profit >= 0 ? "text-green" : "text-red";
        tdProfit.style.fontWeight = "700";
        tr.appendChild(tdProfit);
        
        // 6. Margin
        const tdMargin = document.createElement("td");
        tdMargin.innerText = pl.income > 0 ? `${pl.margin.toFixed(2)}%` : "-";
        tdMargin.style.fontWeight = "600";
        tdMargin.className = pl.profit >= 0 ? "text-green" : "text-red";
        tr.appendChild(tdMargin);
        
        body.appendChild(tr);
    });
    
    // 2. Render Pagination Bar
    renderPagination("pl-pagination-bar", totalCCs, plCurrentPage, plPageSize, "window.changePLPage", "window.changePLPageSize");
}

// Render P&L Charts (Split Groups vs Branches)
function renderPLCharts() {
    if (!document.getElementById("chart-pl-branches")) {
        return;
    }
    if (charts.plBranches) { charts.plBranches.destroy(); }
    if (charts.plGroups) { charts.plGroups.destroy(); }
    
    const branches = dashboardData.cost_centers.filter(cc => !cc.is_group);
    const groups = dashboardData.cost_centers.filter(cc => cc.is_group);
    
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";
    const textColor = isDark ? "#9ca3af" : "#64748b";

    // Chart 1: Branch Profits (Bar Chart showing Net Profit/Loss)
    if (branches.length > 0) {
        document.getElementById("msg-pl-branches").style.display = "none";
        
        const labels = branches.map(cc => cc.cost_center_name);
        const profitData = branches.map(cc => (dashboardData.pl_data[cc.name] || {}).profit || 0);
        
        // Color bars dynamically based on profit (green) or loss (red)
        const bgColors = profitData.map(val => val >= 0 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(239, 68, 68, 0.85)');
        const borderColors = profitData.map(val => val >= 0 ? '#10b981' : '#ef4444');

        const ctx = document.getElementById("chart-pl-branches").getContext("2d");
        charts.plBranches = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'صافي الربح / الخسارة',
                    data: profitData,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Cairo' } } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor } }
                }
            }
        });
    } else {
        document.getElementById("msg-pl-branches").style.display = "block";
    }

    // Chart 2: Group Income vs Expense (Double Bar Chart)
    if (groups.length > 0) {
        document.getElementById("msg-pl-groups").style.display = "none";
        
        const labels = groups.map(cc => cc.cost_center_name);
        const incomeData = groups.map(cc => (dashboardData.pl_data[cc.name] || {}).income || 0);
        const expenseData = groups.map(cc => (dashboardData.pl_data[cc.name] || {}).expense || 0);

        const ctx = document.getElementById("chart-pl-groups").getContext("2d");
        charts.plGroups = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'الإيرادات',
                        data: incomeData,
                        backgroundColor: 'rgba(99, 102, 241, 0.85)',
                        borderColor: '#6366f1',
                        borderWidth: 1
                    },
                    {
                        label: 'المصروفات',
                        data: expenseData,
                        backgroundColor: 'rgba(245, 158, 11, 0.85)',
                        borderColor: '#f59e0b',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor, font: { family: 'Cairo', weight: 'bold' } } }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Cairo' } } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor } }
                }
            }
        });
    } else {
        document.getElementById("msg-pl-groups").style.display = "block";
    }
}

// Helpers
function getFilteredCostCenters(filter) {
    if (!dashboardData) return [];
    
    const selectedCC = document.getElementById("filter-cost-center").value;
    let list = dashboardData.cost_centers;
    
    if (selectedCC) {
        const activeCC = list.find(cc => cc.name === selectedCC);
        if (activeCC) {
            list = list.filter(cc => {
                if (cc.name === selectedCC) return true;
                if (cc.is_group) {
                    return activeCC.lft >= cc.lft && activeCC.rgt <= cc.rgt;
                }
                return false;
            });
        }
    }
    
    if (filter === "all") {
        return list;
    } else if (filter === "branches") {
        return list.filter(cc => !cc.is_group);
    } else if (filter === "groups") {
        return list.filter(cc => cc.is_group);
    }
    return list;
}

function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Math.abs(val)) + (val < 0 ? ' -' : '');
}

// Generic Pagination Renderer
function renderPagination(containerId, totalItems, currentPage, pageSize, onPageChange, onPageSizeChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (totalItems <= 0) {
        container.innerHTML = "";
        return;
    }
    
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const startIdx = (currentPage - 1) * pageSize + 1;
    const endIdx = Math.min(currentPage * pageSize, totalItems);
    
    let html = `
        <div class="pagination-left">
            <span>عرض ${startIdx} إلى ${endIdx} من أصل ${totalItems} سجل</span>
            <select class="pagination-select" onchange="${onPageSizeChange}(this.value)">
                <option value="5" ${pageSize == 5 ? 'selected' : ''}>5</option>
                <option value="10" ${pageSize == 10 ? 'selected' : ''}>10</option>
                <option value="25" ${pageSize == 25 ? 'selected' : ''}>25</option>
                <option value="50" ${pageSize == 50 ? 'selected' : ''}>50</option>
                <option value="100" ${pageSize == 100 ? 'selected' : ''}>100</option>
            </select>
            <span>سجل لكل صفحة</span>
        </div>
        <div class="pagination-right">
            <button class="pag-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="${onPageChange}(1)" title="الصفحة الأولى">
                <i class="fa-solid fa-angles-right"></i>
            </button>
            <button class="pag-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="${onPageChange}(${currentPage - 1})" title="الصفحة السابقة">
                <i class="fa-solid fa-angle-right"></i>
            </button>
            <span class="pag-info">صفحة ${currentPage} من ${totalPages}</span>
            <button class="pag-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="${onPageChange}(${currentPage + 1})" title="الصفحة التالية">
                <i class="fa-solid fa-angle-left"></i>
            </button>
            <button class="pag-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="${onPageChange}(${totalPages})" title="الصفحة الأخيرة">
                <i class="fa-solid fa-angles-left"></i>
            </button>
        </div>
    `;
    container.innerHTML = html;
}

// Global page handlers called by inline html elements
window.changeSalesPage = function(page) {
    salesCurrentPage = page;
    renderDailySalesTable();
};

window.changeSalesPageSize = function(size) {
    salesPageSize = parseInt(size);
    salesCurrentPage = 1;
    renderDailySalesTable();
};

window.changePLPage = function(page) {
    plCurrentPage = page;
    renderPLTable();
};

window.changePLPageSize = function(size) {
    plPageSize = parseInt(size);
    plCurrentPage = 1;
    renderPLTable();
};

// Export Table Content to CSV (Full dataset, ignoring paginated slicing)
function exportToExcel() {
    if (!dashboardData) return;
    
    let csvContent = "\ufeff"; // BOM for excel Arabic encoding support
    let filename = "";
    
    if (currentTab === "daily-sales") {
        filename = `daily_sales_by_cost_center_${currentCompany}_${formatDateForInput(today)}.csv`;
        const headers = ["التاريخ"];
        const typeFilter = document.getElementById("filter-cc-type").value;
        const filteredCCs = getFilteredCostCenters(typeFilter);
        
        filteredCCs.forEach(cc => headers.push(cc.cost_center_name));
        headers.push("الإجمالي");
        csvContent += headers.map(h => `"${h}"`).join(",") + "\n";
        
        const dates = Object.keys(dashboardData.daily_sales).sort();
        dates.forEach(d => {
            const row = [d];
            let rowSum = 0;
            filteredCCs.forEach(cc => {
                const val = dashboardData.daily_sales[d][cc.name] || 0;
                row.push(val.toFixed(2));
                if (!cc.is_group) rowSum += val;
            });
            row.push(rowSum.toFixed(2));
            csvContent += row.join(",") + "\n";
        });
    } else {
        filename = `pandl_statement_by_cost_center_${currentCompany}_${formatDateForInput(today)}.csv`;
        csvContent += `"مركز التكلفة","النوع","الإيرادات","المصروفات","صافي الربح / الخسارة","هامش الربح"\n`;
        
        const typeFilter = document.getElementById("filter-cc-type").value;
        const filteredCCs = getFilteredCostCenters(typeFilter);
        
        filteredCCs.forEach(cc => {
            const pl = dashboardData.pl_data[cc.name] || { income: 0, expense: 0, profit: 0, margin: 0 };
            const typeStr = cc.is_group ? "مجموعة" : "فرع";
            csvContent += `"${cc.cost_center_name}","${typeStr}","${pl.income.toFixed(2)}","${pl.expense.toFixed(2)}","${pl.profit.toFixed(2)}","${pl.margin.toFixed(2)}%"\n`;
        });
    }
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Redirect logout using API
async function logout() {
    showLoader(true);
    try {
        const res = await callAPI("cost_center_analytics.permission.logout_and_redirect");
        if (res && res.success) {
            window.location.href = res.redirect || "/login";
        } else {
            window.location.href = "/login";
        }
    } catch (e) {
        window.location.href = "/login";
    }
}

// Branch Detailed Drilldown Show/Hide Modal Functions
window.showDrilldown = async function(costCenterName) {
    showLoader(true);
    try {
        const company = document.getElementById("filter-company").value;
        const from_date = document.getElementById("filter-from-date").value;
        const to_date = document.getElementById("filter-to-date").value;
        const warehouse = document.getElementById("filter-warehouse").value;
        
        const data = await callAPI("cost_center_analytics.api.get_branch_details", {
            company,
            cost_center: costCenterName,
            from_date,
            to_date,
            warehouse
        });
        
        if (data && !data.error) {
            // Populate modal fields
            document.getElementById("modal-branch-name").innerText = data.cost_center_name;
            
            document.getElementById("modal-kpi-sales").innerText = formatCurrency(data.total_sales);
            document.getElementById("modal-kpi-income").innerText = formatCurrency(data.total_income);
            document.getElementById("modal-kpi-expense").innerText = formatCurrency(data.total_expense);
            
            const profitVal = data.net_profit;
            const profitEl = document.getElementById("modal-kpi-profit");
            profitEl.innerText = formatCurrency(profitVal);
            profitEl.style.color = profitVal >= 0 ? "#10b981" : "#ef4444";
            
            // Populate Incomes table
            const incomeBody = document.getElementById("modal-income-table-body");
            incomeBody.innerHTML = "";
            if (data.incomes.length === 0) {
                incomeBody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:var(--text-muted); padding: 16px;">لا توجد مبالغ مقيدة</td></tr>`;
            } else {
                data.incomes.forEach(inc => {
                    const tr = document.createElement("tr");
                    tr.innerHTML = `<td>${inc.account_name}</td><td class="text-right text-success" style="font-weight: 600;">${formatCurrency(inc.amount)}</td>`;
                    incomeBody.appendChild(tr);
                });
            }
            
            // Populate Expenses table
            const expenseBody = document.getElementById("modal-expense-table-body");
            expenseBody.innerHTML = "";
            if (data.expenses.length === 0) {
                expenseBody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:var(--text-muted); padding: 16px;">لا توجد مبالغ مقيدة</td></tr>`;
            } else {
                data.expenses.forEach(exp => {
                    const tr = document.createElement("tr");
                    tr.innerHTML = `<td>${exp.account_name}</td><td class="text-right text-danger" style="font-weight: 600;">${formatCurrency(exp.amount)}</td>`;
                    expenseBody.appendChild(tr);
                });
            }
            
            // Show modal
            document.getElementById("drilldownModal").classList.add("active");
        }
    } catch (err) {
        console.error("Error loading branch details:", err);
    }
    showLoader(false);
};

window.hideDrilldownModal = function() {
    document.getElementById("drilldownModal").classList.remove("active");
};

window.closeDrilldownModal = function(e) {
    if (e.target.id === "drilldownModal") {
        window.hideDrilldownModal();
    }
};

// Update sidebar branding with company logo and name
function updateSidebarBranding(company) {
    if (!window.companiesList) return;
    const selectedCompanyObj = window.companiesList.find(c => c.name === company);
    if (selectedCompanyObj) {
        document.getElementById("sidebar-company-name").innerText = selectedCompanyObj.company_name;
        document.getElementById("sidebar-company-sub").innerText = "تحليلات مراكز التكلفة";
        
        const logoContainer = document.getElementById("sidebar-logo-container");
        if (selectedCompanyObj.company_logo) {
            logoContainer.innerHTML = `<img src="${selectedCompanyObj.company_logo}" alt="Logo" style="width: 100%; height: 100%; object-fit: contain; border-radius: 6px;">`;
            logoContainer.style.background = "transparent";
            logoContainer.style.border = "none";
        } else {
            logoContainer.innerHTML = `<i class="fa-solid fa-chart-pie"></i>`;
            logoContainer.style.background = "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)";
        }
    }
}

// Quick Date Filtering Logic
window.applyQuickDate = function(value, btnEl) {
    if (!value) return;
    
    // Handle active styling for the pills
    document.querySelectorAll(".btn-pill").forEach(btn => btn.classList.remove("active"));
    if (btnEl) {
        btnEl.classList.add("active");
    }
    
    const today = new Date();
    let fromDate = new Date();
    let toDate = new Date();
    
    switch (value) {
        case "today":
            fromDate = today;
            toDate = today;
            break;
        case "yesterday":
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);
            fromDate = yesterday;
            toDate = yesterday;
            break;
        case "this-week":
            const dayOfWeek = today.getDay(); // 0 is Sunday
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - dayOfWeek);
            fromDate = startOfWeek;
            toDate = today;
            break;
        case "this-month":
            fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
            toDate = today;
            break;
        case "last-month":
            fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            toDate = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case "this-year":
            fromDate = new Date(today.getFullYear(), 0, 1);
            toDate = today;
            break;
    }
    
    document.getElementById("filter-from-date").value = formatDateForInput(fromDate);
    document.getElementById("filter-to-date").value = formatDateForInput(toDate);
    
    // Automatically trigger reload
    loadData();
};


// Executive Insights Rendering Logic

window.renderLeaderboard = function() {
    if (!dashboardData) return;
    const container = document.getElementById("leaderboard-container");
    container.innerHTML = "";
    
    // Filter only leaf cost centers
    const leaves = dashboardData.cost_centers.filter(cc => !cc.is_group);
    if (leaves.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">لا توجد مراكز تكلفة لعرض البيانات المرجعية.</div>`;
        return;
    }
    
    const dates = Object.keys(dashboardData.daily_sales);
    
    // Calculate cumulative stats for each cost center
    const ranked = leaves.map(cc => {
        const totalSales = dates.reduce((sum, d) => sum + (dashboardData.daily_sales[d][cc.name] || 0), 0);
        const pl = dashboardData.pl_data[cc.name] || { income: 0, expense: 0, profit: 0, margin: 0 };
        return {
            name: cc.cost_center_name || cc.name,
            code: cc.name,
            sales: totalSales,
            profit: pl.profit || 0,
            margin: pl.margin || 0
        };
    });
    
    // Sort by sales descending
    ranked.sort((a, b) => b.sales - a.sales);
    
    // Render Top 3 visually
    const top3Html = document.createElement("div");
    top3Html.className = "leaderboard-top3";
    
    const medals = ["🥇", "🥈", "🥉"];
    const top3 = ranked.slice(0, 3);
    
    top3.forEach((item, idx) => {
        const card = document.createElement("div");
        card.className = "leaderboard-top-card";
        card.innerHTML = `
            <div class="leaderboard-medal">${medals[idx]}</div>
            <div class="leaderboard-top-info">
                <div class="leaderboard-top-name">${item.name}</div>
                <div class="leaderboard-top-sales"><span dir="ltr">${formatCurrency(item.sales)}</span></div>
                <div class="leaderboard-top-meta">
                    <span>الربح: <b style="color: ${item.profit >= 0 ? '#10b981' : '#ef4444'}"><span dir="ltr">${formatCurrency(item.profit)}</span></b></span>
                    <span>الهامش: <b><span dir="ltr">${item.margin.toFixed(1)}%</span></b></span>
                </div>
            </div>
        `;
        top3Html.appendChild(card);
    });
    
    container.appendChild(top3Html);
    
    // Render full list below
    const listContainer = document.createElement("div");
    listContainer.className = "leaderboard-list";
    listContainer.style.marginTop = "20px";
    
    const maxSales = ranked[0] ? ranked[0].sales : 1;
    
    ranked.forEach((item, index) => {
        const pct = maxSales > 0 ? (item.sales / maxSales) * 100 : 0;
        const itemEl = document.createElement("div");
        itemEl.className = "leaderboard-item";
        itemEl.innerHTML = `
            <div class="leaderboard-rank-num">${index + 1}</div>
            <div class="leaderboard-item-name">${item.name}</div>
            <div class="leaderboard-item-progress-wrapper">
                <div class="leaderboard-progress-bg">
                    <div class="leaderboard-progress-fill" style="width: ${pct}%"></div>
                </div>
                <div class="leaderboard-top-meta" style="margin-top: 2.5px;">
                    <span>صافي الربح: <b style="color: ${item.profit >= 0 ? '#10b981' : '#ef4444'}"><span dir="ltr">${formatCurrency(item.profit)}</span></b></span>
                    <span>هامش الربح: <b><span dir="ltr">${item.margin.toFixed(1)}%</span></b></span>
                </div>
            </div>
            <div class="leaderboard-item-sales"><span dir="ltr">${formatCurrency(item.sales)}</span></div>
        `;
        listContainer.appendChild(itemEl);
    });
    
    container.appendChild(listContainer);
};

let expensesDonutChart = null;

window.loadExpenseAnalysis = function() {
    const company = document.getElementById("filter-company").value;
    const fromDate = document.getElementById("filter-from-date").value;
    const toDate = document.getElementById("filter-to-date").value;
    const warehouse = document.getElementById("filter-warehouse").value;
    const costCenter = document.getElementById("filter-cost-center").value;
    
    if (!company) return;
    
    const args = { company, from_date: fromDate, to_date: toDate };
    if (warehouse) args.warehouse = warehouse;
    if (costCenter) args.cost_center = costCenter;
    
    showLoader(true);
    callAPI("cost_center_analytics.api.get_expense_analysis", args).then(data => {
        renderExpenseAnalysis(data);
    }).catch(err => {
        console.error(err);
    }).finally(() => {
        showLoader(false);
    });
};

function renderExpenseAnalysis(data) {
    const tableBody = document.getElementById("table-expenses-body");
    tableBody.innerHTML = "";
    
    const chartMsg = document.getElementById("msg-expenses-chart");
    
    if (expensesDonutChart) {
        expensesDonutChart.destroy();
        expensesDonutChart = null;
    }
    
    if (!data || data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 30px;">لا توجد مصروفات مسجلة لهذه الفترة.</td></tr>`;
        chartMsg.style.display = "block";
        return;
    }
    
    chartMsg.style.display = "none";
    
    const totalExpenses = data.reduce((sum, item) => sum + item.amount, 0);
    
    data.forEach(item => {
        const pct = totalExpenses > 0 ? (item.amount / totalExpenses) * 100 : 0;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.account_name} <span class="text-secondary" style="font-size: 11px;">(${item.account.split(" - ")[0]})</span></td>
            <td class="text-right" style="font-family: 'Outfit', var(--font-family); font-weight: 700;">${formatCurrency(item.amount)}</td>
            <td class="text-right" style="font-family: 'Outfit', var(--font-family); font-weight: 600; color: var(--primary);">${pct.toFixed(1)}%</td>
        `;
        tableBody.appendChild(tr);
    });
    
    const ctx = document.getElementById("chart-expenses-donut").getContext("2d");
    
    let chartLabels = [];
    let chartData = [];
    
    if (data.length <= 6) {
        chartLabels = data.map(item => item.account_name);
        chartData = data.map(item => item.amount);
    } else {
        const top5 = data.slice(0, 5);
        const others = data.slice(5);
        chartLabels = top5.map(item => item.account_name);
        chartData = top5.map(item => item.amount);
        
        chartLabels.push("مصاريف أخرى");
        chartData.push(others.reduce((sum, item) => sum + item.amount, 0));
    }
    
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textColor = isDark ? "#9ca3af" : "#64748b";
    
    const colors = [
        '#6366f1', // Indigo
        '#ef4444', // Rose
        '#f59e0b', // Amber
        '#10b981', // Emerald
        '#8b5cf6', // Purple
        '#06b6d4', // Cyan
        '#94a3b8'  // Others
    ];
    
    expensesDonutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: chartLabels,
            datasets: [{
                data: chartData,
                backgroundColor: colors.slice(0, chartLabels.length),
                borderWidth: isDark ? 2 : 1,
                borderColor: isDark ? '#1e293b' : '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        font: { family: 'Cairo', size: 10 }
                    }
                }
            },
            cutout: '70%'
        }
    });
}

window.loadCashFlow = function() {
    const company = document.getElementById("filter-company").value;
    const fromDate = document.getElementById("filter-from-date").value;
    const toDate = document.getElementById("filter-to-date").value;
    const warehouse = document.getElementById("filter-warehouse").value;
    const costCenter = document.getElementById("filter-cost-center").value;
    
    if (!company) return;
    
    const args = { company, from_date: fromDate, to_date: toDate };
    if (warehouse) args.warehouse = warehouse;
    if (costCenter) args.cost_center = costCenter;
    
    showLoader(true);
    callAPI("cost_center_analytics.api.get_cash_flow", args).then(data => {
        renderCashFlow(data);
    }).catch(err => {
        console.error(err);
    }).finally(() => {
        showLoader(false);
    });
};

function renderCashFlow(data) {
    const totalEl = document.getElementById("cashflow-total-liquidity");
    const barEl = document.getElementById("cashflow-liquidity-bar");
    const legendEl = document.getElementById("cashflow-liquidity-legend");
    const tableBody = document.getElementById("table-cashflow-body");
    
    tableBody.innerHTML = "";
    barEl.innerHTML = "";
    legendEl.innerHTML = "";
    
    if (!data || data.length === 0) {
        totalEl.innerText = "0.00 SAR";
        tableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 30px;">لا توجد حسابات سيولة نقدية متوفرة لهذه التصفية.</td></tr>`;
        return;
    }
    
    data.sort((a, b) => b.balance - a.balance);
    
    const totalLiquidity = data.reduce((sum, item) => sum + (item.balance > 0 ? item.balance : 0), 0);
    totalEl.innerText = `${formatCurrency(totalLiquidity)}`;
    
    const colors = [
        '#10b981', // Emerald
        '#6366f1', // Indigo
        '#f59e0b', // Amber
        '#06b6d4', // Cyan
        '#8b5cf6', // Purple
        '#ec4899', // Pink
        '#ef4444', // Rose
    ];
    
    let colorIdx = 0;
    
    data.forEach(item => {
        const tr = document.createElement("tr");
        const typeAr = item.account_type === "Bank" ? "حساب بنكي" : "صندوق نقدي";
        tr.innerHTML = `
            <td style="font-weight: 700;">${item.account_name} <span class="text-secondary" style="font-size: 11px;">(${item.account.split(" - ")[0]})</span></td>
            <td><span class="badge ${item.account_type === 'Bank' ? 'badge-group' : 'badge-branch'}">${typeAr}</span></td>
            <td class="text-right" style="font-family: 'Outfit', var(--font-family); font-weight: 700; color: ${item.balance >= 0 ? '#10b981' : '#ef4444'};">
                ${formatCurrency(item.balance)}
            </td>
        `;
        tableBody.appendChild(tr);
        
        if (item.balance > 0 && totalLiquidity > 0) {
            const pct = (item.balance / totalLiquidity) * 100;
            const color = colors[colorIdx % colors.length];
            
            const segment = document.createElement("div");
            segment.className = "liquidity-bar-segment";
            segment.style.width = `${pct}%`;
            segment.style.backgroundColor = color;
            segment.title = `${item.account_name}: ${pct.toFixed(1)}%`;
            barEl.appendChild(segment);
            
            const legendItem = document.createElement("div");
            legendItem.className = "legend-item";
            legendItem.innerHTML = `
                <span class="legend-color-dot" style="background-color: ${color}"></span>
                <span>${item.account_name} (${pct.toFixed(1)}%)</span>
            `;
            legendEl.appendChild(legendItem);
            
            colorIdx++;
        }
    });
}


// Advanced Tools: Cost Center Comparison, Peak Hours & Salesperson Leaderboard

let comparisonBarChart = null;

window.renderComparison = function() {
    if (!dashboardData) return;
    const cc1 = document.getElementById("compare-cc-1").value;
    const cc2 = document.getElementById("compare-cc-2").value;
    
    if (!cc1 || !cc2) return;
    
    const info1 = dashboardData.cost_centers.find(c => c.name === cc1) || { cost_center_name: cc1 };
    const info2 = dashboardData.cost_centers.find(c => c.name === cc2) || { cost_center_name: cc2 };
    
    const dates = Object.keys(dashboardData.daily_sales);
    const sales1 = dates.reduce((sum, d) => sum + (dashboardData.daily_sales[d][cc1] || 0), 0);
    const sales2 = dates.reduce((sum, d) => sum + (dashboardData.daily_sales[d][cc2] || 0), 0);
    
    const pl1 = dashboardData.pl_data[cc1] || { income: 0, expense: 0, profit: 0, margin: 0 };
    const pl2 = dashboardData.pl_data[cc2] || { income: 0, expense: 0, profit: 0, margin: 0 };
    
    const container = document.getElementById("compare-metrics-container");
    container.innerHTML = "";
    
    const metrics = [
        { title: "إجمالي المبيعات", val1: sales1, val2: sales2, format: true },
        { title: "إجمالي الإيرادات", val1: pl1.income, val2: pl2.income, format: true },
        { title: "إجمالي المصروفات", val1: pl1.expense, val2: pl2.expense, format: true },
        { title: "صافي الأرباح", val1: pl1.profit, val2: pl2.profit, format: true, isProfit: true },
        { title: "هامش الربح (%)", val1: pl1.margin, val2: pl2.margin, format: false, suffix: "%" }
    ];
    
    metrics.forEach(m => {
        const sum = Math.abs(m.val1) + Math.abs(m.val2);
        let pct1 = 50;
        let pct2 = 50;
        if (sum > 0) {
            pct1 = (Math.abs(m.val1) / sum) * 100;
            pct2 = (Math.abs(m.val2) / sum) * 100;
        }
        
        const card = document.createElement("div");
        card.className = "comparison-metric-card";
        
        let displayVal1 = m.format ? formatCurrency(m.val1) : m.val1.toFixed(1) + (m.suffix || "");
        let displayVal2 = m.format ? formatCurrency(m.val2) : m.val2.toFixed(1) + (m.suffix || "");
        
        let color1Style = "";
        let color2Style = "";
        if (m.isProfit) {
            color1Style = `color: ${m.val1 >= 0 ? '#10b981' : '#ef4444'};`;
            color2Style = `color: ${m.val2 >= 0 ? '#10b981' : '#ef4444'};`;
        }
        
        card.innerHTML = `
            <div class="comparison-metric-title">${m.title}</div>
            <div class="comparison-metric-values">
                <div class="comp-val-box a">
                    <span class="comp-val-label">${info1.cost_center_name || cc1}</span>
                    <span class="comp-val-num" style="${color1Style}" dir="ltr">${displayVal1}</span>
                </div>
                <div class="comp-val-box b">
                    <span class="comp-val-label">${info2.cost_center_name || cc2}</span>
                    <span class="comp-val-num" style="${color2Style}" dir="ltr">${displayVal2}</span>
                </div>
            </div>
            <div class="comparison-progress-container">
                <div class="comp-progress-a" style="width: ${pct1}%"></div>
                <div class="comp-progress-b" style="width: ${pct2}%"></div>
            </div>
        `;
        container.appendChild(card);
    });
    
    const ctx = document.getElementById("chart-comparison-bar").getContext("2d");
    if (comparisonBarChart) {
        comparisonBarChart.destroy();
    }
    
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textColor = isDark ? "#9ca3af" : "#64748b";
    const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";
    
    comparisonBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ["المبيعات", "الإيرادات", "المصروفات", "صافي الأرباح"],
            datasets: [
                {
                    label: info1.cost_center_name || cc1,
                    data: [sales1, pl1.income, pl1.expense, pl1.profit],
                    backgroundColor: '#6366f1',
                    borderRadius: 4
                },
                {
                    label: info2.cost_center_name || cc2,
                    data: [sales2, pl2.income, pl2.expense, pl2.profit],
                    backgroundColor: '#ec4899',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: textColor,
                        font: { family: 'Cairo', size: 11 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Cairo' } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Outfit' } }
                }
            }
        }
    });
};

let peakhoursLineChart = null;

window.loadPeakHours = function() {
    const company = document.getElementById("filter-company").value;
    const fromDate = document.getElementById("filter-from-date").value;
    const toDate = document.getElementById("filter-to-date").value;
    const costCenter = document.getElementById("filter-cost-center").value;
    
    if (!company) return;
    
    const args = { company, from_date: fromDate, to_date: toDate };
    if (costCenter) args.cost_center = costCenter;
    
    showLoader(true);
    callAPI("cost_center_analytics.api.get_sales_peak_hours", args).then(data => {
        renderPeakHours(data);
    }).catch(err => {
        console.error(err);
    }).finally(() => {
        showLoader(false);
    });
};

function renderPeakHours(data) {
    const chartMsg = document.getElementById("msg-peakhours-chart");
    
    if (peakhoursLineChart) {
        peakhoursLineChart.destroy();
        peakhoursLineChart = null;
    }
    
    const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
    if (totalAmount === 0) {
        chartMsg.style.display = "block";
        return;
    }
    chartMsg.style.display = "none";
    
    const labels = data.map(item => {
        const h = item.hour;
        const ampm = h >= 12 ? "مساءً" : "صباحاً";
        const displayHour = h % 12 === 0 ? 12 : h % 12;
        return `${displayHour} ${ampm}`;
    });
    
    const amounts = data.map(item => item.amount);
    
    const ctx = document.getElementById("chart-peakhours-line").getContext("2d");
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textColor = isDark ? "#9ca3af" : "#64748b";
    const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
    
    peakhoursLineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'معدل المبيعات التراكمي',
                data: amounts,
                borderColor: '#10b981',
                borderWidth: 3,
                fill: true,
                backgroundColor: gradient,
                tension: 0.35,
                pointRadius: 4,
                pointBackgroundColor: '#10b981'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: textColor, font: { family: 'Cairo' } }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Cairo', size: 10 } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Outfit' } }
                }
            }
        }
    });
}

window.loadSalespersons = function() {
    const company = document.getElementById("filter-company").value;
    const fromDate = document.getElementById("filter-from-date").value;
    const toDate = document.getElementById("filter-to-date").value;
    const costCenter = document.getElementById("filter-cost-center").value;
    
    if (!company) return;
    
    const args = { company, from_date: fromDate, to_date: toDate };
    if (costCenter) args.cost_center = costCenter;
    
    showLoader(true);
    callAPI("cost_center_analytics.api.get_salesperson_leaderboard", args).then(data => {
        renderSalespersons(data);
    }).catch(err => {
        console.error(err);
    }).finally(() => {
        showLoader(false);
    });
};

function renderSalespersons(data) {
    const tableBody = document.getElementById("table-salespersons-body");
    tableBody.innerHTML = "";
    
    if (!data || data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 30px;">لا توجد مبيعات مسندة لبائعين في هذه الفترة.</td></tr>`;
        return;
    }
    
    const totalSales = data.reduce((sum, item) => sum + item.amount, 0);
    
    data.forEach((item, index) => {
        const pct = totalSales > 0 ? (item.amount / totalSales) * 100 : 0;
        
        let rankBadge = `<span class="leaderboard-rank-num">${index + 1}</span>`;
        if (index === 0) rankBadge = "🥇";
        else if (index === 1) rankBadge = "🥈";
        else if (index === 2) rankBadge = "🥉";
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="text-align: center; font-size: 16px;">${rankBadge}</td>
            <td style="font-weight: 700; color: var(--text-main);">${item.sales_person}</td>
            <td class="text-right" style="font-family: 'Outfit', var(--font-family); font-weight: 700;"><span dir="ltr">${formatCurrency(item.amount)}</span></td>
            <td class="text-right" style="font-family: 'Outfit', var(--font-family); font-weight: 600; color: var(--primary);"><span dir="ltr">${pct.toFixed(1)}%</span></td>
        `;
        tableBody.appendChild(tr);
    });
}

window.exportPDF = function() {
    window.print();
};

window.loadWarehouseStock = function() {
    const company = document.getElementById("filter-company").value;
    const warehouse = document.getElementById("filter-warehouse").value;
    
    if (!company) return;
    
    const args = { company: company };
    if (warehouse) args.warehouse = warehouse;
    
    showLoader(true);
    callAPI("cost_center_analytics.api.get_warehouse_stock", args).then(data => {
        renderWarehouseStock(data);
    }).catch(err => {
        console.error(err);
    }).finally(() => {
        showLoader(false);
    });
};

function renderWarehouseStock(res) {
    const titleEl = document.getElementById("stock-section-title");
    const headerEl = document.getElementById("stock-table-header");
    const tableHeader = document.getElementById("table-stock-header");
    const tableBody = document.getElementById("table-stock-body");
    
    tableHeader.innerHTML = "";
    tableBody.innerHTML = "";
    
    if (res.type === "items") {
        titleEl.innerText = `مخزون مستودع: ${res.warehouse_name}`;
        headerEl.innerText = `تفاصيل كميات وتكاليف البضاعة في المستودع المحدد`;
        
        tableHeader.innerHTML = `
            <tr>
                <th>كود الصنف</th>
                <th>اسم الصنف</th>
                <th class="text-right">الكمية المتوفرة</th>
                <th class="text-right">متوسط تكلفة الحبة</th>
                <th class="text-right">إجمالي تكلفة المخزون</th>
            </tr>
        `;
        
        if (!res.data || res.data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">لا يوجد مخزون مسجل في هذا المستودع.</td></tr>`;
            return;
        }
        
        res.data.forEach(item => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-weight: 600; color: var(--text-main);">${item.item_code}</td>
                <td>${item.item_name}</td>
                <td class="text-right" style="font-family: 'Outfit', var(--font-family); font-weight: 600;"><span dir="ltr">${item.qty.toLocaleString()}</span></td>
                <td class="text-right" style="font-family: 'Outfit', var(--font-family);"><span dir="ltr">${formatCurrency(item.rate)}</span></td>
                <td class="text-right" style="font-family: 'Outfit', var(--font-family); font-weight: 600; color: var(--primary);"><span dir="ltr">${formatCurrency(item.valuation)}</span></td>
            `;
            tableBody.appendChild(tr);
        });
    } else {
        titleEl.innerText = "تحليل مخزون وتقييم المستودعات";
        headerEl.innerText = "تفصيل كميات وتكلفة بضاعة المستودعات على مستوى الشركة";
        
        tableHeader.innerHTML = `
            <tr>
                <th>اسم المستودع</th>
                <th class="text-right">عدد الأصناف الفريدة</th>
                <th class="text-right">إجمالي كميات البضاعة</th>
                <th class="text-right">إجمالي تكلفة المخزون</th>
            </tr>
        `;
        
        if (!res.data || res.data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 30px;">لا يوجد مخزون مسجل في أي مستودع للشركة.</td></tr>`;
            return;
        }
        
        res.data.forEach(item => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-weight: 600; color: var(--text-main);">${item.warehouse_name || item.warehouse}</td>
                <td class="text-right" style="font-family: 'Outfit', var(--font-family);">${item.unique_items.toLocaleString()}</td>
                <td class="text-right" style="font-family: 'Outfit', var(--font-family); font-weight: 600;"><span dir="ltr">${item.total_qty.toLocaleString()}</span></td>
                <td class="text-right" style="font-family: 'Outfit', var(--font-family); font-weight: 600; color: var(--primary);"><span dir="ltr">${formatCurrency(item.total_value)}</span></td>
            `;
            tableBody.appendChild(tr);
        });
    }
}



