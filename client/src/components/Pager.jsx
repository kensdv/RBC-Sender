export default function Pager({ total, page, setPage, size, setSize }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="pager">
      <button className="btn-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Prev</button>
      <span className="pager-info">Page {page} / {pages} · {total} rows</span>
      <button className="btn-xs" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next ›</button>
      <select className="w-select pager-size" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}>
        <option value={50}>50 / page</option>
        <option value={100}>100 / page</option>
        <option value={200}>200 / page</option>
      </select>
    </div>
  );
}
