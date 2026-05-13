/**
 * Workflow definition types — static data only, no runtime.
 *
 * These descriptions will be consumed by a future Agent Farm orchestrator
 * (built around the `vercel:workflow` skill / WDK) that turns each
 * `WorkflowDefinition` into a durable, step-based execution pipeline.
 */

/**
 * A single step in a workflow.
 *
 * Each step nominates an `action` describing what to invoke:
 *  - `tool`  → an existing dashboard tool (id from `toolsRegistry.ts`)
 *  - `route` → a BFF HTTP endpoint (`method` + `path` + optional `body`)
 *  - `mark`  → a non-executing checkpoint / human-readable milestone
 *
 * `consumes` / `produces` are simple string keys used by the future
 * executor to wire outputs of one step into inputs of the next. They are
 * intentionally untyped — the runtime will validate at orchestration time.
 */
export type WorkflowStep = {
  id: string
  /** human label for UI */
  label: string
  /** what tool/route or BFF action this step runs */
  action:
    | { kind: 'tool'; toolId: string }
    | { kind: 'route'; method: 'GET' | 'POST'; path: string; body?: unknown }
    | { kind: 'mark'; message: string }
  /** previous step's output key consumed as this step's input */
  consumes?: string
  /** key name under which this step's output is published for downstream steps */
  produces?: string
}

export type WorkflowDefinition = {
  id: string
  title: string
  description: string
  steps: WorkflowStep[]
}
