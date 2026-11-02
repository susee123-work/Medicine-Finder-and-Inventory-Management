import math
import numpy as np
import pandas as pd
from datetime import datetime, timedelta, timezone, date
from typing import Dict, List, Any, Tuple, Optional
from collections import defaultdict
import logging

logger = logging.getLogger("medipulse.forecasting")

def calculate_mape(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Calculate Mean Absolute Percentage Error (MAPE) handling zeros safely."""
    if len(actual) == 0:
        return 0.0
    actual = np.array(actual, dtype=float)
    predicted = np.array(predicted, dtype=float)
    
    # Avoid zero-division by adding epsilon or taking percentage of non-zero
    mask = actual > 0
    if not np.any(mask):
        return round(float(np.mean(np.abs(predicted))), 2)
    
    mape = np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100.0
    return round(float(np.clip(mape, 0.0, 100.0)), 2)

class ShortagePredictionPipeline:
    def __init__(self, service_level_z: float = 1.65):
        self.z_factor = service_level_z # 1.65 corresponds to 95% cycle service level

    def build_daily_series(self, sales: List[Dict[str, Any]], days_lookback: int = 45) -> pd.DataFrame:
        """Aggregate sales into a continuous daily time-series with zero-filled gaps."""
        today = date.today()
        start_date = today - timedelta(days=days_lookback)
        
        # Build date index
        date_range = pd.date_range(start=start_date, end=today, freq="D")
        df = pd.DataFrame({"sale_date": date_range})
        df["date_str"] = df["sale_date"].dt.strftime("%Y-%m-%d")
        df["quantity"] = 0
        df["day_of_week"] = df["sale_date"].dt.dayofweek
        
        # Aggregate actual sales
        sales_by_date = defaultdict(int)
        for s in sales:
            raw_ts = s.get("sold_at")
            if not raw_ts:
                continue
            date_key = str(raw_ts)[:10]
            sales_by_date[date_key] += int(s.get("quantity", 0))
            
        df["quantity"] = df["date_str"].map(sales_by_date).fillna(0).astype(int)
        return df

    def fit_and_forecast(
        self,
        daily_df: pd.DataFrame,
        horizon_days: int = 7,
        cluster_fallback_rate: float = 2.0
    ) -> Tuple[List[float], List[float], List[float], float, str]:
        """
        Fits Holt-Winters or Seasonal Linear Ridge Model with Day-of-Week Seasonality.
        Returns: (forecast_mean, forecast_lower, forecast_upper, mape, model_name)
        """
        y = daily_df["quantity"].values.astype(float)
        n = len(y)
        
        # Check for cold-start / sparse data
        non_zero_count = np.count_nonzero(y)
        if non_zero_count < 4 or n < 10:
            # Cold-start fallback
            base_rate = max(cluster_fallback_rate, float(np.mean(y)) if n > 0 else cluster_fallback_rate)
            forecast_mean = [round(base_rate, 2)] * horizon_days
            forecast_lower = [max(0.0, round(base_rate * 0.7, 2))] * horizon_days
            forecast_upper = [round(base_rate * 1.4, 2)] * horizon_days
            return forecast_mean, forecast_lower, forecast_upper, 15.0, "Cluster-Fallback Model"

        # Try Holt-Winters Exponential Smoothing if statsmodels is available
        try:
            from statsmodels.tsa.holtwinters import ExponentialSmoothing
            # Train-test split for backtesting (last 7 days as test if n >= 21)
            train_len = max(n - 7, 7)
            y_train = y[:train_len]
            y_test = y[train_len:]
            
            # Use seasonal_periods=7 for weekly seasonality
            hw_model = ExponentialSmoothing(
                y_train,
                seasonal_periods=7,
                trend="add",
                seasonal="add",
                initialization_method="estimated"
            ).fit(damping_trend=0.8)
            
            # Backtest MAPE
            test_preds = np.clip(hw_model.forecast(len(y_test)), 0, None)
            mape = calculate_mape(y_test, test_preds)
            
            # Refit on full series
            full_model = ExponentialSmoothing(
                y,
                seasonal_periods=7,
                trend="add",
                seasonal="add",
                initialization_method="estimated"
            ).fit(damping_trend=0.8)
            
            raw_forecast = np.clip(full_model.forecast(horizon_days), 0, None)
            
            # Confidence intervals based on in-sample residual variance
            residuals = y - full_model.fittedvalues
            residual_std = float(np.std(residuals)) if len(residuals) > 0 else 1.0
            
            forecast_mean = [round(float(val), 2) for val in raw_forecast]
            forecast_lower = [max(0.0, round(float(val - 1.96 * residual_std), 2)) for val in raw_forecast]
            forecast_upper = [round(float(val + 1.96 * residual_std), 2) for val in raw_forecast]
            
            return forecast_mean, forecast_lower, forecast_upper, mape, "Holt-Winters Exponential Smoothing"
        except Exception as e:
            logger.debug("Holt-Winters fell back to Seasonal Regression: %s", e)

        # Fallback: Scikit-learn Linear Regression with Day-of-Week Seasonality & Trend
        from sklearn.linear_model import Ridge
        
        # Build features: trend index + day-of-week one-hot
        X = np.zeros((n, 8))
        X[:, 0] = np.arange(n) # trend
        for i, dow in enumerate(daily_df["day_of_week"].values):
            X[i, 1 + dow] = 1.0
            
        train_len = max(n - 7, 7)
        reg = Ridge(alpha=1.0)
        reg.fit(X[:train_len], y[:train_len])
        test_preds = np.clip(reg.predict(X[train_len:]), 0, None)
        mape = calculate_mape(y[train_len:], test_preds)
        
        # Refit on full dataset
        reg.fit(X, y)
        future_X = np.zeros((horizon_days, 8))
        future_dows = [(daily_df["day_of_week"].iloc[-1] + i + 1) % 7 for i in range(horizon_days)]
        future_X[:, 0] = np.arange(n, n + horizon_days)
        for i, dow in enumerate(future_dows):
            future_X[i, 1 + dow] = 1.0
            
        raw_forecast = np.clip(reg.predict(future_X), 0, None)
        residuals = y - reg.predict(X)
        residual_std = float(np.std(residuals)) if len(residuals) > 0 else 1.0
        
        forecast_mean = [round(float(val), 2) for val in raw_forecast]
        forecast_lower = [max(0.0, round(float(val - 1.96 * residual_std), 2)) for val in raw_forecast]
        forecast_upper = [round(float(val + 1.96 * residual_std), 2) for val in raw_forecast]
        
        return forecast_mean, forecast_lower, forecast_upper, mape, "Ridge Regression (Trend + DOW Seasonality)"

    def compute_safety_stock(
        self,
        daily_demand_mean: float,
        daily_demand_std: float,
        lead_time_days: int,
        lead_time_std: float = 1.0
    ) -> int:
        """
        Calculate safety stock using standard supply-chain formula:
        Safety Stock = Z * sqrt( L * sigma_D^2 + D^2 * sigma_L^2 )
        """
        term1 = lead_time_days * (daily_demand_std ** 2)
        term2 = (daily_demand_mean ** 2) * (lead_time_std ** 2)
        combined_variance = term1 + term2
        safety_stock = self.z_factor * math.sqrt(max(0.01, combined_variance))
        return int(math.ceil(safety_stock))

    def evaluate_risk_score(
        self,
        current_stock: int,
        daily_demand_rate: float,
        days_of_cover: float,
        lead_time_days: int,
        safety_stock: int,
        expiring_within_horizon: int
    ) -> Tuple[float, str, List[str]]:
        """
        Compute an interpretable 0-100 risk score with top factor explanations.
        """
        factors = []
        score = 0.0
        
        # Factor 1: Buffer deficit vs Reorder Point (ROP = Demand * Lead + Safety Stock)
        reorder_point = (daily_demand_rate * lead_time_days) + safety_stock
        if current_stock <= 0:
            score += 45.0
            factors.append("Complete stockout: Current stock is 0.")
        elif current_stock < safety_stock:
            deficit_pct = (safety_stock - current_stock) / max(1, safety_stock)
            score += 30.0 + (deficit_pct * 15.0)
            factors.append(f"Safety buffer breached: Stock ({current_stock}) is below safety threshold ({safety_stock}).")
        elif current_stock <= reorder_point:
            score += 20.0
            factors.append(f"Reorder point reached: Stock ({current_stock}) is within reorder window (ROP={int(reorder_point)}).")
        else:
            score += 5.0
            
        # Factor 2: Days of Cover vs. Supplier Lead Time
        if days_of_cover <= lead_time_days:
            score += 35.0
            factors.append(f"Lead time deficit: Days of cover ({days_of_cover:.1f}d) is less than supplier lead time ({lead_time_days}d).")
        elif days_of_cover <= (lead_time_days + 2):
            score += 20.0
            factors.append(f"Tight lead time buffer: Days of cover ({days_of_cover:.1f}d) barely matches lead time ({lead_time_days}d).")
        elif days_of_cover <= 7.0:
            score += 10.0
            factors.append(f"Short horizon: Less than 7 days of stock remaining.")
            
        # Factor 3: Expiring Batches
        if expiring_within_horizon > 0:
            score += 15.0
            factors.append(f"Expiring stock: {expiring_within_horizon} units expire within the 7-day horizon.")

        # Factor 4: High Demand Velocity
        if daily_demand_rate > 15:
            score += 10.0
            factors.append(f"High velocity medicine: Demand exceeds 15 units/day.")

        # Normalize score
        final_score = round(float(np.clip(score, 0.0, 100.0)), 1)
        
        if final_score >= 75.0:
            risk_level = "CRITICAL"
        elif final_score >= 50.0:
            risk_level = "HIGH"
        elif final_score >= 25.0:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"
            
        return final_score, risk_level, factors

forecasting_pipeline = ShortagePredictionPipeline()
