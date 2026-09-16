import React, { useState } from 'react';
import { Sparkles, Brain, AlertTriangle, Lightbulb, Target, RefreshCw, X, Check, Cpu, Activity, ShieldAlert, Zap, Layers } from 'lucide-react';
import { Button } from './ui/Button';
import { Card, CardBody } from './ui/Card';
import { Badge } from './ui/Badge';
import { apiUrl } from '../utils/api';

export interface EdgeItem {
  title: string;
  description: string;
  impact?: 'POSITIVE' | 'NEUTRAL';
}

export interface PsychologyLeakItem {
  leakType: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  detail: string;
  evidence: string;
}

export interface ActionableRuleItem {
  step: number;
  rule: string;
  reason: string;
}

export interface AiStructuredReport {
  disciplineScore: number;
  riskRating: 'LOW' | 'MODERATE' | 'HIGH';
  primaryPsychologyState: 'FOMO' | 'TILT' | 'CALM' | 'REVENGE_TRADING' | 'OVERCONFIDENT' | string;
  summaryVerdict: string;
  edgeDiagnosis: EdgeItem[];
  psychologyLeaks: PsychologyLeakItem[];
  actionableRules: ActionableRuleItem[];
}

interface AiAdvisorAuditProps {
  sessionId?: string;
  tradeId?: string;
  type: 'SESSION' | 'TRADE';
  title?: string;
}

