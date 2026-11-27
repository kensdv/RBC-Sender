import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { BLOCK_TYPES } from '../config.js';

function VisualEditor({ draft, updateDraft, token, assets, setAssets }) {
  const [blocks, setBlocks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draggedBlock, setDraggedBlock] = useState(null);
  const [viewMode, setViewMode] = useState('desktop');
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [assetType, setAssetType] = useState('image');
  const [assetData, setAssetData] = useState('');

  useEffect(() => {
    if (blocks.length === 0 && draft.html) {
      try {
        const parsed = JSON.parse(draft.html);
        if (Array.isArray(parsed)) setBlocks(parsed);
      } catch {}
    }
  }, [draft.html]);

  useEffect(() => {
    updateDraft('html', JSON.stringify(blocks));
    updateDraft('text', generatePlainText(blocks));
  }, [blocks]);

  function generatePlainText(blocks) {
    return blocks.map(b => {
      switch (b.type) {
        case 'header': return b.text || '';
        case 'text': return b.text || '';
        case 'button': return `${b.text || 'Click here'}: ${b.url || ''}`;
        case 'footer': return b.text || '';
        default: return '';
      }
    }).filter(Boolean).join('\n\n');
  }

  function generateHtml(blocks, isPreview = true) {
    const styles = {
      container: 'max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;color:#333;',
      header: 'font-size:24px;font-weight:bold;margin-bottom:16px;',
      image: 'max-width:100%;height:auto;margin:12px 0;',
      text: 'font-size:14px;line-height:1.6;margin-bottom:16px;',
      button: 'display:inline-block;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;',
      divider: 'border:none;border-top:2px solid #ddd;margin:20px 0;',
      social: 'display:flex;gap:12px;margin:16px 0;',
      footer: 'font-size:12px;color:#666;margin-top:24px;padding-top:16px;border-top:1px solid #ddd;',
    };
    const html = blocks.map(b => {
      switch (b.type) {
        case 'header': return `<div style="${styles.header}color:${b.color || '#333'};text-align:${b.align || 'left'};font-size:${b.size || 24}px">${escapeHtml(b.text || '')}</div>`;
        case 'image': return `<img src="${b.url || ''}" alt="${escapeHtml(b.alt || '')}" style="${styles.image}border-radius:${b.radius || 0}px" />`;
        case 'text': return `<div style="${styles.text}color:${b.color || '#333'};text-align:${b.align || 'left'};font-size:${b.size || 14}px;line-height:${b.lineHeight || 1.6}">${escapeHtml(b.text || '')}</div>`;
        case 'button': return `<a href="${b.url || '#'}" style="${styles.button}background:${b.bgColor || '#2fe06b'};color:${b.color || '#000'};padding:${b.padding || '12px 24px'};border-radius:${b.radius || 4}px;font-size:${b.size || 14}px">${escapeHtml(b.text || 'Click here')}</a>`;
        case 'divider': return `<hr style="${styles.divider}border-top-color:${b.color || '#ddd'};margin:${b.margin || '20px 0'}" />`;
        case 'social': return `<div style="${styles.social}justify-content:${b.align || 'left'}">${(b.icons || []).map(i => `<a href="${i.url || '#'}" style="display:inline-block;width:32px;height:32px;background:${i.bgColor || '#333'};color:#fff;text-align:center;line-height:32px;border-radius:50%;text-decoration:none;font-size:16px">${i.icon || 'S'}</a>`).join('')}</div>`;
        case 'footer': return `<div style="${styles.footer}text-align:${b.align || 'center'};font-size:${b.size || 12}px">${escapeHtml(b.text || '')}</div>`;
        default: return '';
      }
    }).join('');
    return `<div style="${styles.container}">${html}</div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function addBlock(type) {
    const newBlock = { id: Date.now(), type, text: 'New ' + type, color: '#333', align: 'left', size: type === 'header' ? 24 : 14 };
    if (type === 'button') newBlock.url = '#'; newBlock.bgColor = '#2fe06b'; newBlock.color = '#000'; newBlock.radius = 4; newBlock.padding = '12px 24px';
    if (type === 'image') newBlock.url = ''; newBlock.alt = 'Image'; newBlock.radius = 0;
    if (type === 'social') newBlock.icons = [{ icon: 'T', url: '#', bgColor: '#1DA1F2' }, { icon: 'F', url: '#', bgColor: '#4267B2' }, { icon: 'I', url: '#', bgColor: '#E1306C' }, { icon: 'L', url: '#', bgColor: '#0077B5' }];
    if (type === 'footer') newBlock.text = 'You received this email because you subscribed. Unsubscribe | Privacy | Contact';
    setBlocks([...blocks, newBlock]);
    setSelectedId(newBlock.id);
  }

  function updateBlock(id, field, value) {
    setBlocks(blocks.map(b => b.id === id ? { ...b, [field]: value } : b));
  }

  function deleteBlock(id) {
    setBlocks(blocks.filter(b => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function moveBlock(from, to) {
    const newBlocks = [...blocks];
    const [removed] = newBlocks.splice(from, 1);
    newBlocks.splice(to, 0, removed);
    setBlocks(newBlocks);
  }

  function onDragStart(e, index) {
    setDraggedBlock(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDrop(e, index) {
    e.preventDefault();
    if (draggedBlock === null || draggedBlock === index) return;
    moveBlock(draggedBlock, index);
    setDraggedBlock(null);
  }

  function saveAsset() {
    if (!assetName || !assetData) return;
    const type = assetType;
    const dataUrl = assetData.startsWith('data:') ? assetData : `data:image/png;base64,${assetData}`;
    api(token, '/api/assets', { method: 'POST', body: { name: assetName, type, dataUrl } }).then(r => {
      setAssets([...assets, { id: r.id, name: assetName, type, dataUrl, createdAt: new Date().toISOString() }]);
      setAssetName(''); setAssetData(''); setAssetType('image');
    });
  }

  function loadAsset(asset) {
    updateBlock(selectedId, 'url', asset.dataUrl);
  }

  const selectedBlock = blocks.find(b => b.id === selectedId);

  return (
    <div className="visual-editor">
      <div className="ve-toolbar">
        <span className="dim">VISUAL EDITOR</span>
        <div className="btn-row">
          <button className="btn-xs" onClick={() => setViewMode('desktop')}>DESKTOP</button>
          <button className="btn-xs" onClick={() => setViewMode('mobile')}>MOBILE</button>
          <button className="btn-xs" onClick={() => setAssetPanelOpen(!assetPanelOpen)}>ASSETS</button>
        </div>
      </div>
      <div className="ve-layout">
        <div className="ve-palette">
          <div className="ve-palette-title">BLOCKS</div>
          {BLOCK_TYPES.map(t => (
            <div key={t.id} className="ve-palette-item" draggable onDragStart={() => setDraggedBlock(-1)} onDragEnd={() => setDraggedBlock(null)} onClick={() => addBlock(t.id)}>
              <span className="ve-icon">{t.icon}</span>
              <span>{t.label}</span>
            </div>
          ))}
        </div>
        <div className="ve-canvas">
          <div className={`ve-canvas-inner ${viewMode}`}>
            {blocks.length === 0 && (
              <div className="ve-empty">DRAG BLOCKS HERE OR CLICK A BLOCK TYPE TO START</div>
            )}
            {blocks.map((b, i) => (
              <div key={b.id} className={`ve-block ${selectedId === b.id ? 've-selected' : ''}`} draggable onDragStart={(e) => onDragStart(e, i)} onDragOver={(e) => onDragOver(e, i)} onDrop={(e) => onDrop(e, i)} onClick={() => setSelectedId(b.id)}>
                {b.type === 'header' && <div style={{ fontSize: b.size, color: b.color, textAlign: b.align }}>{b.text}</div>}
                {b.type === 'image' && (b.url ? <img src={b.url} alt={b.alt} style={{ maxWidth: '100%', borderRadius: b.radius }} /> : <div className="ve-placeholder">IMAGE: {b.alt}</div>)}
                {b.type === 'text' && <div style={{ fontSize: b.size, color: b.color, textAlign: b.align, lineHeight: b.lineHeight }}>{b.text}</div>}
                {b.type === 'button' && <a href="#" style={{ display: 'inline-block', padding: b.padding, background: b.bgColor, color: b.color, textDecoration: 'none', borderRadius: b.radius, fontSize: b.size }}>{b.text}</a>}
                {b.type === 'divider' && <hr style={{ borderTop: `2px solid ${b.color}`, margin: b.margin }} />}
                {b.type === 'social' && <div style={{ display: 'flex', gap: '12px', justifyContent: b.align }}>{(b.icons || []).map((i, idx) => <span key={idx} style={{ width: 32, height: 32, background: i.bgColor, color: '#fff', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{i.icon}</span>)}</div>}
                {b.type === 'footer' && <div style={{ fontSize: b.size, color: '#666', textAlign: b.align }}>{b.text}</div>}
                <div className="ve-block-actions"><button className="btn-xs" onClick={(e) => { e.stopPropagation(); deleteBlock(b.id); }}>×</button></div>
              </div>
            ))}
          </div>
        </div>
        <div className="ve-props">
          <div className="ve-palette-title">PROPERTIES</div>
          {!selectedBlock && <div className="ve-empty">SELECT A BLOCK</div>}
          {selectedBlock && (
            <div className="ve-props-form">
              <label className="field-label">TEXT</label>
              <input className="w-input" value={selectedBlock.text || ''} onChange={(e) => updateBlock(selectedId, 'text', e.target.value)} />
              {selectedBlock.type === 'header' || selectedBlock.type === 'text' ? (
                <>
                  <label className="field-label">COLOR</label>
                  <input className="w-input" type="color" value={selectedBlock.color || '#333'} onChange={(e) => updateBlock(selectedId, 'color', e.target.value)} />
                  <label className="field-label">SIZE</label>
                  <input className="w-input" type="number" value={selectedBlock.size || 14} onChange={(e) => updateBlock(selectedId, 'size', Number(e.target.value))} />
                  <label className="field-label">ALIGN</label>
                  <select className="w-select" value={selectedBlock.align || 'left'} onChange={(e) => updateBlock(selectedId, 'align', e.target.value)}>
                    <option value="left">LEFT</option>
                    <option value="center">CENTER</option>
                    <option value="right">RIGHT</option>
                  </select>
                </>
              ) : null}
              {selectedBlock.type === 'text' && (
                <>
                  <label className="field-label">LINE HEIGHT</label>
                  <input className="w-input" type="number" step="0.1" value={selectedBlock.lineHeight || 1.6} onChange={(e) => updateBlock(selectedId, 'lineHeight', Number(e.target.value))} />
                </>
              )}
              {selectedBlock.type === 'button' && (
                <>
                  <label className="field-label">URL</label>
                  <input className="w-input" value={selectedBlock.url || ''} onChange={(e) => updateBlock(selectedId, 'url', e.target.value)} />
                  <label className="field-label">BG COLOR</label>
                  <input className="w-input" type="color" value={selectedBlock.bgColor || '#2fe06b'} onChange={(e) => updateBlock(selectedId, 'bgColor', e.target.value)} />
                  <label className="field-label">TEXT COLOR</label>
                  <input className="w-input" type="color" value={selectedBlock.color || '#000'} onChange={(e) => updateBlock(selectedId, 'color', e.target.value)} />
                  <label className="field-label">RADIUS</label>
                  <input className="w-input" type="number" value={selectedBlock.radius || 4} onChange={(e) => updateBlock(selectedId, 'radius', Number(e.target.value))} />
                  <label className="field-label">PADDING</label>
                  <input className="w-input" value={selectedBlock.padding || '12px 24px'} onChange={(e) => updateBlock(selectedId, 'padding', e.target.value)} />
                </>
              )}
              {selectedBlock.type === 'image' && (
                <>
                  <label className="field-label">URL</label>
                  <input className="w-input" value={selectedBlock.url || ''} onChange={(e) => updateBlock(selectedId, 'url', e.target.value)} />
                  <label className="field-label">ALT</label>
                  <input className="w-input" value={selectedBlock.alt || ''} onChange={(e) => updateBlock(selectedId, 'alt', e.target.value)} />
                  <label className="field-label">RADIUS</label>
                  <input className="w-input" type="number" value={selectedBlock.radius || 0} onChange={(e) => updateBlock(selectedId, 'radius', Number(e.target.value))} />
                </>
              )}
              {selectedBlock.type === 'footer' && (
                <>
                  <label className="field-label">SIZE</label>
                  <input className="w-input" type="number" value={selectedBlock.size || 12} onChange={(e) => updateBlock(selectedId, 'size', Number(e.target.value))} />
                  <label className="field-label">ALIGN</label>
                  <select className="w-select" value={selectedBlock.align || 'center'} onChange={(e) => updateBlock(selectedId, 'align', e.target.value)}>
                    <option value="left">LEFT</option>
                    <option value="center">CENTER</option>
                    <option value="right">RIGHT</option>
                  </select>
                </>
              )}
              {selectedBlock.type === 'image' && (
                <div style={{ marginTop: 10 }}>
                  <label className="field-label">SAVE ASSET</label>
                  <input className="w-input" placeholder="Asset name" value={assetName} onChange={(e) => setAssetName(e.target.value)} />
                  <select className="w-select" value={assetType} onChange={(e) => setAssetType(e.target.value)}>
                    <option value="image">IMAGE</option>
                    <option value="signature">SIGNATURE</option>
                    <option value="logo">LOGO</option>
                    <option value="banner">BANNER</option>
                  </select>
                  <button className="btn-xs" onClick={saveAsset} disabled={!assetName || !assetData}>SAVE</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {assetPanelOpen && (
        <div className="ve-asset-panel">
          <div className="ve-palette-title">ASSETS</div>
          <div className="ve-assets-list">
            {assets.filter(a => a.type === 'image' || a.type === 'signature' || a.type === 'logo' || a.type === 'banner').map(a => (
              <div key={a.id} className="ve-asset" onClick={() => selectedBlock && loadAsset(a)}>
                <img src={a.dataUrl} alt={a.name} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4 }} />
                <div className="ve-asset-name">{a.name}</div>
                <button className="btn-xs" onClick={(e) => { e.stopPropagation(); setAssets(assets.filter(x => x.id !== a.id)); api(token, `/api/assets/${a.id}`, { method: 'DELETE' }); }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


export default VisualEditor;
