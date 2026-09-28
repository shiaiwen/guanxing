import { useCallback, useEffect, useState } from 'react';
import type { Report, ReportSection, TableSection } from './types';

const numericColumns = new Set(['价格', '限购', '编号', '预估价格']);

export function App() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/report', { cache: 'no-store' });
      const body = await response.json() as Report & { error?: string };
      if (!response.ok) throw new Error(body.error || '读取失败');
      setReport(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100/95 backdrop-blur">
        <div className="mx-auto flex w-full flex-col gap-3 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">自助观星</h1>
            <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
              {report ? `${report.note}：${report.updatedAt}` : '打开即读取当前配置'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="shrink-0 rounded-full bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:bg-indigo-300"
          >
            {loading ? '正在更新' : '刷新'}
          </button>
        </div>
        {report ? <SectionNav sections={report.sections} /> : null}
      </header>

      <main className="mx-auto flex w-full flex-col gap-6 px-4 py-5">
        {!report && loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {report?.sections.map((section, index) => (
          <section key={section.title} id={`section-${index}`} className="scroll-mt-36">
            <h2 className="mb-2 text-base font-semibold text-slate-900">{section.title}</h2>
            {section.kind === 'skins' ? <SkinGrid items={section.items} /> : <DataTable section={section} />}
          </section>
        ))}
      </main>
    </div>
  );
}

function SectionNav({ sections }: { sections: ReportSection[] }) {
  const [current, setCurrent] = useState(() => {
    const match = window.location.hash.match(/^#section-(\d+)$/);
    const index = match ? Number(match[1]) : 0;
    return index >= 0 && index < sections.length ? String(index) : '0';
  });

  return (
    <div className="px-4 pb-3">
      <label htmlFor="section-jump" className="sr-only">跳转到栏目</label>
      <select
        id="section-jump"
        value={current}
        onChange={(event) => {
          const index = event.target.value;
          setCurrent(index);
          window.location.hash = `section-${index}`;
        }}
        className="w-full rounded-xl bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-indigo-400"
      >
        {sections.map((section, index) => (
          <option key={section.title} value={String(index)}>{section.title}</option>
        ))}
      </select>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-2xl bg-white px-4 py-16 text-center text-sm text-slate-500 ring-1 ring-slate-200">
      正在下载最新配置并生成报告，大约需要几秒。
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-8 text-center ring-1 ring-red-200">
      <p className="text-sm text-red-600">{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 rounded-full bg-slate-900 px-4 py-2 text-sm text-white">
        重试
      </button>
    </div>
  );
}

function DataTable({ section }: { section: TableSection }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200 md:block">
        <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
          <thead className="bg-indigo-50 text-slate-700">
            <tr>
              {section.columns.map((column) => (
                <th key={column} className={`px-3 py-2 font-medium ${alignClass(column)} ${column === '时间' ? 'time-cell' : ''}`}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, index) => (
              <tr key={index} className="border-t border-slate-100 align-top">
                {section.columns.map((column) => (
                  <td key={column} className={`px-3 py-2 ${alignClass(column)} ${column === '时间' ? 'time-cell' : ''}`}>
                    <Cell column={column} value={row[column] ?? ''} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {section.rows.map((row, index) => (
          <article key={index} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            {section.columns.map((column) => (
              <div key={column} className="grid grid-cols-[4.5rem_1fr] gap-2 border-b border-slate-100 py-1.5 text-sm last:border-b-0">
                <span className="text-slate-500">{column}</span>
                <span className={alignClass(column)}><Cell column={column} value={row[column] ?? ''} /></span>
              </div>
            ))}
          </article>
        ))}
      </div>
    </>
  );
}

function Cell({ column, value }: { column: string; value: string }) {
  const text = value.replaceAll('####', '\n');
  if (column === '时间') return <span className="time-cell">{text}</span>;
  return <span className={numericColumns.has(column) ? '' : 'whitespace-pre-wrap'}>{text}</span>;
}

function alignClass(column: string): string {
  return numericColumns.has(column) ? 'text-right tabular-nums' : '';
}

function SkinGrid({ items }: { items: { name: string; thumb: string; full: string }[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item, index) => (
        <li key={`${item.thumb}-${index}`}>
          <a href={item.full} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            <img src={item.thumb} alt={item.name} className="aspect-[3/4] w-full bg-slate-50 object-cover object-top" />
            <p className="px-2 py-2 text-sm leading-5">{item.name}</p>
          </a>
        </li>
      ))}
    </ul>
  );
}