export default function AiAdvisorAudit({ sessionId, tradeId, type, title }: AiAdvisorAuditProps) {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<AiStructuredReport | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [modelInput, setModelInput] = useState('ag/gemini-3.7-flash-low');

  const [language, setLanguage] = useState<'id' | 'en'>('id');

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = type === 'SESSION'
        ? apiUrl(`/ai/analyze-session/${sessionId}`)
        : apiUrl(`/ai/analyze-trade/${tradeId}`);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language })
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to generate AI analysis');
      }

      setReportData(json.data);
      if (json.meta?.modelUsed) {
        setModelUsed(json.meta.modelUsed);
      }
    } catch (err: any) {
      setError(err.message || 'Error communicating with 9Router LLM backend');
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async () => {
    try {
      const res = await fetch(apiUrl('/ai/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelInput })
      });
      const data = await res.json();
      if (data.ok) {
        setShowConfig(false);
        runAnalysis();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getRiskBadgeColor = (risk?: string) => {
    switch (risk) {
      case 'HIGH': return 'bg-[#FFF0F0] text-[#D02020] border-[#D02020]';
      case 'MODERATE': return 'bg-[#FFFBEB] text-[#D97706] border-[#D97706]';
      case 'LOW': return 'bg-[#F0FDF4] text-[#16A34A] border-[#16A34A]';
      default: return 'bg-[#F0F0F0] text-[#121212] border-[#121212]';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return <Badge variant="loss" className="text-[10px] font-black uppercase">CRITICAL</Badge>;
      case 'WARNING': return <Badge variant="yellow" className="text-[10px] font-black uppercase">WARNING</Badge>;
      default: return <Badge variant="neutral" className="text-[10px] font-black uppercase">INFO</Badge>;
    }
  };

  return (
    <Card className="border-2 border-[#121212] bg-white shadow-[4px_4px_0px_0px_#121212] my-4 overflow-hidden">
      {/* Header */}
      <div className="bg-[#121212] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#121212]">
        <div className="flex items-center gap-2 min-w-0">
          <Brain className="w-5 h-5 text-[#FFD000] shrink-0" />
          <div>
            <h3 className="font-extrabold text-sm uppercase tracking-wider font-display truncate">
              {title || (type === 'SESSION' ? '✨ MurplyFX AI — Trading Performance & Behavioral Intelligence' : '✨ MurplyFX AI — Single Trade Execution Audit')}
            </h3>
            <div className="text-[10px] text-[#A0A0A0] font-mono tracking-tight font-medium">
              Grounded in your actual execution data • No signals • Pure quant & psychology audit
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Language Selector Toggle */}
          <div className="flex border-2 border-[#333] overflow-hidden bg-[#242424] text-[10px] font-black font-mono">
            <button
              onClick={() => setLanguage('id')}
              className={`px-2 py-0.5 transition-colors ${language === 'id' ? 'bg-[#FFD000] text-[#121212]' : 'text-[#A0A0A0] hover:text-white'}`}
            >
              🇮🇩 ID
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`px-2 py-0.5 transition-colors ${language === 'en' ? 'bg-[#FFD000] text-[#121212]' : 'text-[#A0A0A0] hover:text-white'}`}
            >
              🇬🇧 EN
            </button>
          </div>

          {modelUsed && (
            <Badge variant="neutral" className="bg-[#242424] text-[#FFD000] border-none text-[10px] font-mono hidden sm:inline-flex">
              <Cpu className="w-3 h-3 inline mr-1" /> {modelUsed}
            </Badge>
          )}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="text-[#A0A0A0] hover:text-white text-xs font-mono underline"
          >
            Config
          </button>
        </div>
      </div>

      <CardBody className="p-4 space-y-4">
        {showConfig && (
          <div className="bg-[#F8F9FA] border-2 border-[#121212] p-3 rounded-lg space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-[#121212]">Model Config (Local 9Router)</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                placeholder="e.g. ag/gemini-3.7-flash-low"
                className="text-xs font-mono p-2 border-2 border-[#121212] flex-1"
              />
              <Button size="sm" variant="yellow" onClick={updateConfig}>Save & Re-run</Button>
            </div>
          </div>
        )}

        {!reportData && !loading && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-[#F8F9FA] border-2 border-dashed border-[#121212]/30 rounded-lg">
            <div className="space-y-1 text-center sm:text-left">
              <h4 className="font-bold text-sm text-[#121212]">Generasikan Audit Kinerja & Evaluasi Perilaku Trading</h4>
              <p className="text-xs text-[#717182]">
                "Your trades already contain the information. MurplyFX AI helps you find it." — Grounded in deterministic execution metrics.
              </p>
            </div>
            <Button
              variant="yellow"
              className="font-black text-xs uppercase tracking-wider whitespace-nowrap shrink-0 shadow-[2px_2px_0px_0px_#121212]"
              onClick={runAnalysis}
              disabled={type === 'SESSION' ? !sessionId : !tradeId}
            >
              <Sparkles className="w-4 h-4 mr-1.5" /> Jalankan AI Audit
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center p-8 bg-[#F8F9FA] border-2 border-[#121212] space-y-3">
            <RefreshCw className="w-8 h-8 text-[#1040C0] animate-spin" />
            <div className="text-xs font-bold uppercase tracking-widest text-[#121212]">
              Sedang menganalisis matriks sesi & mendeteksi pola psikologi...
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-[#FFF0F0] border-2 border-[#D02020] text-[#D02020] text-xs font-bold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button size="sm" variant="danger" onClick={runAnalysis}>Coba Lagi</Button>
          </div>
        )}

        {reportData && !loading && (
          <div className="space-y-6 animate-fade-in">
            {/* 1. DISCIPLINE & PSYCHOLOGY METER STRIP */}
            <div className="bg-[#F8F9FA] border-2 border-[#121212] p-4 shadow-[2px_2px_0px_0px_#121212] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#121212]/10 pb-3">
                <div className="space-y-0.5">
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#717182]">Executive Summary</div>
                  <div className="text-sm font-extrabold text-[#121212] font-display">{reportData.summaryVerdict}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className={`px-2.5 py-1 border-2 text-xs font-black uppercase tracking-wider rounded-md ${getRiskBadgeColor(reportData.riskRating)}`}>
                    Risk: {reportData.riskRating || 'MODERATE'}
                  </div>
                  <div className="px-2.5 py-1 bg-[#121212] text-white border-2 border-[#121212] text-xs font-black uppercase tracking-wider rounded-md">
                    State: {reportData.primaryPsychologyState || 'CALM'}
                  </div>
                </div>
              </div>

              {/* Progress Gauge */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
                  <span className="text-[#121212] flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-[#1040C0]" /> Discipline & Rules Adherence Score
                  </span>
                  <span className="font-extrabold font-mono text-sm text-[#121212]">{reportData.disciplineScore || 0}%</span>
                </div>
                <div className="w-full bg-[#E2E8F0] h-3 border-2 border-[#121212] rounded-none overflow-hidden p-0.5 flex">
                  <div
                    className={`h-full transition-all duration-500 ${
                      (reportData.disciplineScore || 0) >= 80 ? 'bg-[#10B981]' : (reportData.disciplineScore || 0) >= 50 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, reportData.disciplineScore || 0))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 2. INFOGRAPHIC THREE CARDS GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* CARD 1: EDGE DIAGNOSIS */}
              <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#10B981] space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b-2 border-[#121212] pb-2">
                    <Target className="w-5 h-5 text-[#10B981]" />
                    <h4 className="font-black text-xs uppercase tracking-wider text-[#121212] font-display">
                      🚀 Superpower & Kelebihan Eksekusi
                    </h4>
                  </div>

                  {reportData.edgeDiagnosis && reportData.edgeDiagnosis.length > 0 ? (
                    <div className="space-y-3">
                      {reportData.edgeDiagnosis.map((item, idx) => (
                        <div key={idx} className="bg-[#F8F9FA] border-2 border-[#121212] p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-[#121212]">{item.title}</span>
                            <Badge variant={item.impact === 'POSITIVE' ? 'profit' : 'neutral'} className="text-[9px]">
                              {item.impact || 'POSITIVE'}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-[#4A5568] font-medium leading-normal">{item.description}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#717182] italic">Belum ada diagnosa superpower spesifik.</p>
                  )}
                </div>
              </div>

              {/* CARD 2: PSYCHOLOGY & RISK LEAKS */}
              <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#EF4444] space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b-2 border-[#121212] pb-2">
                    <ShieldAlert className="w-5 h-5 text-[#EF4444]" />
                    <h4 className="font-black text-xs uppercase tracking-wider text-[#121212] font-display">
                      💀 Borok & Mental Leaks (Roasted)
                    </h4>
                  </div>

                  {reportData.psychologyLeaks && reportData.psychologyLeaks.length > 0 ? (
                    <div className="space-y-3">
                      {reportData.psychologyLeaks.map((leak, idx) => (
                        <div key={idx} className="bg-[#FFF0F0] border-2 border-[#121212] p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-xs text-[#D02020]">{leak.leakType}</span>
                            {getSeverityBadge(leak.severity)}
                          </div>
                          <p className="text-[11px] text-[#121212] font-medium leading-normal">{leak.detail}</p>
                          {leak.evidence && (
                            <div className="bg-white border border-[#121212] p-1.5 text-[10px] font-mono text-[#717182]">
                              💡 <b>Bukti:</b> {leak.evidence}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#717182] italic">Tidak ditemukan borok mental signifikan.</p>
                  )}
                </div>
              </div>

              {/* CARD 3: ACTIONABLE EXECUTION PROTOCOL */}
              <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#1040C0] space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b-2 border-[#121212] pb-2">
                    <Zap className="w-5 h-5 text-[#1040C0]" />
                    <h4 className="font-black text-xs uppercase tracking-wider text-[#121212] font-display">
                      ⚔️ Doktrin & Protokol Wajib
                    </h4>
                  </div>

                  {reportData.actionableRules && reportData.actionableRules.length > 0 ? (
                    <div className="space-y-2.5">
                      {reportData.actionableRules.map((ruleObj, idx) => (
                        <div key={idx} className="flex gap-2 bg-[#F8F9FA] border-2 border-[#121212] p-2.5">
                          <div className="w-5 h-5 rounded-none bg-[#121212] text-white flex items-center justify-center text-xs font-black shrink-0 font-mono">
                            {ruleObj.step || idx + 1}
                          </div>
                          <div className="space-y-0.5">
                            <div className="font-bold text-xs text-[#121212]">{ruleObj.rule}</div>
                            {ruleObj.reason && (
                              <div className="text-[10px] text-[#717182] font-medium leading-tight">{ruleObj.reason}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#717182] italic">Belum ada aturan tindakan spesifik.</p>
                  )}
                </div>
              </div>

            </div>

            {/* CARD FOOTER ACTIONS */}
            <div className="flex justify-end gap-2 pt-2 border-t border-[#121212]/10">
              <Button size="sm" variant="ghost" className="text-xs font-bold" onClick={runAnalysis}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Re-Analyze
              </Button>
              <Button size="sm" variant="dark" className="text-xs font-bold" onClick={() => setReportData(null)}>
                Tutup Report
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
