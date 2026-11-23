from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
import joblib
import pandas as pd
import random
from datetime import datetime, timezone

from database import SessionLocal, init_db, TelemetryRecord, AlertRecord, ChargingSession

init_db()
ml_model = joblib.load("anomaly_model.joblib")

app = FastAPI(title="Voltora AI - EV Charger Telemetry & Billing CSMS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class TelemetryInput(BaseModel):
    charger_id: str
    status: str
    voltage: float
    current: float
    temperature: float
    energy_kwh: float
    session_energy_delta: float = 0.0
    simulated_minutes_delta: float = 0.0

class SessionStartInput(BaseModel):
    charger_id: str
    vehicle_tag: str = "MH-02-EV-4091"
    prepaid_amount: float = 500.0
    tariff_per_kwh: float = 20.0

def settle_session(session: ChargingSession, reason: str, status: str = "COMPLETED"):
    session.status = status
    session.end_time = datetime.now(timezone.utc)
    session.stop_reason = reason
    session.actual_cost = round(min(session.prepaid_amount, session.energy_delivered_kwh * session.tariff_per_kwh), 2)
    session.refund_amount = round(max(0.0, session.prepaid_amount - session.actual_cost), 2)

def process_telemetry_reading(data: TelemetryInput, db: Session):
    features = pd.DataFrame([{
        "voltage": data.voltage,
        "current": data.current,
        "temperature": data.temperature
    }])

    prediction = ml_model.predict(features)[0]
    raw_score = ml_model.decision_function(features)[0]
    is_anomaly = 1 if prediction == -1 else 0

    # Determine Self-Healing AI Control Action
    control_mode = "OPTIMAL"
    target_current = 32.0

    if is_anomaly == 1:
        if data.temperature > 60 or data.voltage < 205 or data.current > 40:
            control_mode = "SELF_HEALING"
            target_current = 16.0  # Throttle current by 50% to cool down & stabilize grid

    record = TelemetryRecord(
        charger_id=data.charger_id,
        timestamp=datetime.now(timezone.utc),
        status=control_mode if is_anomaly else data.status,
        voltage=data.voltage,
        current=data.current,
        temperature=data.temperature,
        energy_kwh=data.energy_kwh,
        is_anomaly=is_anomaly
    )
    db.add(record)

    active_session = (
        db.query(ChargingSession)
        .filter(ChargingSession.charger_id == data.charger_id, ChargingSession.status == "ACTIVE")
        .order_by(ChargingSession.id.desc())
        .first()
    )

    if active_session and data.status in ["Charging", "SELF_HEALING"]:
        active_session.energy_delivered_kwh = round(active_session.energy_delivered_kwh + data.session_energy_delta, 3)
        active_session.simulated_minutes = round(active_session.simulated_minutes + data.simulated_minutes_delta, 1)
        active_session.actual_cost = round(active_session.energy_delivered_kwh * active_session.tariff_per_kwh, 2)
        active_session.refund_amount = round(max(0.0, active_session.prepaid_amount - active_session.actual_cost), 2)
        active_session.stop_reason = (
            "AI Self-Healing Active (16A Derated) — Charging Uninterrupted"
            if control_mode == "SELF_HEALING"
            else "Vehicle connected & charging"
        )

        if active_session.actual_cost >= active_session.prepaid_amount:
            settle_session(active_session, "Prepaid limit reached (₹0 refund)", "COMPLETED")

    alert_data = None
    if is_anomaly == 1:
        confidence = round(min(99.9, max(50.0, 50.0 + abs(raw_score) * 250)), 1)
        severity = "SELF-HEALING" if data.temperature <= 85 else "CRITICAL"

        reason = f"AI Derated Current to {target_current}A to stabilize Temp ({data.temperature}°C) & Voltage ({data.voltage}V)"
        alert = AlertRecord(
            charger_id=data.charger_id,
            timestamp=datetime.now(timezone.utc),
            severity=severity,
            confidence_score=confidence,
            issue_type="AI Dynamic Load Balancing",
            details=reason
        )
        db.add(alert)
        alert_data = {"severity": severity, "confidence": confidence, "details": reason}

        # Only cut power in extreme emergency (> 85°C)
        if data.temperature > 85 and active_session and active_session.status == "ACTIVE":
            settle_session(active_session, "Emergency Thermal Cutoff (>85°C) — Auto-Refunded", "FAULT_STOPPED")

    db.commit()
    return {
        "message": "Processed",
        "is_anomaly": bool(is_anomaly),
        "control_mode": control_mode,
        "target_current": target_current,
        "alert": alert_data
    }

@app.post("/api/telemetry")
def ingest_telemetry(data: TelemetryInput, db: Session = Depends(get_db)):
    return process_telemetry_reading(data, db)

@app.post("/api/sessions/start")
def start_charging_session(payload: SessionStartInput, db: Session = Depends(get_db)):
    existing = (
        db.query(ChargingSession)
        .filter(ChargingSession.charger_id == payload.charger_id, ChargingSession.status == "ACTIVE")
        .first()
    )
    if existing:
        return {"message": "Session already active", "session_id": existing.id}

    new_session = ChargingSession(
        charger_id=payload.charger_id,
        vehicle_tag=payload.vehicle_tag,
        start_time=datetime.now(timezone.utc),
        prepaid_amount=payload.prepaid_amount,
        tariff_per_kwh=payload.tariff_per_kwh,
        refund_amount=payload.prepaid_amount,
        status="ACTIVE",
        stop_reason="Vehicle connected & charging"
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return {"message": "Prepaid session started", "session_id": new_session.id}

@app.post("/api/sessions/{session_id}/stop")
def stop_charging_session(session_id: int, reason: str = "Battery full (BMS cut-off) — Unused balance refunded", db: Session = Depends(get_db)):
    session = db.query(ChargingSession).filter(ChargingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "ACTIVE":
        settle_session(session, reason, "COMPLETED")
        db.commit()
    return {
        "message": "Session settled",
        "actual_cost": session.actual_cost,
        "refund_amount": session.refund_amount
    }

@app.get("/api/sessions")
def get_sessions(limit: int = 25, db: Session = Depends(get_db)):
    return db.query(ChargingSession).order_by(ChargingSession.id.desc()).limit(limit).all()

@app.post("/api/simulate-fault/{charger_id}")
def trigger_demo_fault(charger_id: str, db: Session = Depends(get_db)):
    latest = db.query(TelemetryRecord).filter(TelemetryRecord.charger_id == charger_id).order_by(TelemetryRecord.id.desc()).first()
    current_energy = latest.energy_kwh if latest else 15.0

    fault_payload = TelemetryInput(
        charger_id=charger_id,
        status="Fault",
        voltage=188.4,
        current=47.8,
        temperature=79.5,
        energy_kwh=round(current_energy + 0.05, 3)
    )
    return process_telemetry_reading(fault_payload, db)

@app.get("/api/telemetry")
def get_recent_telemetry(limit: int = 200, db: Session = Depends(get_db)):
    return db.query(TelemetryRecord).order_by(TelemetryRecord.id.desc()).limit(limit).all()

@app.get("/api/alerts")
def get_alerts(limit: int = 25, db: Session = Depends(get_db)):
    return db.query(AlertRecord).order_by(AlertRecord.id.desc()).limit(limit).all()

@app.delete("/api/alerts/{alert_id}")
def resolve_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(AlertRecord).filter(AlertRecord.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    db.delete(alert)
    db.commit()
    return {"message": "Alert acknowledged and cleared"}