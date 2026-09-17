import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Loader2, AlertTriangle, Copy, Check } from 'lucide-react';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  themeVariables: {
    darkMode: true,
    background: '#16161e',
    primaryColor: '#8b5cf6',
    primaryTextColor: '#ffffff',
    primaryBorderColor: '#a78bfa',
    lineColor: '#c084fc',
    secondaryColor: '#6366f1',
    tertiaryColor: '#1e1b4b',
    mainBkg: '#1a1a24',
    nodeBorder: '#7c3aed',
    clusterBkg: '#121218',
    titleColor: '#e0e7ff',
    edgeLabelBackground: '#1e1b4b',
  },
  fontFamily: 'inherit',
});

interface MermaidProps {
  chart: string;
}

export const MermaidRenderer: React.FC<MermaidProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      if (!chart.trim()) {
        setSvg('');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

      try {
        // Clean up common LLM artifacts
        let cleanChart = chart.trim();
        if (cleanChart.startsWith('```mermaid')) {
          cleanChart = cleanChart.replace(/^```mermaid\s*/, '').replace(/\s*```$/, '');
        } else if (cleanChart.startsWith('```')) {
          cleanChart = cleanChart.replace(/^```\w*\s*/, '').replace(/\s*```$/, '');
        }

        const { svg: renderedSvg } = await mermaid.render(id, cleanChart);
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('Mermaid rendering failed:', err);
          setError(err?.message || 'Failed to render diagram');
          setLoading(false);
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
      // Cleanup any dangling mermaid error element from DOM
      const dangling = document.querySelectorAll(`[id^="dmermaid"]`);
      dangling.forEach(el => el.remove());
    };
  }, [chart]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(chart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-xl border border-gray-700/80 bg-[#141419] overflow-hidden shadow-lg">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-[#1a1a24] text-xs text-gray-400">
        <span className="font-medium text-purple-400 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          Diagram / Chart
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors text-gray-400"
          title="Copy chart source"
        >
          {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      <div className="p-4 flex items-center justify-center overflow-x-auto min-h-[120px]">
        {loading && (
          <div className="flex items-center gap-2 text-gray-400 text-xs py-6">
            <Loader2 size={16} className="animate-spin text-purple-400" />
            <span>Rendering diagram...</span>
          </div>
        )}

        {!loading && error && (
          <div className="w-full text-left p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            <div className="flex items-center gap-1.5 font-medium mb-1">
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
              <span>Could not render diagram visually</span>
            </div>
            <pre className="mt-2 p-2 bg-black/40 rounded overflow-x-auto text-[11px] font-mono text-gray-300">
              {chart}
            </pre>
          </div>
        )}

        {!loading && !error && svg && (
          <div
            ref={containerRef}
            className="w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>
    </div>
  );
};
