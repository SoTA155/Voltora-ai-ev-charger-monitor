import streamlit as st
import requests
import pandas as pd
import time

st.set_page_config(page_title="EV Charger AI Monitor", layout="wide")
st.title("⚡ AI-Powered EV Charger Monitoring System")

API_BASE = "http://127.0.0.1:8000/api"

# Auto-refresh toggle
auto_refresh = st.sidebar.checkbox("Live Auto-Refresh (every 3s)", value=True)

try:
    telemetry_res = requests.get(f"{API_BASE}/telemetry?limit=150").json()
    alerts_res = requests.get(f"{API_BASE}/alerts?limit=10").json()

    if not telemetry_res:
        st.info("Waiting for telemetry data... Make sure simulator.py is running.")
    else:
        df = pd.DataFrame(telemetry_res)
        df["timestamp"] = pd.to_datetime(df["timestamp"])

        # Latest reading per charger
        latest_df = df.sort_values("id").groupby("charger_id").last().reset_index()

        # Top KPI Metrics
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Active Chargers", len(latest_df))
        col2.metric("Total Energy Delivered", f"{latest_df['energy_kwh'].sum():.2f} kWh")
        col3.metric("Avg Station Temp", f"{latest_df['temperature'].mean():.1f} °C")
        col4.metric("AI Alerts Triggered", len(alerts_res))

        st.divider()

        # Live Station Status Table & AI Alerts
        left_col, right_col = st.columns([1.2, 1])

        with left_col:
            st.subheader("🔌 Live Charger Status")
            display_cols = ["charger_id", "status", "voltage", "current", "temperature", "energy_kwh"]
            st.dataframe(latest_df[display_cols], use_container_width=True, hide_index=True)

            st.subheader("📈 Temperature Trend (°C)")
            chart_df = df.pivot_table(index="timestamp", columns="charger_id", values="temperature")
            st.line_chart(chart_df)

        with right_col:
            st.subheader("🚨 AI Anomaly & Fault Predictions")
            if alerts_res:
                for alert in alerts_res:
                    sev = alert.get("severity", "WARNING")
                    conf = alert.get("confidence_score", 0.0)
                    msg = (
                        f"**[{sev}] {alert['charger_id']}** — AI Confidence: **{conf}%**\n\n"
                        f"{alert['details']} *(Time: {alert['timestamp'][:19]})*"
                    )
                    if sev == "CRITICAL":
                        st.error(msg, icon="🔥")
                    else:
                        st.warning(msg, icon="⚠️")
            else:
                st.success("All systems operating within normal parameters.")

except Exception as e:
    st.error(f"Cannot connect to FastAPI backend. Ensure uvicorn is running. Error: {e}")

if auto_refresh:
    time.sleep(3)
    st.rerun()