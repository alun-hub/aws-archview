import type { GraphModel, LzaConfigs, ViewKind } from '../parser'
import type { AccountIndex } from './accountResolver'

export type Severity = 'error' | 'warning' | 'info'

export const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

export interface Finding {
  /** Stable within one analysis run — used as a React key and nothing else. */
  id: string
  ruleId: string
  severity: Severity
  /** One short line, e.g. "Overlapping VPC CIDRs". */
  title: string
  /** One concrete sentence naming the objects involved. */
  detail: string
  /** Which view to switch to when the user clicks through to the finding. */
  view: ViewKind
  /** Graph node ids this finding points at; the first one gets selected. */
  nodeIds: string[]
  /** Which config file the problem lives in, for findings with no node. */
  configFile?: string
}

export type RuleFinding = Omit<Finding, 'id'>

/** What validation is given to work with. Everything but `configs` is
 *  optional so a caller with only parsed configs — a test, or a future CLI —
 *  still gets every rule that doesn't need the raw text. */
export interface ValidationInput {
  configs: LzaConfigs
  /** Raw file contents, for checks that work on text rather than parsed YAML. */
  loadedFiles?: Record<string, string>
  /** Per-file YAML parse failures, keyed by filename, from the config store. */
  parseErrors?: Record<string, string>
}

export interface AnalysisContext {
  configs: LzaConfigs
  loadedFiles: Record<string, string>
  parseErrors: Record<string, string>
  accounts: AccountIndex
}

export interface Rule {
  id: string
  /** Shown in the panel when grouping findings; keep it a noun phrase. */
  title: string
  run(ctx: AnalysisContext): RuleFinding[]
}

/** Graphs aren't part of the context: rules read configs and mint node ids via
 *  `parser/nodeIds`, so validation stays cheap and runs even for a view whose
 *  graph failed to build. */
export type { GraphModel }
