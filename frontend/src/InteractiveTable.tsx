import React, { useState, useMemo } from 'react';
import { Table as TableIcon, BarChart2, Copy, Check } from 'lucide-react';

interface InteractiveTableProps {
  children?: React.ReactNode;
}

export const InteractiveTable: React.FC<InteractiveTableProps> = ({ children }) => {
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [copied, setCopied] = useState(false);

  // Extract tabular text data from the React children structure for charting and copying
  const tableData = useMemo(() => {
    try {
      const headers: string[] = [];
      const rows: string[][] = [];

      React.Children.forEach(children, (child: any) => {
        if (!child) return;
        const type = child.type;

        // thead
        if (type === 'thead') {
          React.Children.forEach(child.props.children, (tr: any) => {
            if (!tr) return;
            React.Children.forEach(tr.props.children, (th: any) => {
              if (th) {
                headers.push(extractText(th).trim());
              }
            });
          });
        }

        // tbody
        if (type === 'tbody') {
          React.Children.forEach(child.props.children, (tr: any) => {
            if (!tr) return;
            const row: string[] = [];
            React.Children.forEach(tr.props.children, (td: any) => {
              if (td) {
                row.push(extractText(td).trim());
              }
            });
            if (row.length > 0) rows.push(row);
          });
        }
      });

      // Check if any column is numeric
      let numericColIndex = -1;
      let labelColIndex = -1;

      if (headers.length >= 2 && rows.length >= 2) {
        for (let col = 1; col < headers.length; col++) {
          const isNumeric = rows.every(r => {
            const val = r[col]?.replace(/[%,$]/g, '').trim();
            return val !== undefined && val !== '' && !isNaN(Number(val));
          });
          if (isNumeric) {
            numericColIndex = col;
            labelColIndex = 0;
            break;
          }
        }
      }

      const canChart = numericColIndex !== -1 && labelColIndex !== -1;

      return { headers, rows, canChart, labelColIndex, numericColIndex };
    } catch (e) {
      return { headers: [], rows: [], canChart: false, labelColIndex: -1, numericColIndex: -1 };
    }
  }, [children]);

  const handleCopy = async () => {
    if (tableData.headers.length === 0) return;
    const csvLines = [
      tableData.headers.join('\t'),
      ...tableData.rows.map(r => r.join('\t'))
    ].join('\n');

    await navigator.clipboard.writeText(csvLines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to get max value for chart scaling
  const chartItems = useMemo(() => {
    if (!tableData.canChart) return [];
    return tableData.rows.map(r => {
      const label = r[tableData.labelColIndex] || '';
      const rawNum = parseFloat(r[tableData.numericColIndex]?.replace(/[%,$]/g, '') || '0');
      return { label, value: isNaN(rawNum) ? 0 : rawNum, originalText: r[tableData.numericColIndex] };
    });
  }, [tableData]);

  const maxValue = useMemo(() => {
    if (chartItems.length === 0) return 1;
    return Math.max(...chartItems.map(c => c.value), 1);
  }, [chartItems]);

  return (
    <div className="my-4 rounded-xl border border-gray-700/80 bg-[#16161c] overflow-hidden shadow-xl">
      {/* Table Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1f1f2a] border-b border-gray-800 text-xs text-gray-300">
        <div className="flex items-center gap-2 font-medium">
          <TableIcon size={14} className="text-purple-400" />
          <span className="text-gray-200">Table Data</span>
          {tableData.rows.length > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
              {tableData.rows.length} rows
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {tableData.canChart && (
            <div className="flex items-center bg-[#131317] p-0.5 rounded-lg border border-gray-700">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <TableIcon size={12} />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('chart')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'chart'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <BarChart2 size={12} />
                Chart
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#262635] hover:bg-[#323246] text-gray-300 hover:text-white transition-colors text-xs"
            title="Copy table content"
          >
            {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* View: Table Mode */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse text-sm">
            {children}
          </table>
        </div>
      )}

      {/* View: Visual Bar Chart Mode */}
      {viewMode === 'chart' && (
        <div className="p-5 space-y-3 bg-[#121217]">
          <div className="text-xs text-gray-400 font-medium mb-3 flex items-center justify-between">
            <span>
              Comparing: <strong className="text-purple-300">{tableData.headers[tableData.labelColIndex]}</strong> vs <strong className="text-indigo-300">{tableData.headers[tableData.numericColIndex]}</strong>
            </span>
          </div>
          <div className="space-y-2.5">
            {chartItems.map((item, idx) => {
              const pct = Math.max(4, Math.round((item.value / maxValue) * 100));
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-300">
                    <span className="font-medium truncate max-w-[70%]">{item.label}</span>
                    <span className="font-mono text-purple-300">{item.originalText}</span>
                  </div>
                  <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

function extractText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node.props && node.props.children) return extractText(node.props.children);
  return '';
}
