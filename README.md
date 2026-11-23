# ⚡ Voltora AI — Predictive EV Charger Monitoring & Self-Healing CSMS

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![Scikit-Learn](https://img.shields.io/badge/Scikit--Learn-Isolation%20Forest-F7931E?style=flat&logo=scikitlearn&logoColor=white)](https://scikit-learn.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

**Voltora AI** is an end-to-end **Charge Point Management System (CSMS)** and predictive edge-AI platform built to eliminate unplanned EV charger downtime. Instead of relying on passive monitoring or abrupt safety shutdowns that leave drivers stranded, Voltora AI detects multi-variable hardware anomalies in **<5ms**, executes **closed-loop current derating** to self-heal overheating or voltage sags without interrupting charging, and automates **prepaid session billing with instant partial refunds**.

---

## 🎯 Problem Statement & Engineering Solution

| Traditional EV Chargers | Voltora AI Approach |
| :--- | :--- |
| **Static Thresholds:** Rely on rigid `if temp > 80°C` rules that only trigger *after* hardware degradation begins. | **Multi-Variable Edge ML:** Evaluates Voltage (`V`), Current (`A`), and Core Temperature (`°C`) simultaneously via an unsupervised **Isolation Forest** model to catch subtle drift early. |
| **Binary Failure Mode:** Abruptly trip offline (`FAULT_STOPPED`), stranding EV owners and losing operator revenue. | **Closed-Loop Self-Healing:** Dynamically throttles charging current by **50% (`32A → 16A`)**, cutting resistive heating ($I^2R$) by **75%** so hardware stabilizes while charging continues uninterrupted. |
| **Manual Billing Disputes:** Lack automated reconciliation when vehicles stop charging before exhausting prepaid budgets. | **Atomic Auto-Settlement:** Manages **₹500** prepaid holds at **₹20/kWh**, reconciling energy down to the exact watt-hour and issuing instant unused-balance refunds upon BMS cut-off. |

---

## 🏗️ System Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. OFFLINE ML PIPELINE (Executed Once)                                       │
│    [train_model.py] ──► Trains Isolation Forest on (V, I, T) ──► [.joblib]   │
└──────────────────────────────────────────────────────────────┬───────────────┘
                                                               │ (Loaded in RAM)
                                                               ▼
┌───────────────────────────┐  POST /api/telemetry   ┌─────────────────────────┐
│ 2. EDGE CHARGER NODE      │ ─────────────────────► │ 3. CSMS BACKEND ENGINE  │
│    [simulator.py]         │                        │    [main.py - FastAPI]  │
│    • OCPP-style Telemetry │ ◄───────────────────── │    • Pydantic Validation│
│    • Obeys Current Limits │  JSON Control Command  │    • Isolation Forest ML│
│      (32A ──► 16A Derate) │  (SELF_HEALING + 16A)  │    • Self-Healing Logic │
└───────────────────────────┘                        │    • Billing & Refunds  │
                                                     └────────────┬────────────┘
                                                                  │ SQLAlchemy
                                                                  ▼
┌───────────────────────────┐  GET / DELETE / POST   ┌─────────────────────────┐
│ 5. OPERATOR CONSOLE       │ ◄────────────────────► │ 4. PERSISTENCE LAYER    │
│    [React + Vite + UI]    │  Polls every 2s        │    [ev_monitoring.db]   │
│    • Live Bay Cards       │                        │    • telemetry          │
│    • Multi-Metric Charts  │                        │    • alerts             │
│    • Settlement Ledger    │                        │    • charging_sessions  │
└───────────────────────────┘                        └─────────────────────────┘