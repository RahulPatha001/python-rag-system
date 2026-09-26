import { useState } from 'react'
import { ArrowUpRight, FileText, Layers3, X } from 'lucide-react'

function SourcePanel({ isOpen, sources, selectedSourceId, onClose, onSelectSource }) {
  const [expandedId, setExpandedId] = useState(null)

  return (
    <>
      <button
        type="button"
        className={`source-scrim${isOpen ? ' source-scrim--visible' : ''}`}
        onClick={onClose}
        aria-label="Close sources"
        tabIndex={isOpen ? 0 : -1}
      />
      <aside
        className={`source-panel${isOpen ? ' source-panel--open' : ''}`}
        aria-label="Answer sources"
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        <div className="source-panel__header">
          <div>
            <p className="eyebrow">Evidence</p>
            <h2>Sources <span>{sources.length}</span></h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close sources">
            <X size={19} />
          </button>
        </div>

        <p className="source-panel__intro">
          Retrieved passages used to ground this answer. Select one to highlight its context.
        </p>

        <div className="source-list">
          {sources.length === 0 ? (
            <div className="source-empty">
              <Layers3 size={24} />
              <strong>No sources found</strong>
              <p>The model answered without a matching passage. Try asking a more specific question.</p>
            </div>
          ) : (
            sources.map((source, index) => {
              const isExpanded = expandedId === source.id
              const scoreLabel = Number.isFinite(source.score)
                ? `${Math.min(100, Math.max(0, Math.round(source.score <= 1 ? source.score * 100 : source.score)))}% match`
                : null

              return (
                <article
                  className={`source-card${selectedSourceId === source.id ? ' source-card--selected' : ''}`}
                  key={source.id}
                >
                  <button className="source-card__main" type="button" onClick={() => onSelectSource(source.id)}>
                    <span className="source-card__number">{index + 1}</span>
                    <span className="source-card__heading">
                      <strong>{source.title}</strong>
                      <small>
                        {source.location || 'Document excerpt'}
                        {scoreLabel && <><i /> {scoreLabel}</>}
                      </small>
                    </span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                  <p className={`source-card__excerpt${isExpanded ? ' source-card__excerpt--expanded' : ''}`}>
                    {source.content || 'No passage preview was returned for this source.'}
                  </p>
                  <button
                    className="source-card__toggle"
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : source.id)}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? 'Show less' : 'Read full passage'}
                  </button>
                </article>
              )
            })
          )}
        </div>

        <div className="source-panel__footer">
          <FileText size={15} />
          Answers can be inaccurate. Verify important details in the source passages.
        </div>
      </aside>
    </>
  )
}

export default SourcePanel
