import datetime
from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Text, JSON, Boolean
from sqlalchemy.orm import relationship
from ..database.connection import Base

class Equipment(Base):
    __tablename__ = "equipment"

    id = Column(String, primary_key=True, index=True) # e.g. WP-01, OX-02
    name = Column(String, nullable=False)
    stage = Column(String, nullable=False)
    status = Column(String, default="normal") # normal, warning, critical
    health = Column(Float, default=100.0) # 0-100
    rul = Column(Integer, default=2000) # remaining useful life hours
    failure_prob = Column(Float, default=0.0) # 0-1

    # Relationships
    readings = relationship("SensorReadings", back_populates="equipment", cascade="all, delete-orphan")
    alerts = relationship("Alerts", back_populates="equipment", cascade="all, delete-orphan")
    predictions = relationship("Predictions", back_populates="equipment", cascade="all, delete-orphan")
    maintenance_history = relationship("MaintenanceHistory", back_populates="equipment", cascade="all, delete-orphan")

class SensorReadings(Base):
    __tablename__ = "sensor_readings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    machine_id = Column(String, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Sensor telemetry
    temperature = Column(Float, nullable=False)
    pressure = Column(Float, nullable=False)
    humidity = Column(Float, nullable=False)
    vibration = Column(Float, nullable=False)
    particle_count = Column(Float, nullable=False)
    voltage = Column(Float, nullable=False)
    current = Column(Float, nullable=False)
    
    # 'yield' is a Python reserved keyword, map class attribute to database column "yield"
    yield_val = Column("yield", Float, nullable=True)

    # Relationships
    equipment = relationship("Equipment", back_populates="readings")

class Alerts(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, index=True) # e.g. A-1042
    machine_id = Column(String, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String, nullable=False) # e.g. "Vibration Anomaly"
    severity = Column(String, nullable=False) # normal, warning, critical
    risk = Column(Float, nullable=False) # 0-1
    confidence = Column(Float, nullable=False) # 0-1
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    description = Column(Text, nullable=False)
    resolved = Column(Boolean, default=False)

    # Relationships
    equipment = relationship("Equipment", back_populates="alerts")

class Predictions(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    machine_id = Column(String, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)

    # ML Inference Results
    anomaly_score = Column(Float, nullable=False)
    risk_level = Column(String, nullable=False) # normal, warning, critical
    fault_type = Column(String, nullable=False) # Normal, Sensor Drift, Seal Degradation, Spindle Wear
    fault_confidence = Column(Float, nullable=False)
    predicted_yield = Column(Float, nullable=False)
    yield_loss_prob = Column(Float, nullable=False)
    failure_prob = Column(Float, nullable=False)
    predicted_rul = Column(Float, nullable=False)
    maintenance_urgency = Column(String, nullable=False) # low, medium, high, critical

    # Relationships
    equipment = relationship("Equipment", back_populates="predictions")

class MaintenanceHistory(Base):
    __tablename__ = "maintenance_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(String, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    action = Column(String, nullable=False) # e.g. Replace spindle bearing
    status = Column(String, default="completed") # scheduled, completed
    notes = Column(Text, nullable=True)

    # Relationships
    equipment = relationship("Equipment", back_populates="maintenance_history")

class YieldReports(Base):
    __tablename__ = "yield_reports"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    actual_yield = Column(Float, nullable=True)
    predicted_yield = Column(Float, nullable=False)
    loss_factors = Column(JSON, nullable=True) # Dict of feature importances or contributions
