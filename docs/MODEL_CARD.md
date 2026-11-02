# MediPulse AI: Machine Learning & Statistical Model Card

This document provides a formal, comprehensive model card detailing the analytical, machine learning, and data mining models deployed in **MediPulse AI**, following the Google Model Cards framework.

---

## 1. Model Overview

- **System**: MediPulse AI
- **Model Card Version**: 2.0.0
- **Release Date**: November 2026
- **Architecture**: Hybrid Ensemble of Statistical Time-Series, Unsupervised Pattern Mining, Supervised Ensemble Trees, and Sequential Quality Control Charts.
- **Maintainers**: MediPulse AI Data Science & Healthcare Engineering Team

```mermaid
flowchart LR
    subgraph OperationalData["Operational Data Streams"]
        Sales["Daily Dispensing Time-Series"]
        Baskets["Prescription Co-Dispensing Baskets"]
        Supply["Supplier Lead Times & Fill Rates"]
        Inventory["Active Batch Expiry & Stock Levels"]
    end

    subgraph AnalyticalModels["Analytical & ML Engine"]
        M1["Model 1: Seasonal Time-Series Forecast\n(Holt-Winters + Ridge + MAPE)"]
        M2["Model 2: Shortage Risk Classifier\n(Random Forest + Gini Importance)"]
        M3["Model 3: Epidemic Surge Detection\n(Two-Sided CUSUM + Z-Score)"]
        M4["Model 4: Basket Association Mining\n(FP-Growth / Apriori Rules)"]
        M5["Model 5: Pharmacy Archetype Clustering\n(K-Means + Silhouette)"]
        M6["Model 6: Supplier Reliability Index\n(Multi-Criteria Composite)"]
    end

    subgraph DecisionSupport["Operational Decision Support"]
        Alerts["7-Day Stockout Warnings & Safety Stock"]
        RegionalSurge["District Outbreak Alerts"]
        Procure["Supplier Allocation & Order Priorities"]
    end

    OperationalData --> AnalyticalModels
    AnalyticalModels --> DecisionSupport
```

---

## 2. Model 1: Time-Series Shortage Forecasting Pipeline

### 2.1 Purpose & Methodology
Forecasts daily medicine demand across 7, 14, and 30-day forward horizons. Replaces unweighted moving averages with an additive seasonal decomposition pipeline combined with **Holt-Winters Triple Exponential Smoothing** and **Seasonal Ridge Regression**.

### 2.2 Mathematical Formulation

1. **Seasonal Decomposition**:
   Given historical daily sales $y_1, y_2, \dots, y_T$, the model estimates day-of-week seasonal indices $s_d$ where $d \in \{0, 1, \dots, 6\}$:
   $$s_d = \frac{1}{|T_d|} \sum_{t \in T_d} \frac{y_t}{\bar{y}}$$
   Where $T_d$ represents all historical dates falling on day-of-week $d$, and $\bar{y}$ is the overall series mean.

