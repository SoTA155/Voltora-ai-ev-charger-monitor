import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib

# 1. Generate realistic normal EV charging data (Level 2 AC Charger: ~230V, ~32A, ~35-50°C)
np.random.seed(42)
n_normal = 1000

normal_data = pd.DataFrame({
    "voltage": np.random.normal(loc=230.0, scale=3.0, size=n_normal),
    "current": np.random.normal(loc=32.0, scale=2.0, size=n_normal),
    "temperature": np.random.normal(loc=42.0, scale=4.0, size=n_normal),
})

# 2. Generate synthetic anomalies (voltage drops, current spikes, overheating)
n_anomalies = 50
anomaly_data = pd.DataFrame({
    "voltage": np.random.uniform(180.0, 260.0, size=n_anomalies),
    "current": np.random.uniform(5.0, 55.0, size=n_anomalies),
    "temperature": np.random.uniform(65.0, 95.0, size=n_anomalies),
})

# Combine dataset
training_df = pd.concat([normal_data, anomaly_data], ignore_index=True)

# 3. Train Isolation Forest
model = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)
model.fit(training_df[["voltage", "current", "temperature"]])

# 4. Save the trained model to disk
joblib.dump(model, "anomaly_model.joblib")
print("SUCCESS: Model trained and saved as 'anomaly_model.joblib'")