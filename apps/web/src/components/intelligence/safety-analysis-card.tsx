'use client';

import * as React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  History,
  Info,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { notify } from '@/components/ui/toaster';
import {
  SAFETY_INTELLIGENCE_DISCLAIMER,
  type SafetyAnalysisResult,
  type SafetyCategory,
  type SafetyRiskLevel,
} from '@/lib/intelligence/types';

export interface SafetyAnalysisCardProps {
  title?: string;
  description?: string;
  analyses?: SafetyAnalysisResult[];
  currentAnalysis: SafetyAnalysisResult | null;
  onSelectAnalysis?: (analysis: SafetyAnalysisResult) => void;
  isAnalyzing: boolean;
  onRunAnalysis: () => Promise<void> | void;
  buttonText?: string;
  canAnalyze?: boolean;
  disabledTooltip?: string;
  targetType?: 'report' | 'incident' | 'evidence' | 'text';
  className?: string;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const CATEGORY_LABEL_MAP: Record<SafetyCategory, string> = {
  THREATS: 'Threats & Physical Violence',
  HARASSMENT: 'Harassment & Persistent Intimidation',
  ABUSIVE_LANGUAGE: 'Abusive Language & Slurs',
  SENSITIVE_INFO: 'Sensitive Personal Information (PII/SPI)',
  REPEATED_ACTIVITY: 'Repeated Pattern & Aggression',
  MULTI_VECTOR: 'Multi-Vector Escalation',
  BENIGN: 'Low-Risk / Benign Communication',
};

export function SafetyAnalysisCard({
  title = 'Safety Intelligence & Threat Assessment',
  description = 'Deterministic rule engine for threat classification, sensitive information leakage, and protective guidance.',
  analyses = [],
  currentAnalysis,
  onSelectAnalysis,
  isAnalyzing,
  onRunAnalysis,
  buttonText = 'Evaluate Safety Risk',
  canAnalyze = true,
  disabledTooltip,
  targetType = 'report',
  className = '',
}: SafetyAnalysisCardProps) {
  const [copiedSummary, setCopiedSummary] = React.useState(false);

  const handleCopySummary = async () => {
    if (!currentAnalysis) return;
    try {
      const text = [
        `SafeSignal Safety Intelligence Assessment:`,
        `Risk Level: ${currentAnalysis.riskLevel} (${currentAnalysis.category})`,
        `Score: ${currentAnalysis.overallScore}/100`,
        `Summary: ${currentAnalysis.summary}`,
        ``,
        `Indicators Detected (${currentAnalysis.indicators.length}):`,
        ...currentAnalysis.indicators.map(
          (i) => `- [${i.severity}] ${i.title}: ${i.explanation}`,
        ),
        ``,
        `Suggested Actions:`,
        ...currentAnalysis.suggestedActions.map((a) => `- ${a}`),
        ``,
        `Disclaimer: ${currentAnalysis.disclaimer || SAFETY_INTELLIGENCE_DISCLAIMER}`,
      ].join('\n');

      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      notify.verified('Assessment summary copied to clipboard.');
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      notify.alert('Failed to copy assessment summary.');
    }
  };

  const hasCrossReportRepetition = currentAnalysis?.indicators.some(
    (ind) =>
      ind.id === 'INCIDENT_CROSS_REPORT_REPETITION' ||
      ind.category === 'REPEATED_ACTIVITY' ||
      ind.title.toLowerCase().includes('cross-report'),
  );

  return (
    <Card className={`border-slate-200 bg-white ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                currentAnalysis
                  ? currentAnalysis.riskLevel === 'HIGH'
                    ? 'bg-rose-100 text-rose-700'
                    : currentAnalysis.riskLevel === 'MEDIUM'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {currentAnalysis ? (
                currentAnalysis.riskLevel === 'HIGH' ? (
                  <ShieldAlert className="h-4 w-4" />
                ) : currentAnalysis.riskLevel === 'MEDIUM' ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )
              ) : (
                <Shield className="h-4 w-4" />
              )}
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">
                {title}
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                {description}
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Analysis History Dropdown */}
            {analyses.length > 1 && onSelectAnalysis && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <History className="h-3.5 w-3.5 text-slate-400" />
                <select
                  value={currentAnalysis?.id || ''}
                  onChange={(e) => {
                    const found = analyses.find((a) => a.id === e.target.value);
                    if (found) onSelectAnalysis(found);
                  }}
                  className="h-8 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 shadow-2xs focus:outline-none"
                  aria-label="Select previous analysis run"
                >
                  {analyses.map((a, idx) => (
                    <option key={a.id || idx} value={a.id || ''}>
                      Run #{analyses.length - idx}: {a.riskLevel} (
                      {formatDate(a.analyzedAt || a.createdAt)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button
              variant={currentAnalysis ? 'outline' : 'default'}
              size="sm"
              onClick={() => onRunAnalysis()}
              disabled={isAnalyzing || !canAnalyze}
              title={!canAnalyze ? disabledTooltip : undefined}
              className={`h-8 gap-1.5 text-xs font-semibold ${
                !currentAnalysis
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              {isAnalyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : currentAnalysis ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>{isAnalyzing ? 'Evaluating...' : buttonText}</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* EMPTY STATE */}
        {!currentAnalysis && !isAnalyzing && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
            <Shield className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">
              No Safety Intelligence evaluation recorded yet
            </p>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Run the deterministic rule engine to detect threat language, harassment patterns,
              sensitive personal data (emails, phones, physical addresses, Aadhaar/PAN), and cross-report repetition.
            </p>
            <Button
              size="sm"
              onClick={() => onRunAnalysis()}
              disabled={!canAnalyze}
              className="mt-4 gap-1.5 bg-blue-600 text-white hover:bg-blue-700 text-xs font-semibold"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{buttonText}</span>
            </Button>
          </div>
        )}

        {/* LOADING STATE */}
        {isAnalyzing && !currentAnalysis && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-slate-100 bg-slate-50 p-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <p className="mt-2 text-xs font-semibold text-slate-700">
              Running Safety Intelligence Rule Engine...
            </p>
            <p className="text-[11px] text-slate-400">
              Scanning for threats, abusive language, privacy identifiers, and cross-incident patterns.
            </p>
          </div>
        )}

        {/* ACTIVE ANALYSIS RESULTS */}
        {currentAnalysis && (
          <div className="space-y-4">
            {/* HERO SCORE & CLASSIFICATION */}
            <div
              className={`rounded-lg border p-4 ${
                currentAnalysis.riskLevel === 'HIGH'
                  ? 'border-rose-200 bg-rose-50/50'
                  : currentAnalysis.riskLevel === 'MEDIUM'
                    ? 'border-amber-200 bg-amber-50/50'
                    : 'border-emerald-200 bg-emerald-50/50'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-sm font-bold tracking-tight ${
                        currentAnalysis.riskLevel === 'HIGH'
                          ? 'text-rose-900'
                          : currentAnalysis.riskLevel === 'MEDIUM'
                            ? 'text-amber-900'
                            : 'text-emerald-900'
                      }`}
                    >
                      {currentAnalysis.riskLevel} SAFETY RISK
                    </span>
                    <Badge
                      variant="neutral"
                      className={`text-[11px] font-bold ${
                        currentAnalysis.riskLevel === 'HIGH'
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : currentAnalysis.riskLevel === 'MEDIUM'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}
                    >
                      {CATEGORY_LABEL_MAP[currentAnalysis.category] ??
                        currentAnalysis.category}
                    </Badge>
                    <Badge
                      variant="neutral"
                      className="border-slate-300 bg-white text-[11px] font-semibold text-slate-700"
                    >
                      Score: {currentAnalysis.overallScore}/100
                    </Badge>
                    {hasCrossReportRepetition && (
                      <Badge
                        variant="alert"
                        className="text-[11px] font-bold border-rose-400 bg-rose-600 text-white animate-pulse"
                      >
                        Cross-Report Repetition Detected
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs font-medium text-slate-800 leading-relaxed pt-1">
                    {currentAnalysis.summary}
                  </p>
                </div>

                <div className="text-right text-[11px] text-slate-500 space-y-1">
                  <div className="flex items-center gap-1 text-slate-400 justify-end">
                    <Clock className="h-3 w-3" />
                    <span>
                      Analyzed{' '}
                      {formatDate(
                        currentAnalysis.analyzedAt || currentAnalysis.createdAt,
                      )}
                    </span>
                  </div>
                  {analyses.length > 1 && (
                    <span className="block text-slate-400">
                      {analyses.length} total evaluations recorded
                    </span>
                  )}
                </div>
              </div>

              {currentAnalysis.secondaryCategories?.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-200/60 pt-2.5 text-xs text-slate-600">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Secondary Vectors:
                  </span>
                  {currentAnalysis.secondaryCategories.map((sec) => (
                    <Badge
                      key={sec}
                      variant="neutral"
                      className="bg-white border-slate-200 text-slate-600 text-[10px]"
                    >
                      {CATEGORY_LABEL_MAP[sec] ?? sec}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* DETECTED INDICATORS */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-slate-500" />
                  <span>
                    Detected Threat & Risk Indicators (
                    {currentAnalysis.indicators.length})
                  </span>
                </h4>
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
                >
                  {copiedSummary ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      <span className="text-emerald-600 font-semibold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy Summary</span>
                    </>
                  )}
                </button>
              </div>

              {currentAnalysis.indicators.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    No immediate threats, violent slurs, repetitive harassment, or sensitive PII detected.
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {currentAnalysis.indicators.map((ind) => {
                    const isCrossReport =
                      ind.id === 'INCIDENT_CROSS_REPORT_REPETITION' ||
                      ind.category === 'REPEATED_ACTIVITY';

                    return (
                      <div
                        key={ind.id}
                        className={`rounded-lg border p-3 space-y-1.5 text-xs ${
                          isCrossReport
                            ? 'border-rose-300 bg-rose-50/70'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="neutral"
                              className={`text-[10px] font-bold ${
                                ind.severity === 'HIGH'
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : ind.severity === 'MEDIUM'
                                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                                    : 'bg-slate-200 text-slate-800 border-slate-300'
                              }`}
                            >
                              {ind.severity}
                            </Badge>
                            <span className="font-semibold text-slate-900">
                              {ind.title}
                            </span>
                            {isCrossReport && (
                              <Badge
                                variant="alert"
                                className="text-[10px] font-bold border-rose-300 bg-rose-100 text-rose-800"
                              >
                                Incident Multi-Report Repetition
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {ind.occurrences} match(es)
                          </span>
                        </div>

                        <p className="text-slate-700 leading-relaxed">
                          {ind.explanation}
                        </p>

                        {ind.matchedTerms?.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 pt-1">
                            <span className="text-[11px] font-semibold text-slate-500 mr-1">
                              Matched Cues:
                            </span>
                            {ind.matchedTerms.map((term, i) => (
                              <span
                                key={i}
                                className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-800"
                              >
                                &quot;{term}&quot;
                              </span>
                            ))}
                          </div>
                        )}

                        {ind.snippet && (
                          <p className="mt-1 rounded border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">
                            {ind.snippet}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RECOMMENDED ACTIONS */}
            {currentAnalysis.suggestedActions?.length > 0 && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Recommended Protective Actions</span>
                </h4>
                <ul className="space-y-1.5">
                  {currentAnalysis.suggestedActions.map((action, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs text-slate-800 leading-relaxed"
                    >
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-blue-600 mt-0.5" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* MANDATORY LEGAL & EVIDENTIARY DISCLAIMER */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs">
              <div className="flex items-start gap-2.5">
                <Info className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
                <div>
                  <h5 className="font-semibold text-amber-900 text-[11px] uppercase tracking-wider">
                    Legal & Evidentiary Disclaimer
                  </h5>
                  <p className="mt-0.5 text-amber-800 leading-relaxed text-[11px]">
                    {currentAnalysis.disclaimer || SAFETY_INTELLIGENCE_DISCLAIMER}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
