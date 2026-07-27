import { ReactNode } from 'react';

function inline(text: string, onLinkClick?: () => void): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g);
  return parts.map((part, index) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={index}>{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer" onClick={onLinkClick} className="font-semibold text-emerald-700 underline">{link[1]}</a>;
    return part;
  });
}

export function CmsBody({ body, onLinkClick }: { body: string; onLinkClick?: () => void }) {
  const lines = body.split('\n');
  const nodes: ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (!list.length) return;
    nodes.push(<ul key={`list-${nodes.length}`} className="my-5 list-disc space-y-2 pl-6">{list.map((item, index) => <li key={`${item}-${index}`}>{inline(item, onLinkClick)}</li>)}</ul>);
    list = [];
  };
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line.startsWith('- ')) {
      list.push(line.slice(2));
      return;
    }
    flushList();
    if (!line) return;
    if (line.startsWith('## ')) nodes.push(<h2 key={index} className="mb-3 mt-8 font-display text-2xl font-extrabold text-slate-950">{inline(line.slice(3), onLinkClick)}</h2>);
    else if (line.startsWith('### ')) nodes.push(<h3 key={index} className="mb-2 mt-6 font-display text-xl font-bold text-slate-950">{inline(line.slice(4), onLinkClick)}</h3>);
    else if (line.startsWith('> ')) nodes.push(<blockquote key={index} className="my-6 border-l-4 border-[#F4D35E] bg-amber-50 p-5 font-display text-lg font-semibold italic text-slate-800">{inline(line.slice(2), onLinkClick)}</blockquote>);
    else nodes.push(<p key={index} className="my-4 text-base leading-8 text-slate-700">{inline(line, onLinkClick)}</p>);
  });
  flushList();
  return <div>{nodes}</div>;
}
