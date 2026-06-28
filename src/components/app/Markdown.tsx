import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Port of the app's agent/Markdown.tsx component map — same classes/tokens. */
export function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="space-y-2 font-ui text-[13.5px] leading-relaxed text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            />
          ),
          ul: ({ ...props }) => <ul {...props} className="list-disc space-y-1 pl-5" />,
          ol: ({ ...props }) => <ol {...props} className="list-decimal space-y-1 pl-5" />,
          h1: ({ ...props }) => <h2 {...props} className="pt-1 text-[15px] font-semibold" />,
          h2: ({ ...props }) => <h3 {...props} className="pt-1 text-[14px] font-semibold" />,
          h3: ({ ...props }) => <h4 {...props} className="pt-1 text-[13.5px] font-semibold" />,
          blockquote: ({ ...props }) => (
            <blockquote {...props} className="border-l-2 border-edge pl-3 text-ink-2" />
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = (className ?? '').includes('language-')
            if (isBlock) {
              return (
                <code
                  {...props}
                  className="block overflow-x-auto rounded-md border border-edge-2 bg-term p-2.5 font-mono text-[12px] leading-[1.55] whitespace-pre text-term-ink"
                >
                  {children}
                </code>
              )
            }
            return (
              <code
                {...props}
                className="rounded bg-overlay px-1 py-0.5 font-mono text-[12px] text-accent"
              >
                {children}
              </code>
            )
          },
          hr: ({ ...props }) => <hr {...props} className="border-edge-2" />
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
