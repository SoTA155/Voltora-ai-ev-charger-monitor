from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime, timezone

DATABASE_URL = "sqlite:///./ev_monitoring.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class TelemetryRecord(Base):
    __tablename__ = "telemetry"

    id = Column(Integer, primary_key=True, index=True)
    charger_id = Column(String, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    status = Column(String)
    voltage = Column(Float)
    current = Column(Float)
    temperature = Column(Float)
    energy_kwh = Column(Float)
    is_anomaly = Column(Integer)

class AlertRecord(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    charger_id = Column(String, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    severity = Column(String)
    confidence_score = Column(Float)
    issue_type = Column(String)
    details = Column(String)

class ChargingSession(Base):
    __tablename__ = "charging_sessions"

    id = Column(Integer, primary_key=True, index=True)
    charger_id = Column(String, index=True)
    vehicle_tag = Column(String)
    start_time = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    end_time = Column(DateTime, nullable=True)
    simulated_minutes = Column(Float, default=0.0)
    tariff_per_kwh = Column(Float, default=20.0)      # ₹20.00 per kWh
    prepaid_amount = Column(Float, default=500.0)     # e.g., ₹500 hold
    energy_delivered_kwh = Column(Float, default=0.0)
    actual_cost = Column(Float, default=0.0)          # e.g., ₹350
    refund_amount = Column(Float, default=0.0)        # e.g., ₹150
    status = Column(String, default="ACTIVE")         # ACTIVE, COMPLETED, FAULT_STOPPED
    stop_reason = Column(String, default="Charging in progress")

def init_db():
    Base.metadata.create_all(bind=engine)