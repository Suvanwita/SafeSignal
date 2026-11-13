'use client';

import * as React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  FileCode,
  FileText,
  FolderLock,
  History,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
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
import { ConfirmDialog } from '@/components/ui/dialog';
import { notify } from '@/components/ui/toaster';
import {
  analyzeIncidentSafety,
  analyzeSafetyText,
  deleteSafetyAnalysis,
  fetchSafetyAnalyses,
} from '@/lib/intelligence/client-intelligence';
import {
  SAFETY_INTELLIGENCE_DISCLAIMER,
  type SafetyAnalysisResult,
  type SafetyIndicator,
  type SafetyRiskLevel,
} from '@/lib/intelligence/types';

export interface SafetyIntelligenceViewProps {
  incidents?: { id: string; title: string; status: string }[];
}

const EXAMPLE_THREAT =
  'I know where you live at Flat 402, 5th Cross Road. Pay me $500 or I will slit your throat and leak your private photos to everyone!';
const EXAMPLE_HARASSMENT =
  'Stop ignoring me! Why are you running? Answer me right now! You cannot hide from me, I will never leave you alone!';
const EXAMPLE_DOXXING =
  'Keep talking and I will drop your home address and post your phone number 9876543210 and Aadhaar 2345 6789 0123 for everyone to see.';