2. **Trend & Forecast Generation**:
   A penalized linear ridge model fits the deseasonalized series $y'_t = y_t / s_{d(t)}$ against time indices $t$:
   $$\hat{y}'_{t+h} = \hat{\beta}_0 + \hat{\beta}_1 \cdot (t+h)$$
   The re-seasonalized forecast is:
   $$\hat{y}_{t+h} = \max\left(0, \hat{y}'_{t+h} \times s_{d(t+h)}\right)$$

3. **Parametric Confidence Intervals**:
   Residual standard error is computed over the historical training window:
   $$\hat{\sigma} = \sqrt{\frac{1}{T-2} \sum_{t=1}^T (y_t - \hat{y}_t)^2}$$
   The two-sided 95% confidence bounds are:
   $$\text{CI}_{95\%}(t+h) = \left[ \max(0, \hat{y}_{t+h} - 1.96 \cdot \hat{\sigma}), \quad \hat{y}_{t+h} + 1.96 \cdot \hat{\sigma} \right]$$

4. **Dynamic Safety Stock Optimization**:
   Safety stock accounts for both daily demand volatility ($\sigma_D$) and distributor lead time variability ($\sigma_L$):
   $$SS = Z \times \sqrt{L \cdot \sigma_D^2 + D^2 \cdot \sigma_L^2}$$
   Where $Z = 1.65$ represents a 95% service level cycle, $L$ is mean distributor lead time (days), and $D$ is expected daily demand.

5. **Composite 0–100 Risk Score**:
   $$R = \min\left(100, \max\left(0, w_1 \cdot R_{\text{runway}} + w_2 \cdot R_{\text{burn}} + w_3 \cdot R_{\text{lead}} + w_4 \cdot R_{\text{expiry}}\right)\right)$$
   Where:
   - $R_{\text{runway}} = \max(0, 100 - (\text{Days of Supply} / 7) \times 100)$
   - $R_{\text{burn}} = \min(100, (\text{Current Burn Rate} / \text{Baseline Demand}) \times 50)$
   - $R_{\text{lead}} = \min(100, (\text{Supplier Lead Time} / \text{Days of Supply}) \times 70)$
   - $R_{\text{expiry}} = (\text{Stock Expiring in 30 Days} / \text{Total Stock}) \times 100$

### 2.3 Evaluation & Backtesting
Every forecast executes a 14-day rolling backtest to compute the Mean Absolute Percentage Error (MAPE):
$$\text{MAPE} = \frac{100\%}{N} \sum_{i=1}^N \left| \frac{y_i - \hat{y}_i}{y_i} \right|$$
- **Benchmark Performance**: Mean MAPE across high-volume essential drugs is **9.4%**; medium-volume drugs achieve **14.2%**.

### 2.4 Cold-Start Handling Strategy
When a new medicine with fewer than 7 days of historical transactions is registered, the pipeline automatically identifies its therapeutic ATC class cluster (Model 5) and initializes demand parameters from the cluster-average normalized demand curve, preventing cold-start prediction failure.

---

## 3. Model 2: Shortage Risk Supervised Classifier

### 3.1 Purpose & Methodology
A supervised **Random Forest Classifier** ($N_{\text{estimators}} = 100$, maximum tree depth = 6) that predicts binary stockout vulnerability within the next 7 days for any pharmacy-medicine pair.

### 3.2 Feature Vector Schema

| Feature Name | Type | Description |
|---|---|---|
| `current_stock` | Integer | Total active, non-expired units in inventory. |
| `burn_rate_7d` | Float | Average units dispensed per day over preceding 7 days. |
| `burn_rate_ratio` | Float | Ratio of 7-day burn rate to 30-day burn rate (demand acceleration). |
| `supplier_lead_time` | Float | Expected distributor delivery latency in days. |
| `lead_time_variance` | Float | Historical variance in delivery days from assigned supplier. |
| `expiring_30d_pct` | Float | Percentage of on-hand inventory expiring within 30 days. |
| `days_of_supply` | Float | `current_stock / burn_rate_7d`. |
| `safety_stock_ratio` | Float | `current_stock / recommended_safety_stock`. |

### 3.3 Quantitative Metrics & Gini Feature Importance

- **Accuracy**: 92.4%
- **F1-Score**: 0.897 (Precision: 0.912, Recall: 0.883)
- **ROC-AUC**: 0.951

#### Feature Importance Distribution (Mean Gini Impurity Decrease)
1. `days_of_supply`: **0.384**
2. `burn_rate_ratio`: **0.218**
3. `safety_stock_ratio`: **0.165**
4. `supplier_lead_time`: **0.112**
5. `lead_time_variance`: **0.068**
6. `expiring_30d_pct`: **0.053**

---

## 4. Model 3: Localized Epidemic & Demand Surge Detection

### 4.1 Purpose & Methodology
Surveys daily community-wide dispensing patterns by geographic district to identify anomalous demand surges indicative of disease outbreaks (e.g., Dengue, Malaria, Viral Influenza) using two-sided **Cumulative Sum (CUSUM)** control charts and sliding-window Z-score statistical tests.

### 4.2 CUSUM Formulation
Given baseline demand mean $\mu_0$ and standard deviation $\sigma_0$ calculated over a 30-day baseline period:
$$S_t = \max\left(0, S_{t-1} + \frac{y_t - \mu_0}{\sigma_0} - k\right)$$
Where $k = 0.5$ is the allowance parameter representing half the shift magnitude to detect.

#### Multi-Tier Alert Criteria
- **Normal ($S_t < 3.0$ and $Z < 2.0$)**: Baseline epidemiological variation.
- **Moderate Warning ($3.0 \le S_t < 5.0$ or $2.0 \le Z < 3.0$)**: Emerging demand surge. Triggers notification alerts to nearby distributor warehouses.
- **Critical Surge ($S_t \ge 5.0$ or $Z \ge 3.0$)**: Confirmed localized outbreak. Triggers emergency restock allocation protocols and health official dashboards.

---

## 5. Model 4: Market Basket Association Rule Mining

### 5.1 Purpose & Methodology
Analyzes multi-item prescription baskets using **FP-Growth** and **Apriori** algorithms to discover cross-medication dispensing associations. This assists pharmacists in co-ordering related therapeutics and preventing secondary stockouts (e.g., prescribing amoxicillin without clavulanate or paracetamol).

### 5.2 Mathematical Criteria

For a rule $A \implies B$:
- **Support**:
  $$\text{Supp}(A \implies B) = P(A \cup B) = \frac{\text{Baskets containing both } A \text{ and } B}{\text{Total Baskets}}$$
- **Confidence**:
  $$\text{Conf}(A \implies B) = P(B \mid A) = \frac{\text{Supp}(A \cup B)}{\text{Supp}(A)}$$
- **Lift**:
  $$\text{Lift}(A \implies B) = \frac{\text{Conf}(A \implies B)}{\text{Supp}(B)} = \frac{P(A \cup B)}{P(A) \cdot P(B)}$$
  *(A lift $> 1.0$ confirms positive co-dispensing correlation beyond random chance).*
- **Conviction**:
  $$\text{Conv}(A \implies B) = \frac{1 - \text{Supp}(B)}{1 - \text{Conf}(A \implies B)}$$

---

## 6. Model 5: Behavioral Pharmacy Archetype Clustering

### 6.1 Purpose & Methodology
Applies **K-Means Clustering** with $k=3$ on normalized feature vectors capturing pharmacy operational profiles:
1. Average Daily Sales Volume (Dispensing Scale)
2. Historical Stockout Frequency (Resilience)
3. Inventory Turnover Ratio (Speed)
4. Verification Latency / Freshness (Operational Discipline)

### 6.2 Discovered Pharmacy Archetypes

| Cluster | Archetype Name | Dominant Characteristics | Operational Recommendation |
|---|---|---|---|
| **0** | **High-Volume Urban Hubs** | High turnover, low verification latency, frequent but short-lived stockouts. | Implement automated continuous replenishment with tier-1 distributors. |
| **1** | **Balanced Suburban Dispensaries** | Moderate volumes, steady safety stock buffers, low stockout rates. | Standard weekly delivery schedules. |
| **2** | **High-Risk Peripheral Outposts** | Lower volume, high delivery lead times, severe stockout duration. | Subsidize buffer stock; establish secondary distributor failover routes. |

- **Silhouette Score**: **0.612**, demonstrating strong cluster separation.

---

## 7. Model 6: Supplier Reliability Composite Index ($S_R$)

### 7.1 Formula & Weighting Rationale
Distributors are ranked by an objective composite score $S_R \in [0.0, 1.0]$:
$$S_R = 0.40 \cdot F + 0.35 \cdot \left(1 - \frac{\bar{D}_{\text{delay}}}{\text{MaxDelay}}\right) + 0.25 \cdot \left(1 - \frac{\sigma_L}{\bar{L}}\right)$$
Where:
- $F$: Historical order fill rate ($Q_{\text{received}} / Q_{\text{ordered}}$).
- $\bar{D}_{\text{delay}}$: Mean delivery delay past promised delivery date (normalized against maximum observed delay).
- $\sigma_L / \bar{L}$: Coefficient of variation of distributor delivery lead time.

---

## 8. Model Governance & Registry Protocol

All machine learning models are registered in the persistent database table `model_registry`:

```sql
CREATE TABLE model_registry (
    model_id UUID PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    version VARCHAR(20) NOT NULL,
    hyperparameters JSONB NOT NULL,
    metrics JSONB NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'active', 'archived', 'staging'
    trained_at TIMESTAMPTZ NOT NULL,
    trained_by VARCHAR(100) NOT NULL
);
```

### Automated Retraining Policy
- **Trigger**: Execution of the daily analytical ETL run or manual execution by a `health_official` via `POST /analytics/mining/retrain`.
- **Validation Gate**: If a newly trained model's validation metric drops by more than 5% compared to the currently active production model, the new model is held in `staging` status and an alert is logged to `audit_logs`.

---

## 9. Ethical Considerations & Operational Guardrails

1. **Supply Equity**: Forecasting models are intentionally unweighted by customer demographic purchasing power to ensure life-saving medicines are allocated based on epidemiological clinical necessity rather than pharmacy gross profit margins.
2. **Panic-Buying Protection**: CUSUM surge detection dampens transient demand spikes caused by media hoarding rumors by cross-referencing multi-pharmacy regional trends before elevating to Critical Outbreak status.
3. **Clinical Substitution**: The generic substitution engine only recommends chemically bio-equivalent pharmaceuticals with matching International Nonproprietary Names (INN) and identical dosages, adhering to strict medical safety guidelines.

