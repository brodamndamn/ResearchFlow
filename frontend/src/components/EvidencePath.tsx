export type EvidenceStage = 'question' | 'plan' | 'search' | 'evidence' | 'report'

const EVIDENCE_STAGES: ReadonlyArray<{ id: EvidenceStage; label: string }> = [
  { id: 'question', label: '问题' },
  { id: 'plan', label: '计划' },
  { id: 'search', label: '搜索' },
  { id: 'evidence', label: '证据' },
  { id: 'report', label: '报告' },
]

type EvidencePathProps = {
  currentStage: EvidenceStage
  label?: string
}

export function EvidencePath({
  currentStage,
  label = '研究证据路径',
}: EvidencePathProps) {
  const currentIndex = EVIDENCE_STAGES.findIndex((stage) => stage.id === currentStage)

  return (
    <ol className="evidence-path" aria-label={label}>
      {EVIDENCE_STAGES.map((stage, index) => {
        const state = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming'
        return (
          <li className="evidence-path-step" data-state={state} key={stage.id}>
            <span className="evidence-path-node" aria-hidden="true">{index + 1}</span>
            <span aria-current={state === 'current' ? 'step' : undefined}>{stage.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
