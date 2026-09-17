import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidRenderer } from './MermaidRenderer';
import { InteractiveTable } from './InteractiveTable';
import { Copy, Check, Code as CodeIcon } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl border border-gray-800 bg-[#111116] overflow-hidden shadow-md">
      <div className="flex items-center justify-between px-4 py-2 bg-[#181822] border-b border-gray-800 text-xs text-gray-400">
        <div className="flex items-center gap-1.5 font-mono text-purple-300">
          <CodeIcon size={13} />
          <span>{language || 'code'}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors text-gray-400 text-xs"
          title="Copy code"
        >
          {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs font-mono text-gray-200 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!content) return null;

  return (
    <div className="leading-relaxed text-sm text-gray-200 space-y-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table({ children }) {
            return <InteractiveTable>{children}</InteractiveTable>;
          },
          thead({ children }) {
            return (
              <thead className="bg-[#21212d] text-purple-200 text-xs font-semibold uppercase tracking-wider border-b border-gray-700">
                {children}
              </thead>
            );
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-gray-800 text-sm">{children}</tbody>;
          },
          tr({ children }) {
            return (
              <tr className="hover:bg-purple-500/5 transition-colors odd:bg-transparent even:bg-white/[0.02]">
                {children}
              </tr>
            );
          },
          th({ children }) {
            return (
              <th className="px-4 py-3 text-left whitespace-nowrap font-medium text-purple-300">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-4 py-2.5 text-gray-200 align-top">
                {children}
              </td>
            );
          },
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const codeString = String(children).replace(/\n$/, '');

            // Detect Mermaid diagrams
            if (language === 'mermaid') {
              return <MermaidRenderer chart={codeString} />;
            }

            // Detect if this is a block code (has language or contains newlines)
            const isBlock = match || String(children).includes('\n');
            if (isBlock) {
              return <CodeBlock language={language} code={codeString} />;
            }

            // Inline code
            return (
              <code
                className="px-1.5 py-0.5 rounded bg-[#20202c] text-purple-300 font-mono text-xs border border-purple-900/30"
                {...props}
              >
                {children}
              </code>
            );
          },
          h1({ children }) {
            return <h1 className="text-xl font-bold text-white mt-4 mb-2">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-bold text-white mt-3.5 mb-2">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold text-purple-200 mt-3 mb-1.5">{children}</h3>;
          },
          h4({ children }) {
            return <h4 className="text-sm font-semibold text-gray-200 mt-2 mb-1">{children}</h4>;
          },
          p({ children }) {
            return <p className="leading-relaxed opacity-95 mb-2.5 last:mb-0">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 space-y-1 mb-2.5 text-sm text-gray-200">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 space-y-1 mb-2.5 text-sm text-gray-200">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-purple-500 bg-purple-500/10 px-4 py-2.5 my-2.5 rounded-r-lg text-sm text-purple-200 italic">
                {children}
              </blockquote>
            );
          },
          hr() {
            return <hr className="border-gray-700 my-4" />;
          },
          strong({ children }) {
            return <strong className="font-semibold text-white">{children}</strong>;
          },
          em({ children }) {
            return <em className="italic text-gray-300">{children}</em>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 underline transition-colors"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
export default MarkdownRenderer;
