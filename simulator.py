import time
import random
import requests

API_BASE = "http://127.0.0.1:8000/api"
CHARGERS = ["EV-STN-01", "EV-STN-02", "EV-STN-03"]
VEHICLES = ["MH-01-EV-1024", "MH-12-EV-8842", "DL-04-EV-5519", "KA-03-EV-7721", "GJ-01-EV-3390"]

station_state = {
    c: {
        "session_id": None,
        "target_cost": random.uniform(320.0, 410.0),
        "cooldown_ticks": 0,
        "total_meter_kwh": 25.0,
        "healing_ticks": 0,
        "temp": 42.0,
        "voltage": 230.0
    }
    for c in CHARGERS
}

print("Starting Voltora AI Self-Healing Simulator... Press Ctrl+C to stop.")

while True:
    try:
        sessions_res = requests.get(f"{API_BASE}/sessions?limit=15").json()
        active_map = {s["charger_id"]: s for s in sessions_res if s["status"] == "ACTIVE"}
    except Exception as e:
        print(f"Waiting for FastAPI backend... ({e})")
        time.sleep(2)
        continue

    for charger in CHARGERS:
        st = station_state[charger]
        active_session = active_map.get(charger)

        if not active_session:
            st["session_id"] = None
            st["healing_ticks"] = 0
            if st["cooldown_ticks"] > 0:
                st["cooldown_ticks"] -= 1
                requests.post(f"{API_BASE}/telemetry", json={
                    "charger_id": charger,
                    "status": "Available",
                    "voltage": round(random.normalvariate(231.0, 1.0), 1),
                    "current": 0.0,
                    "temperature": round(random.normalvariate(34.0, 1.0), 1),
                    "energy_kwh": st["total_meter_kwh"],
                    "session_energy_delta": 0.0,
                    "simulated_minutes_delta": 0.0
                })
                continue
            else:
                veh = random.choice(VEHICLES)
                res = requests.post(f"{API_BASE}/sessions/start", json={
                    "charger_id": charger,
                    "vehicle_tag": veh,
                    "prepaid_amount": 500.0,
                    "tariff_per_kwh": 20.0
                }).json()
                st["session_id"] = res.get("session_id")
                st["target_cost"] = round(random.uniform(320.0, 410.0), 2)
                st["temp"] = 42.0
                st["voltage"] = 230.0
                print(f"[{charger}] NEW VEHICLE {veh} plugged in | Prepaid: ₹500")
                continue

        # Check if currently in AI Self-Healing mode (Current throttled to 16A so Temp & Voltage recover!)
        if st["healing_ticks"] > 0:
            st["healing_ticks"] -= 1
            current = round(random.normalvariate(16.0, 0.5), 1)       # Throttled current
            st["temp"] = round(max(43.0, st["temp"] - 7.5), 1)        # Cooling down rapidly
            st["voltage"] = round(min(229.0, st["voltage"] + 9.0), 1) # Grid voltage recovering
            status = "SELF_HEALING"
        elif random.random() < 0.05:
            # Inject abnormal thermal/voltage spike
            st["voltage"] = round(random.uniform(192.0, 202.0), 1)
            current = round(random.uniform(41.0, 46.0), 1)
            st["temp"] = round(random.uniform(66.0, 74.0), 1)
            status = "Charging"
        else:
            st["voltage"] = round(random.normalvariate(230.0, 1.8), 1)
            current = round(random.normalvariate(32.0, 1.2), 1)
            st["temp"] = round(random.normalvariate(43.0, 2.5), 1)
            status = "Charging"

        sim_mins_delta = 1.5
        kwh_delta = round((st["voltage"] * current / 1000.0) * (sim_mins_delta / 60.0) * 6.5, 3)
        st["total_meter_kwh"] = round(st["total_meter_kwh"] + kwh_delta, 3)

        resp = requests.post(f"{API_BASE}/telemetry", json={
            "charger_id": charger,
            "status": status,
            "voltage": st["voltage"],
            "current": current,
            "temperature": st["temp"],
            "energy_kwh": st["total_meter_kwh"],
            "session_energy_delta": kwh_delta,
            "simulated_minutes_delta": sim_mins_delta
        }).json()

        # If FastAPI commands SELF_HEALING, engage 3-tick recovery loop
        if resp.get("control_mode") == "SELF_HEALING" and st["healing_ticks"] == 0:
            st["healing_ticks"] = 3
            print(f"[{charger}] AI SELF-HEALING ENGAGED -> Throttling current to 16A to cool hardware!")
        else:
            print(f"[{charger}] {status} | {st['voltage']}V, {current}A, {st['temp']}°C")

        new_cost = active_session["actual_cost"] + (kwh_delta * active_session["tariff_per_kwh"])
        if new_cost >= st["target_cost"]:
            stop_res = requests.post(
                f"{API_BASE}/sessions/{active_session['id']}/stop",
                params={"reason": "Battery 100% Full (Uninterrupted via AI Derating) — Balance Refunded"}
            ).json()
            print(f"[{charger}] COMPLETED UNINTERRUPTED! Billed: ₹{stop_res.get('actual_cost')} | Refunded: ₹{stop_res.get('refund_amount')}")
            st["cooldown_ticks"] = 3

    time.sleep(2)