export function SafetyIntelligenceView({
  incidents = [],
}: SafetyIntelligenceViewProps) {
  const [inputText, setInputText] = React.useState('');
  const [selectedIncidentId, setSelectedIncidentId] = React.useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [currentResult, setCurrentResult] =
    React.useState<SafetyAnalysisResult | null>(null);

  const [pastAnalyses, setPastAnalyses] = React.useState<SafetyAnalysisResult[]>(
    [],
  );
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = React.useState(false);

  const loadHistory = React.useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const list = await fetchSafetyAnalyses();
      setPastAnalyses(list);
    } catch {
      // non-fatal
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRunTextAnalysis = async () => {
    if (!inputText.trim()) {
      notify.alert('Please enter or paste communication text to analyze.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await analyzeSafetyText({
        text: inputText.trim(),
        incidentId: selectedIncidentId || undefined,
        persist: true,
      });
      setCurrentResult(res);
      notify.verified(`Safety analysis complete: ${res.riskLevel} Risk (${res.category}).`);
      loadHistory();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Safety analysis failed.';
      notify.alert(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRunIncidentAnalysis = async (incidentId: string) => {
    setIsAnalyzing(true);
    try {
      const res = await analyzeIncidentSafety(incidentId);
      setCurrentResult(res);
      notify.verified(
        `Case safety intelligence complete: ${res.riskLevel} Risk.`,
      );
      loadHistory();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Incident analysis failed.';
      notify.alert(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeleteAnalysis = async () => {
    if (!deletingId) return;
    try {
      await deleteSafetyAnalysis(deletingId);
      notify.verified('Analysis record removed.');
      if (currentResult?.id === deletingId) {
        setCurrentResult(null);
      }
      loadHistory();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to delete record.';
      notify.alert(msg);
    } finally {
      setDeletingId(null);
      setIsConfirmDeleteOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* SCANNER INPUT CARD */}
      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg font-bold text-slate-900">
                Rule-Based Safety Intelligence Scanner
              </CardTitle>
            </div>
            <Badge
              variant="neutral"
              className="border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold"
            >
              Deterministic Rule Engine (No External AI)
            </Badge>
          </div>
          <CardDescription className="text-xs text-slate-500">
            Paste suspicious communications, threatening messages, or extortion
            notes to evaluate threat severity, harassment indicators, sensitive
            information exposure, and repeated activity patterns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <textarea
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste threatening messages, abusive comments, extortion demands, or communication text here..."
              className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
          </div>

          {/* QUICK EXAMPLES & INCIDENT SELECTOR */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="font-semibold text-slate-600">Sample Inputs:</span>
              <button
                type="button"
                onClick={() => setInputText(EXAMPLE_THREAT)}
                className="rounded border border-slate-200 px-2 py-0.5 text-slate-700 hover:bg-slate-100"
              >
                Violence & Extortion
              </button>
              <button
                type="button"
                onClick={() => setInputText(EXAMPLE_HARASSMENT)}
                className="rounded border border-slate-200 px-2 py-0.5 text-slate-700 hover:bg-slate-100"
              >
                Harassment Pressure
              </button>
              <button
                type="button"
                onClick={() => setInputText(EXAMPLE_DOXXING)}
                className="rounded border border-slate-200 px-2 py-0.5 text-slate-700 hover:bg-slate-100"
              >
                Doxxing & SPI
              </button>
              {inputText && (
                <button
                  type="button"
                  onClick={() => setInputText('')}
                  className="text-slate-400 hover:text-slate-600 underline ml-1"
                >
                  Clear
                </button>
              )}
            </div>

            {/* ASSOCIATE WITH INCIDENT */}
            {incidents.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Link to Case:</span>
                <select
                  value={selectedIncidentId}
                  onChange={(e) => setSelectedIncidentId(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                >
                  <option value="">No Incident (Standalone)</option>
                  {incidents.map((inc) => (
                    <option key={inc.id} value={inc.id}>
                      {inc.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-400">
              {inputText.length} characters •{' '}
              {inputText.trim() ? inputText.trim().split(/\s+/).length : 0} words
            </span>
            <Button
              onClick={handleRunTextAnalysis}
              disabled={isAnalyzing || !inputText.trim()}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-700 font-semibold text-xs"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>Evaluate Safety Risk</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* CASE-LEVEL ANALYSIS SHORTCUT */}
      {incidents.length > 0 && (
        <Card className="border-slate-200 bg-slate-50/60">
          <CardContent className="py-3 px-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-600" />
              <span className="font-semibold text-slate-800">
                Case-Level Safety Intelligence:
              </span>
              <span className="text-slate-500">
                Aggregate all abuse reports, profiles, and evidence in an incident case.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                id="case-select"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                defaultValue={incidents[0]?.id}
              >
                {incidents.map((inc) => (
                  <option key={inc.id} value={inc.id}>
                    {inc.title}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const el = document.getElementById(
                    'case-select',
                  ) as HTMLSelectElement | null;
                  if (el?.value) {
                    handleRunIncidentAnalysis(el.value);
                  }
                }}
                disabled={isAnalyzing}
                className="h-7 text-xs font-semibold text-purple-700 border-purple-200 hover:bg-purple-50"
              >
                Analyze Incident Case
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ANALYSIS RESULT DISPLAY */}
      {currentResult && (
        <div className="space-y-4">
          {/* RESULT HERO CARD */}
          <Card
            className={`border-2 ${
              currentResult.riskLevel === 'HIGH'
                ? 'border-rose-300 bg-rose-50/40'
                : currentResult.riskLevel === 'MEDIUM'
                  ? 'border-amber-300 bg-amber-50/40'
                  : 'border-emerald-300 bg-emerald-50/40'
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                      currentResult.riskLevel === 'HIGH'
                        ? 'bg-rose-100 text-rose-700'
                        : currentResult.riskLevel === 'MEDIUM'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {currentResult.riskLevel === 'HIGH' ? (
                      <ShieldAlert className="h-6 w-6" />
                    ) : currentResult.riskLevel === 'MEDIUM' ? (
                      <AlertTriangle className="h-6 w-6" />
                    ) : (
                      <ShieldCheck className="h-6 w-6" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl font-bold text-slate-900">
                        {currentResult.riskLevel} SAFETY RISK
                      </CardTitle>
                      <Badge
                        variant="neutral"
                        className={`text-xs font-bold ${
                          currentResult.riskLevel === 'HIGH'
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : currentResult.riskLevel === 'MEDIUM'
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}
                      >
                        {currentResult.category}
                      </Badge>
                      <Badge
                        variant="neutral"
                        className="border-slate-200 bg-white text-xs font-semibold text-slate-700"
                      >
                        Score: {currentResult.overallScore}/100
                      </Badge>
                    </div>
                    <CardDescription className="mt-1 text-sm text-slate-700 font-medium">
                      {currentResult.summary}
                    </CardDescription>
                  </div>
                </div>

                {currentResult.secondaryCategories?.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span>Secondary:</span>
                    {currentResult.secondaryCategories.map((c) => (
                      <Badge
                        key={c}
                        variant="neutral"
                        className="bg-white border-slate-200 text-slate-600 text-[11px]"
                      >
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>
          </Card>

          {/* DETECTED INDICATORS LIST */}
          <Card className="border-slate-200 bg-white">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-slate-600" />
                <CardTitle className="text-base font-semibold text-slate-900">
                  Detected Threat & Risk Indicators (
                  {currentResult.indicators.length})
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-slate-500">
                Pattern matching triggers identified by deterministic rule
                dictionaries.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentResult.indicators.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>
                    No threats, abusive slurs, harassment phrases, or sensitive
                    data patterns detected.
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentResult.indicators.map((ind) => (
                    <div
                      key={ind.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="neutral"
                            className={`text-[11px] font-bold ${
                              ind.severity === 'HIGH'
                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                : ind.severity === 'MEDIUM'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-slate-200 text-slate-800 border-slate-300'
                            }`}
                          >
                            {ind.severity}
                          </Badge>
                          <span className="text-xs font-semibold text-slate-900">
                            {ind.title}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {ind.occurrences} match(es)
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed">
                        {ind.explanation}
                      </p>

                      {ind.matchedTerms?.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[11px] font-semibold text-slate-500">
                            Matched Cues:
                          </span>
                          {ind.matchedTerms.map((term, i) => (
                            <span
                              key={i}
                              className="rounded bg-slate-200/80 px-2 py-0.5 font-mono text-[11px] text-slate-800"
                            >
                              &quot;{term}&quot;
                            </span>
                          ))}
                        </div>
                      )}

                      {ind.snippet && (
                        <p className="mt-1 text-[11px] text-slate-500 font-mono bg-white p-2 rounded border border-slate-200">
                          {ind.snippet}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* SUGGESTED SAFETY ACTIONS */}
          <Card className="border-slate-200 bg-white">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <CardTitle className="text-base font-semibold text-slate-900">
                  Recommended Protective Actions
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-slate-500">
                Actionable safety steps tailored to the detected risk level and
                threat categories.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {currentResult.suggestedActions.map((action, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-xs text-slate-800"
                  >
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-blue-600 mt-0.5" />
                    <span className="leading-relaxed">{action}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* MANDATORY LEGAL & EVIDENTIARY DISCLAIMER */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Legal & Evidentiary Notice
                </h4>
                <p className="mt-1 text-xs text-amber-900 leading-relaxed">
                  {currentResult.disclaimer || SAFETY_INTELLIGENCE_DISCLAIMER}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAST ANALYSES HISTORY TABLE */}
      <Card className="border-slate-200 bg-white">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base font-semibold text-slate-900">
                Safety Analysis History ({pastAnalyses.length})
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Stored PostgreSQL safety evaluations and chain-of-custody triage
              records.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadHistory}
            disabled={isLoadingHistory}
            className="h-8 gap-1.5 text-xs text-slate-700"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`}
            />
            <span>Refresh</span>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingHistory && pastAnalyses.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading history...
            </div>
          ) : pastAnalyses.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400 italic border rounded-lg border-slate-100">
              No safety intelligence evaluations recorded yet. Run a scan above to
              save analysis records.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                    <th className="py-2.5 px-3 font-semibold">Risk Level</th>
                    <th className="py-2.5 px-3 font-semibold">Category</th>
                    <th className="py-2.5 px-3 font-semibold">Summary</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pastAnalyses.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleDateString(
                              undefined,
                              {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              },
                            )
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="neutral"
                          className={`text-[11px] font-bold ${
                            item.riskLevel === 'HIGH'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : item.riskLevel === 'MEDIUM'
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          }`}
                        >
                          {item.riskLevel}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="neutral"
                          className="bg-slate-100 text-slate-700 border-slate-200 text-[11px]"
                        >
                          {item.category}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 truncate max-w-[280px]">
                        {item.summary}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCurrentResult(item)}
                            className="h-7 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          >
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (item.id) {
                                setDeletingId(item.id);
                                setIsConfirmDeleteOpen(true);
                              }
                            }}
                            className="h-7 px-2 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CONFIRM DELETE DIALOG */}
      <ConfirmDialog
        open={isConfirmDeleteOpen}
        onOpenChange={setIsConfirmDeleteOpen}
        onConfirm={handleDeleteAnalysis}
        title="Delete Safety Analysis"
        description="Are you sure you want to delete this safety analysis record from PostgreSQL? This action cannot be undone."
        confirmLabel="Delete Record"
        variant="destructive"
      />
    </div>
  );
}
