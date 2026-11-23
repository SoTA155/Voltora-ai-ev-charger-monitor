import React, { useState, useEffect } from 'react';
import {
  Activity, Zap, ShieldAlert, CheckCircle2, Cpu, AlertTriangle,
  Flame, RefreshCw, Play, Server, TrendingUp, IndianRupee,
  Clock, RotateCcw, StopCircle, Car
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

const API_BASE = 'http://127.0.0.1:8000/api';

export default function App() {
  const [telemetry, setTelemetry] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedCharger, setSelectedCharger] = useState('ALL');
  const [activeMetric, setActiveMetric] = useState('temperature');
  const [isLive, setIsLive] = useState(true);
  const [simulating, setSimulating] = useState(false);

  const fetchData = async () => {
    try {
      const [telRes, alertRes, sessRes] = await Promise.all([
        fetch(`${API_BASE}/telemetry?limit=180`),
        fetch(`${API_BASE}/alerts?limit=20`),
        fetch(`${API_BASE}/sessions?limit=20`)
      ]);
      const telData = await telRes.json();
      const alertData = await alertRes.json();
      const sessData = await sessRes.json();
      setTelemetry(telData.reverse());
      setAlerts(alertData);
      setSessions(sessData);
    } catch (err) {
      console.error('Backend connection error:', err);
    }
  };

  useEffect(() => {
    fetchData();
    if (!isLive) return;
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [isLive]);

  const handleInjectFault = async () => {
    const target = selectedCharger === 'ALL' ? 'EV-STN-01' : selectedCharger;
    setSimulating(true);
    try {
      await fetch(`${API_BASE}/simulate-fault/${target}`, { method: 'POST' });
      await fetchData();
    } finally {
      setTimeout(() => setSimulating(false), 600);
    }
  };

  const handleStartManualSession = async (chargerId) => {
    await fetch(`${API_BASE}/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        charger_id: chargerId,
        vehicle_tag: 'MH-02-DEMO-500',
        prepaid_amount: 500.0,
        tariff_per_kwh: 20.0
      })
    });
    fetchData();
  };

  const handleStopAndRefund = async (sessionId) => {
    await fetch(`${API_BASE}/sessions/${sessionId}/stop`, { method: 'POST' });
    fetchData();
  };

  const handleResolveAlert = async (id) => {
    await fetch(`${API_BASE}/alerts/${id}`, { method: 'DELETE' });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  // Compute latest status & active session per charger
  const chargerIds = ['EV-STN-01', 'EV-STN-02', 'EV-STN-03'];
  const latestByCharger = chargerIds.map((id) => {
    const stationLogs = telemetry.filter((t) => t.charger_id === id);
    const latest = stationLogs[stationLogs.length - 1] || {
      charger_id: id, status: 'Available', voltage: 230, current: 0, temperature: 34, energy_kwh: 0, is_anomaly: 0
    };
    const activeSession = sessions.find((s) => s.charger_id === id && s.status === 'ACTIVE');
    const anomalyCount = stationLogs.filter((t) => t.is_anomaly === 1).length;
    const healthScore = Math.max(42, Math.round(100 - anomalyCount * 4.5 - Math.max(0, latest.temperature - 50) * 1.2));
    return { ...latest, activeSession, healthScore };
  });

  // Filter telemetry for chart
  const chartSource = selectedCharger === 'ALL'
    ? telemetry.filter((t) => t.charger_id === 'EV-STN-01')
    : telemetry.filter((t) => t.charger_id === selectedCharger);

  const formattedChartData = chartSource.slice(-30).map((item) => ({
    time: new Date(item.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
    temperature: item.temperature,
    voltage: item.voltage,
    power_kw: Number(((item.voltage * item.current) / 1000).toFixed(2)),
  }));

  // Financial & Fleet KPIs
  const netRevenue = sessions.reduce((acc, s) => acc + s.actual_cost, 0).toFixed(2);
  const totalRefunded = sessions
    .filter((s) => s.status !== 'ACTIVE')
    .reduce((acc, s) => acc + s.refund_amount, 0)
    .toFixed(2);
  const avgHealth = Math.round(latestByCharger.reduce((acc, c) => acc + c.healthScore, 0) / chargerIds.length);
  const totalPowerKw = latestByCharger.reduce((acc, c) => acc + (c.voltage * c.current) / 1000, 0).toFixed(1);

  const metricConfig = {
    temperature: { label: 'Core Temperature (°C)', color: '#f97316', threshold: 65 },
    voltage: { label: 'Grid Voltage (V)', color: '#38bdf8', threshold: 205 },
    power_kw: { label: 'Active Load (kW)', color: '#10b981', threshold: 9.5 }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">Voltora AI</h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  CSMS + EDGE ML
                </span>
              </div>
              <p className="text-xs text-slate-400">Predictive Hardware Telemetry & Prepaid Auto-Settlement Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleInjectFault}
              disabled={simulating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-95 transition text-sm font-semibold text-white shadow-lg shadow-rose-950/50 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              {simulating ? 'Injecting Fault...' : `Simulate Fault (${selectedCharger === 'ALL' ? 'EV-STN-01' : selectedCharger})`}
            </button>

            <button
              onClick={() => setIsLive(!isLive)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition cursor-pointer ${
                isLive
                  ? 'bg-slate-800 border-emerald-500/40 text-emerald-400'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${isLive ? 'animate-spin' : ''}`} />
              {isLive ? 'Live Stream' : 'Paused'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Executive Financial & Hardware KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <KpiCard
            title="Net Charging Revenue"
            value={`₹${netRevenue}`}
            subtitle="Captured from metered kWh (@ ₹20/kWh)"
            icon={<IndianRupee className="w-5 h-5 text-emerald-400" />}
          />
          <KpiCard
            title="Instant Auto-Refunds"
            value={`₹${totalRefunded}`}
            subtitle="Unused prepaid wallet balance returned"
            icon={<RotateCcw className="w-5 h-5 text-sky-400" />}
          />
          <KpiCard
            title="Fleet AI Health Score"
            value={`${avgHealth}%`}
            subtitle={`${totalPowerKw} kW active grid load`}
            icon={<Activity className="w-5 h-5 text-purple-400" />}
          />
          <KpiCard
            title="Active AI Alerts"
            value={alerts.length}
            subtitle="Pre-failure anomalies isolated"
            icon={<ShieldAlert className="w-5 h-5 text-amber-400" />}
          />
        </div>

        {/* Interactive Charger Hardware & Active Billing Cards */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-slate-400" />
              Live Charger Bays & Active Prepaid Sessions
            </h2>
            {selectedCharger !== 'ALL' && (
              <button
                onClick={() => setSelectedCharger('ALL')}
                className="text-xs text-sky-400 hover:underline cursor-pointer"
              >
                Reset Filter (Viewing {selectedCharger})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {latestByCharger.map((station) => {
              const isSelected = selectedCharger === station.charger_id;
              const isFault = station.is_anomaly === 1 || station.temperature > 65;
              const sess = station.activeSession;
              const budgetPct = sess ? Math.min(100, Math.round((sess.actual_cost / sess.prepaid_amount) * 100)) : 0;

              return (
                <div
                  key={station.charger_id}
                  onClick={() => setSelectedCharger(isSelected ? 'ALL' : station.charger_id)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-900 border-sky-500 ring-2 ring-sky-500/20'
                      : isFault
                      ? 'bg-rose-950/20 border-rose-500/50 hover:border-rose-400'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-lg text-white">{station.charger_id}</h3>
                        <span className="text-xs text-slate-400">OCPP 1.6J • AI Health: {station.healthScore}%</span>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold ${
                          isFault
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                            : sess
                            ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {isFault ? 'FAULT CUTOFF' : sess ? 'CHARGING' : 'AVAILABLE'}
                      </span>
                    </div>

                    {/* Sensor Strip */}
                    <div className="grid grid-cols-3 gap-2 text-center bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 mb-4">
                      <div>
                        <p className="text-[11px] text-slate-400">Voltage</p>
                        <p className="font-semibold text-sm text-sky-300">{station.voltage} V</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-400">Current</p>
                        <p className="font-semibold text-sm text-emerald-300">{station.current} A</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-400">Temp</p>
                        <p className={`font-semibold text-sm ${station.temperature > 60 ? 'text-rose-400' : 'text-amber-300'}`}>
                          {station.temperature}°C
                        </p>
                      </div>
                    </div>

                    {/* Virtual Billing & Session Box */}
                    {sess ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                            <Car className="w-3.5 h-3.5 text-sky-400" />
                            {sess.vehicle_tag}
                          </span>
                          <span className="flex items-center gap-1 text-amber-300 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            {sess.simulated_minutes} mins
                          </span>
                        </div>

                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">
                            Used: <strong className="text-emerald-400">₹{sess.actual_cost.toFixed(2)}</strong> / ₹{sess.prepaid_amount}
                          </span>
                          <span className="text-sky-300 font-medium">
                            Est. Refund: ₹{sess.refund_amount.toFixed(2)}
                          </span>
                        </div>

                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-500"
                            style={{ width: `${budgetPct}%` }}
                          />
                        </div>

                        <button
                          onClick={() => handleStopAndRefund(sess.id)}
                          className="w-full mt-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <StopCircle className="w-3.5 h-3.5 text-amber-400" />
                          Unplug & Auto-Refund ₹{sess.refund_amount.toFixed(0)}
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="p-4 rounded-xl bg-slate-950/50 border border-dashed border-slate-800 text-center space-y-2.5"
                      >
                        <p className="text-xs text-slate-400">Bay ready for vehicle connection</p>
                        <button
                          onClick={() => handleStartManualSession(station.charger_id)}
                          className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition cursor-pointer"
                        >
                          + Start Session (₹500 Prepaid Hold)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Middle Split: Live Telemetry Graph + AI Fault Diagnostics */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Real-Time Sensor Telemetry ({selectedCharger === 'ALL' ? 'EV-STN-01' : selectedCharger})
                </h2>
                <p className="text-xs text-slate-400">Dashed line indicates hardware safety threshold</p>
              </div>

              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                {Object.entries(metricConfig).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setActiveMetric(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                      activeMetric === key
                        ? 'bg-slate-800 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cfg.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formattedChartData}>
                  <defs>
                    <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={metricConfig[activeMetric].color} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={metricConfig[activeMetric].color} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '10px', fontSize: '12px' }}
                  />
                  <ReferenceLine
                    y={metricConfig[activeMetric].threshold}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                  />
                  <Area
                    type="monotone"
                    dataKey={activeMetric}
                    stroke={metricConfig[activeMetric].color}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#metricGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Anomaly Feed */}
          <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-rose-400" />
                AI Fault Predictions
              </h2>
              <span className="text-xs text-slate-400">Triggers safety cutoff & refund</span>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-64 pr-1">
              {alerts.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center border border-dashed border-slate-800 rounded-xl p-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                  <p className="text-sm font-medium text-slate-200">Zero Hardware Anomalies</p>
                  <p className="text-xs text-slate-400 mt-1">All stations operating inside safe ML boundaries.</p>
                </div>
              ) : (
                alerts.map((alert) => {
                  const isCrit = alert.severity === 'CRITICAL';
                  return (
                    <div
                      key={alert.id}
                      className={`p-3.5 rounded-xl border transition ${
                        isCrit
                          ? 'bg-rose-950/30 border-rose-500/40'
                          : 'bg-amber-950/20 border-amber-500/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className={`w-4 h-4 ${isCrit ? 'text-rose-400' : 'text-amber-400'}`} />
                          <span className="font-bold text-sm text-white">{alert.charger_id}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isCrit ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {alert.severity} • {alert.confidence_score}% AI
                          </span>
                        </div>
                        <button
                          onClick={() => handleResolveAlert(alert.id)}
                          className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                        >
                          Resolve
                        </button>
                      </div>
                      <p className="text-xs text-slate-200">{alert.details}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Bottom Section: Virtual Billing & Auto-Refund Settlement Ledger */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <IndianRupee className="w-5 h-5 text-emerald-400" />
                Session Billing & Auto-Refund Settlement Ledger
              </h2>
              <p className="text-xs text-slate-400">
                Real-time reconciliation of prepaid wallet holds (₹500), metered consumption, and instant unused balance refunds
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3">Session</th>
                  <th className="py-3 px-3">Charger / Vehicle</th>
                  <th className="py-3 px-3">Duration</th>
                  <th className="py-3 px-3">Energy</th>
                  <th className="py-3 px-3">Prepaid Hold</th>
                  <th className="py-3 px-3">Final Billed</th>
                  <th className="py-3 px-3">Auto-Refund</th>
                  <th className="py-3 px-3">Status & Settlement Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-3 font-mono text-slate-300">#{s.id}</td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-white">{s.charger_id}</div>
                      <div className="text-slate-400">{s.vehicle_tag}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-200">{s.simulated_minutes} mins</td>
                    <td className="py-3 px-3 text-slate-200">{s.energy_delivered_kwh} kWh</td>
                    <td className="py-3 px-3 font-medium text-slate-300">₹{s.prepaid_amount.toFixed(2)}</td>
                    <td className="py-3 px-3 font-bold text-emerald-400">₹{s.actual_cost.toFixed(2)}</td>
                    <td className="py-3 px-3 font-bold text-sky-400">
                      {s.status === 'ACTIVE' ? `₹${s.refund_amount.toFixed(2)} (Est)` : `₹${s.refund_amount.toFixed(2)}`}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mr-2 ${
                          s.status === 'ACTIVE'
                            ? 'bg-sky-500/20 text-sky-300'
                            : s.status === 'FAULT_STOPPED'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {s.status}
                      </span>
                      <span className="text-slate-400">{s.stop_reason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function KpiCard({ title, value, subtitle, icon }) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-400">{title}</span>
        <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">{icon}</div>
      </div>
      <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
      <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
    </div>
  );
}