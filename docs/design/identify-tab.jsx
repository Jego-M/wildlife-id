// Identify tab — empty / crop / identifying / result states
// Lives inside the AppShell's main content area.

const { useState: useS2, useEffect: useE2, useRef: useR2, useMemo: useM2, useCallback: useC2 } = React;

// ──────────────────────────────────────────────────────────
// Sample photos — used as drag-targets and the "Try a sample"
// fallback when running without a real file picker
// ──────────────────────────────────────────────────────────
const SAMPLE_PHOTOS = [
  { id:'fox',  name:'red-fox-meadow.jpg',     species:'Red Fox',         latin:'Vulpes vulpes',     confidence:0.94, palette:['#7e5a36','#b88a52','#3b2c1c','#d4b48a'] },
  { id:'owl',  name:'great-horned-owl.jpg',   species:'Great Horned Owl',latin:'Bubo virginianus',  confidence:0.88, palette:['#5a4a36','#a08866','#2b231a','#c9b48f'] },
  { id:'frog', name:'pacific-tree-frog.jpg',  species:'Pacific Tree Frog',latin:'Pseudacris regilla',confidence:0.91, palette:['#4d6a3a','#8aa66a','#2d3e22','#cfd9b3'] },
];

// Fake but believable photo — gradient + topographic noise + organic shape silhouette
function PhotoBitmap({ photo, style }) {
  const [a,b,c,d] = photo.palette;
  return (
    <div style={{
      position:'relative', overflow:'hidden',
      background:`linear-gradient(160deg, ${b} 0%, ${a} 45%, ${c} 100%)`,
      ...style,
    }}>
      {/* film grain */}
      <svg width="100%" height="100%" style={{ position:'absolute', inset:0, opacity:0.4, mixBlendMode:'overlay' }}>
        <filter id={`gn-${photo.id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
        </filter>
        <rect width="100%" height="100%" filter={`url(#gn-${photo.id})`}/>
      </svg>
      {/* soft vignette */}
      <div style={{
        position:'absolute', inset:0,
        background:`radial-gradient(120% 80% at 50% 40%, transparent 40%, rgba(0,0,0,0.45) 100%)`,
      }}/>
      {/* abstract subject silhouette */}
      <SubjectSilhouette id={photo.id} accent={d}/>
    </div>
  );
}

function SubjectSilhouette({ id, accent }) {
  // Very loose, abstract silhouettes positioned in the photo's "subject" area
  const paths = {
    fox: <path d="M 38 62 Q 44 38 56 38 Q 60 30 64 36 Q 70 32 70 40 Q 78 44 76 56 Q 80 64 72 70 Q 60 76 50 74 Q 40 76 38 62 Z" fill={accent} opacity="0.55"/>,
    owl: <ellipse cx="50" cy="55" rx="20" ry="26" fill={accent} opacity="0.5"/>,
    frog: <path d="M 30 60 Q 30 40 50 38 Q 70 40 70 60 Q 70 78 50 80 Q 30 78 30 60 Z" fill={accent} opacity="0.55"/>,
  };
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%"
         style={{ position:'absolute', inset:0 }}>
      {paths[id]}
    </svg>
  );
}

// ──────────────────────────────────────────────────────────
// IdentifyTab — top-level state machine
// ──────────────────────────────────────────────────────────
function IdentifyTab({ tweaks, setTweak }) {
  const [stage, setStage] = useS2(tweaks.identifyStage || 'empty');
  // available stages: empty, crop, identifying, result
  const [photo, setPhoto] = useS2(SAMPLE_PHOTOS[0]);
  const [crop, setCrop] = useS2({ x:14, y:18, w:62, h:60 }); // percentages
  const [progress, setProgress] = useS2(0);

  // sync external stage
  useE2(()=>{
    if (tweaks.identifyStage && tweaks.identifyStage !== stage) {
      setStage(tweaks.identifyStage);
      if (tweaks.identifyStage === 'identifying') runIdentify();
      if (tweaks.identifyStage === 'empty') setProgress(0);
      if (tweaks.identifyStage === 'result')  setProgress(1);
    }
  }, [tweaks.identifyStage]);

  const goStage = (s) => { setStage(s); setTweak('identifyStage', s); };

  const onPickFile = (file) => {
    // We can't actually decode user files in this demo (no real model), so we
    // accept the file but show one of the sample photos. The filename is shown.
    if (file && file.name) {
      setPhoto({ ...SAMPLE_PHOTOS[Math.floor(Math.random()*SAMPLE_PHOTOS.length)],
                 name: file.name });
    }
    setCrop({ x:14, y:18, w:62, h:60 });
    goStage('crop');
  };
  const onPickSample = (p) => {
    setPhoto(p); setCrop({ x:14, y:18, w:62, h:60 }); goStage('crop');
  };

  const runIdentify = () => {
    setProgress(0); goStage('identifying');
    const start = performance.now();
    const total = 2400 / (tweaks.identifySpeed || 1);
    const tick = (t) => {
      const p = Math.min(1, (t - start) / total);
      setProgress(p);
      if (p < 1) requestAnimationFrame(tick);
      else setTimeout(()=>{ goStage('result'); }, 220);
    };
    requestAnimationFrame(tick);
  };

  const reset = () => { goStage('empty'); setProgress(0); };

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', minHeight:0 }}>
      <IdentifyHeader stage={stage} photo={photo} onReset={reset}/>
      <div style={{ flex:1, position:'relative', minHeight:0 }}>
        {stage === 'empty' && (
          <DropZone onFile={onPickFile} onSample={onPickSample}/>
        )}
        {stage === 'crop' && (
          <CropStage photo={photo} crop={crop} setCrop={setCrop}
            onCancel={reset} onIdentify={runIdentify}/>
        )}
        {(stage === 'identifying' || stage === 'result') && (
          <IdentifyStage photo={photo} crop={crop} progress={progress}
            done={stage==='result'} onAnother={reset} onSave={()=>{}}/>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Header — page title and contextual actions
// ──────────────────────────────────────────────────────────
function IdentifyHeader({ stage, photo, onReset }) {
  const labels = {
    empty:       { eyebrow:'Identify', title:'New identification' },
    crop:        { eyebrow:'Step 1 of 2', title:'Adjust the crop' },
    identifying: { eyebrow:'Step 2 of 2', title:'Identifying…' },
    result:      { eyebrow:'Result', title:photo.species },
  };
  const l = labels[stage];
  return (
    <div style={{
      padding:'22px 32px 18px', borderBottom:'0.5px solid var(--hair)',
      display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexShrink:0,
    }}>
      <div>
        <div style={{
          fontSize:11, fontWeight:600, letterSpacing:'0.14em', textTransform:'uppercase',
          color:'var(--accent-deep)', marginBottom:6,
        }}>{l.eyebrow}</div>
        <h1 style={{
          fontFamily:'Fraunces, serif', fontWeight:500, fontSize:26,
          letterSpacing:'-0.015em', color:'var(--ink)', margin:0,
        }}>
          {stage==='result' ? (
            <>
              {l.title}
              <span style={{ fontStyle:'italic', fontWeight:400, color:'var(--ink-3)',
                fontSize:18, marginLeft:10 }}>{photo.latin}</span>
            </>
          ) : l.title}
        </h1>
      </div>
      {stage !== 'empty' && (
        <button onClick={onReset} style={{
          appearance:'none', border:'0.5px solid var(--hair-2)', background:'#fff',
          color:'var(--ink-2)', fontFamily:'inherit', fontSize:12.5,
          padding:'7px 12px', borderRadius:7, cursor:'pointer',
          display:'inline-flex', alignItems:'center', gap:6,
        }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Discard
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Empty state — drop zone + file picker + sample shortcuts
// ──────────────────────────────────────────────────────────
function DropZone({ onFile, onSample }) {
  const [over, setOver] = useS2(false);
  const inputRef = useR2(null);

  const handleDrop = (e) => {
    e.preventDefault(); setOver(false);
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div style={{ height:'100%', padding:'28px 32px 32px',
      display:'flex', flexDirection:'column', gap:24 }}>

      <div
        onDragEnter={e=>{e.preventDefault();setOver(true)}}
        onDragOver={e=>{e.preventDefault();setOver(true)}}
        onDragLeave={()=>setOver(false)}
        onDrop={handleDrop}
        onClick={()=>inputRef.current?.click()}
        style={{
          flex:1, position:'relative', borderRadius:14,
          background: over ? 'var(--accent-softer)' : '#fbfaf6',
          border:`1.5px dashed ${over ? 'var(--accent)' : 'var(--hair-2)'}`,
          transition:'all 180ms ease', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          minHeight: 280,
        }}
      >
        <input ref={inputRef} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e=>{ const f=e.target.files?.[0]; if(f) onFile(f); }}/>

        <div style={{ textAlign:'center', maxWidth:420 }}>
          <DropIllustration over={over}/>
          <div style={{
            fontFamily:'Fraunces, serif', fontWeight:500, fontSize:22,
            letterSpacing:'-0.01em', color:'var(--ink)', marginTop:18, marginBottom:6,
          }}>
            {over ? 'Drop to begin' : 'Drag a photo here'}
          </div>
          <div style={{ fontSize:13.5, color:'var(--ink-3)', marginBottom:18 }}>
            {over ? 'Release to load this image' : 'or click anywhere in this area to browse'}
          </div>
          <div style={{ display:'flex', justifyContent:'center', gap:10, alignItems:'center' }}>
            <button onClick={(e)=>{ e.stopPropagation(); inputRef.current?.click(); }}
              style={{
                appearance:'none', border:0, cursor:'pointer',
                background:'var(--accent)', color:'#fff',
                fontFamily:'inherit', fontSize:13.5, fontWeight:500,
                padding:'10px 18px', borderRadius:9,
                boxShadow:'0 1px 0 rgba(255,255,255,0.2) inset, 0 4px 10px -4px rgba(80,110,80,0.5)',
              }}>Choose file…</button>
            <span style={{ fontSize:12, color:'var(--ink-4)' }}>JPG, PNG, HEIC up to 30 MB</span>
          </div>
        </div>
      </div>

      {/* Samples row */}
      <div>
        <div style={{
          fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase',
          color:'var(--ink-3)', marginBottom:10,
        }}>Or try a sample</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12 }}>
          {SAMPLE_PHOTOS.map(p=>(
            <button key={p.id} onClick={()=>onSample(p)}
              style={{
                appearance:'none', border:'0.5px solid var(--hair)', background:'#fff',
                padding:0, borderRadius:10, overflow:'hidden', cursor:'pointer',
                textAlign:'left', display:'flex', alignItems:'center', gap:12,
                paddingRight:14,
                transition:'all 160ms ease',
              }}
              onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='var(--hair)'}
            >
              <PhotoBitmap photo={p} style={{ width:56, height:56, flexShrink:0 }}/>
              <div style={{ minWidth:0 }}>
                <div style={{
                  fontFamily:'Fraunces, serif', fontWeight:500, fontSize:14.5,
                  color:'var(--ink)', marginBottom:2,
                }}>{p.species}</div>
                <div style={{
                  fontSize:11, color:'var(--ink-3)',
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                }}>{p.name}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DropIllustration({ over }) {
  return (
    <div style={{
      width:64, height:64, margin:'0 auto', borderRadius:16,
      background: over ? 'var(--accent)' : 'var(--accent-softer)',
      color: over ? '#fff' : 'var(--accent-deep)',
      display:'flex', alignItems:'center', justifyContent:'center',
      transition:'all 180ms ease',
      transform: over ? 'translateY(-2px) scale(1.05)' : 'none',
      boxShadow: over
        ? '0 14px 28px -10px rgba(80,110,80,0.45)'
        : '0 0 0 0.5px rgba(106,133,102,0.2)',
    }}>
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
        <rect x="5" y="6" width="20" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.6"/>
        <circle cx="11.5" cy="12" r="1.6" fill="currentColor"/>
        <path d="M5 19l5-5 5 5 4-4 6 6" stroke="currentColor" strokeWidth="1.6"
          strokeLinejoin="round" fill="none"/>
        <path d="M15 24v4M13 26l2 2 2-2" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Crop stage — photo with draggable / resizable rectangle
// ──────────────────────────────────────────────────────────
function CropStage({ photo, crop, setCrop, onCancel, onIdentify }) {
  const stageRef = useR2(null);
  const drag = useR2(null);

  const onMouseDown = (mode) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const rect = stageRef.current.getBoundingClientRect();
    drag.current = { mode, startX:e.clientX, startY:e.clientY, rect, init:{...crop} };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };
  const onMouseMove = (e) => {
    if (!drag.current) return;
    const { mode, startX, startY, rect, init } = drag.current;
    const dx = ((e.clientX - startX) / rect.width)  * 100;
    const dy = ((e.clientY - startY) / rect.height) * 100;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let { x, y, w, h } = init;
    if (mode==='move') {
      x = clamp(x+dx, 0, 100-w);
      y = clamp(y+dy, 0, 100-h);
    } else {
      const minS = 12;
      if (mode.includes('e')) w = clamp(init.w+dx, minS, 100-init.x);
      if (mode.includes('s')) h = clamp(init.h+dy, minS, 100-init.y);
      if (mode.includes('w')) {
        const nx = clamp(init.x+dx, 0, init.x+init.w-minS);
        w = init.w + (init.x - nx); x = nx;
      }
      if (mode.includes('n')) {
        const ny = clamp(init.y+dy, 0, init.y+init.h-minS);
        h = init.h + (init.y - ny); y = ny;
      }
    }
    setCrop({ x, y, w, h });
  };
  const onMouseUp = () => {
    drag.current = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  return (
    <div style={{ height:'100%', display:'grid', gridTemplateColumns:'1fr 280px',
      gap:0, minHeight:0 }}>
      {/* photo + crop */}
      <div style={{ padding:'24px 8px 24px 32px', minHeight:0,
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div ref={stageRef} style={{
          position:'relative', aspectRatio:'4/3', maxHeight:'100%', width:'100%',
          maxWidth: 720,
          borderRadius:12, overflow:'hidden',
          boxShadow:'0 10px 24px -10px rgba(20,30,20,0.25), 0 0 0 0.5px rgba(0,0,0,0.1)',
        }}>
          <PhotoBitmap photo={photo} style={{ position:'absolute', inset:0 }}/>
          {/* dim everything outside crop */}
          <div style={{
            position:'absolute', inset:0,
            background:'rgba(15,20,15,0.55)',
            clipPath: `polygon(
              0 0, 100% 0, 100% 100%, 0 100%, 0 0,
              ${crop.x}% ${crop.y}%,
              ${crop.x}% ${crop.y+crop.h}%,
              ${crop.x+crop.w}% ${crop.y+crop.h}%,
              ${crop.x+crop.w}% ${crop.y}%,
              ${crop.x}% ${crop.y}%
            )`,
          }}/>
          {/* crop rect */}
          <div
            onMouseDown={onMouseDown('move')}
            style={{
              position:'absolute',
              left:`${crop.x}%`, top:`${crop.y}%`,
              width:`${crop.w}%`, height:`${crop.h}%`,
              boxShadow:'0 0 0 1.5px #fff, 0 0 0 2.5px rgba(0,0,0,0.25)',
              cursor:'move',
            }}
          >
            {/* rule-of-thirds grid */}
            <svg width="100%" height="100%" style={{ position:'absolute', inset:0,
              pointerEvents:'none', opacity:0.5 }}>
              <line x1="33.33%" y1="0" x2="33.33%" y2="100%" stroke="#fff" strokeWidth="0.5"/>
              <line x1="66.66%" y1="0" x2="66.66%" y2="100%" stroke="#fff" strokeWidth="0.5"/>
              <line x1="0" y1="33.33%" x2="100%" y2="33.33%" stroke="#fff" strokeWidth="0.5"/>
              <line x1="0" y1="66.66%" x2="100%" y2="66.66%" stroke="#fff" strokeWidth="0.5"/>
            </svg>
            {/* handles */}
            {['nw','n','ne','e','se','s','sw','w'].map(m=>(
              <Handle key={m} mode={m} onMouseDown={onMouseDown(m)}/>
            ))}
            {/* size readout */}
            <div style={{
              position:'absolute', left:'50%', bottom:-26, transform:'translateX(-50%)',
              fontFamily:'JetBrains Mono, monospace', fontSize:10.5,
              color:'#fff', background:'rgba(0,0,0,0.7)',
              padding:'2px 7px', borderRadius:4, whiteSpace:'nowrap',
              pointerEvents:'none',
            }}>
              {Math.round(crop.w*10.24)} × {Math.round(crop.h*10.24*0.75)} px
            </div>
          </div>
        </div>
      </div>

      {/* side panel */}
      <div style={{
        borderLeft:'0.5px solid var(--hair)',
        padding:'24px 28px', display:'flex', flexDirection:'column',
      }}>
        <div style={{
          fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase',
          color:'var(--ink-3)', marginBottom:12,
        }}>Photo</div>
        <div style={{
          fontSize:13, color:'var(--ink-2)', marginBottom:4,
          fontFamily:'JetBrains Mono, monospace',
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        }}>{photo.name}</div>
        <div style={{ fontSize:11.5, color:'var(--ink-4)', marginBottom:24 }}>
          1024 × 768 · 248 KB
        </div>

        <div style={{
          fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase',
          color:'var(--ink-3)', marginBottom:10,
        }}>Aspect ratio</div>
        <div style={{
          display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6, marginBottom:22,
        }}>
          {[
            {label:'Free', val:null},
            {label:'1:1',  val:1},
            {label:'4:3',  val:4/3},
            {label:'16:9', val:16/9},
          ].map(r => (
            <button key={r.label} onClick={()=>{
              if (!r.val) return;
              const w = crop.w;
              const newH = w * (3/4) / r.val;
              setCrop({ ...crop, h: Math.min(newH, 100-crop.y) });
            }} style={{
              appearance:'none', border:'0.5px solid var(--hair-2)',
              background:'#fff', color:'var(--ink-2)',
              fontFamily:'inherit', fontSize:12, padding:'7px 0',
              borderRadius:6, cursor:'pointer',
            }}>{r.label}</button>
          ))}
        </div>

        <div style={{
          fontSize:12, lineHeight:1.55, color:'var(--ink-3)',
          padding:'12px 14px', background:'var(--accent-softer)',
          borderRadius:8, border:'0.5px solid rgba(106,133,102,0.18)',
          marginBottom:24,
        }}>
          <strong style={{ fontWeight:600, color:'var(--accent-deep)' }}>Tip:</strong>{' '}
          Tighten the crop around the animal's head and body for better accuracy.
        </div>

        <div style={{ flex:1 }}/>

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel} style={{
            flex:'0 0 auto', appearance:'none', border:'0.5px solid var(--hair-2)',
            background:'transparent', color:'var(--ink-2)',
            fontFamily:'inherit', fontSize:13, fontWeight:500,
            padding:'0 16px', height:40, borderRadius:9, cursor:'pointer',
          }}>Cancel</button>
          <button onClick={onIdentify} style={{
            flex:1, appearance:'none', border:0,
            background:'var(--accent)', color:'#fff',
            fontFamily:'inherit', fontSize:13.5, fontWeight:500,
            padding:'0 16px', height:40, borderRadius:9, cursor:'pointer',
            display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8,
            boxShadow:'0 1px 0 rgba(255,255,255,0.2) inset, 0 4px 10px -4px rgba(80,110,80,0.5)',
          }}>
            Identify
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function Handle({ mode, onMouseDown }) {
  const positions = {
    nw:{ left:-4, top:-4, cursor:'nwse-resize' },
    n: { left:'50%', top:-4, transform:'translateX(-50%)', cursor:'ns-resize' },
    ne:{ right:-4, top:-4, cursor:'nesw-resize' },
    e: { right:-4, top:'50%', transform:'translateY(-50%)', cursor:'ew-resize' },
    se:{ right:-4, bottom:-4, cursor:'nwse-resize' },
    s: { left:'50%', bottom:-4, transform:'translateX(-50%)', cursor:'ns-resize' },
    sw:{ left:-4, bottom:-4, cursor:'nesw-resize' },
    w: { left:-4, top:'50%', transform:'translateY(-50%)', cursor:'ew-resize' },
  };
  return (
    <div onMouseDown={onMouseDown}
      style={{
        position:'absolute', width:10, height:10, background:'#fff',
        boxShadow:'0 0 0 1px rgba(0,0,0,0.3)', borderRadius:1, ...positions[mode],
      }}/>
  );
}

// ──────────────────────────────────────────────────────────
// Identify stage — progress bar; transitions to result
// ──────────────────────────────────────────────────────────
function IdentifyStage({ photo, crop, progress, done, onAnother }) {
  return (
    <div style={{ height:'100%', display:'grid', gridTemplateColumns:'1fr 1fr',
      gap:0, minHeight:0 }}>
      {/* cropped photo, full bleed in this column */}
      <div style={{ position:'relative', overflow:'hidden',
        background:'#1a1d1a',
        borderRight:'0.5px solid var(--hair)' }}>
        <CroppedPhoto photo={photo} crop={crop} done={done}/>
      </div>

      {/* result panel */}
      <div style={{ padding:'40px 40px 32px', display:'flex', flexDirection:'column',
        minHeight:0, overflow:'auto' }}>
        {!done ? (
          <IdentifyingPanel photo={photo} progress={progress}/>
        ) : (
          <ResultPanel photo={photo} onAnother={onAnother}/>
        )}
      </div>
    </div>
  );
}

function CroppedPhoto({ photo, crop, done }) {
  // Show the full photo; overlay a rectangle ring on the crop region.
  // After "done", subtly highlight.
  return (
    <>
      <PhotoBitmap photo={photo} style={{ position:'absolute', inset:0 }}/>
      <div style={{
        position:'absolute', inset:0, background:'rgba(15,20,15,0.5)',
        transition:'opacity 400ms ease', opacity: done ? 0.35 : 0.55,
        clipPath: `polygon(
          0 0, 100% 0, 100% 100%, 0 100%, 0 0,
          ${crop.x}% ${crop.y}%,
          ${crop.x}% ${crop.y+crop.h}%,
          ${crop.x+crop.w}% ${crop.y+crop.h}%,
          ${crop.x+crop.w}% ${crop.y}%,
          ${crop.x}% ${crop.y}%
        )`,
      }}/>
      <div style={{
        position:'absolute',
        left:`${crop.x}%`, top:`${crop.y}%`,
        width:`${crop.w}%`, height:`${crop.h}%`,
        boxShadow: done
          ? '0 0 0 2px var(--accent), 0 0 0 4px rgba(106,133,102,0.35)'
          : '0 0 0 1.5px #fff',
        transition:'all 400ms ease',
      }}>
        {!done && <ScanLine/>}
      </div>
      {/* corner readout */}
      <div style={{
        position:'absolute', left:16, top:14,
        fontFamily:'JetBrains Mono, monospace', fontSize:10.5,
        color:'rgba(255,255,255,0.85)', letterSpacing:'0.04em',
        display:'inline-flex', alignItems:'center', gap:8,
      }}>
        <span style={{ width:6, height:6, borderRadius:'50%',
          background: done?'#7eda6e':'#e8d66a',
          boxShadow: done?'0 0 6px #7eda6e':'0 0 6px #e8d66a' }}/>
        {photo.name}
      </div>
    </>
  );
}

function ScanLine() {
  return (
    <div style={{
      position:'absolute', left:0, right:0, height:36,
      background:'linear-gradient(180deg, transparent, rgba(180,220,170,0.55), transparent)',
      borderTop:'1px solid rgba(180,220,170,0.9)',
      animation:'scan 1.6s ease-in-out infinite',
      mixBlendMode:'screen',
      pointerEvents:'none',
    }}/>
  );
}

function IdentifyingPanel({ photo, progress }) {
  const pct = Math.round(progress*100);
  // staged labels
  const stageLabel =
    progress < 0.25 ? 'Loading model into memory'
    : progress < 0.55 ? 'Extracting features from crop'
    : progress < 0.85 ? 'Matching against species index'
    : 'Ranking candidates';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24, height:'100%' }}>
      <div>
        <div style={{
          fontSize:11, fontWeight:600, letterSpacing:'0.14em', textTransform:'uppercase',
          color:'var(--accent-deep)', marginBottom:10,
        }}>Working on‑device</div>
        <div style={{
          fontFamily:'Fraunces, serif', fontSize:28, fontWeight:500,
          letterSpacing:'-0.015em', color:'var(--ink)', marginBottom:6, lineHeight:1.15,
        }}>Identifying your photo</div>
        <div style={{ fontSize:13.5, color:'var(--ink-3)', lineHeight:1.55 }}>
          The model is comparing the cropped region against
          {' '}<strong style={{ fontWeight:600, color:'var(--ink-2)' }}>11,420 species</strong>.
          This takes a couple of seconds.
        </div>
      </div>

      <div>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8,
        }}>
          <div style={{
            fontSize:13, color:'var(--ink-2)', fontWeight:500,
            display:'inline-flex', alignItems:'center', gap:8,
          }}>
            <Spinner/>
            {stageLabel}
          </div>
          <div style={{
            fontFamily:'JetBrains Mono, monospace', fontSize:12,
            color:'var(--ink-3)', fontVariantNumeric:'tabular-nums',
          }}>{pct}%</div>
        </div>
        <div style={{
          height:6, borderRadius:999, background:'var(--accent-softer)', overflow:'hidden',
        }}>
          <div style={{
            width:`${pct}%`, height:'100%',
            background:'linear-gradient(90deg, var(--accent-deep), var(--accent))',
            borderRadius:999, position:'relative', overflow:'hidden',
            transition:'width 80ms linear',
          }}>
            <div style={{
              position:'absolute', inset:0,
              background:'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
              animation:'shimmer 1.2s linear infinite',
            }}/>
          </div>
        </div>
      </div>

      {/* checkpoints */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {[
          { label:'Load model',         at:0.25 },
          { label:'Extract features',   at:0.55 },
          { label:'Match species',      at:0.85 },
          { label:'Rank candidates',    at:1.00 },
        ].map((c,i)=>{
          const reached = progress >= c.at - 0.001;
          const active  = progress < c.at && (i===0 || progress >= [0,0.25,0.55,0.85][i] - 0.001);
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10,
              fontSize:12.5, color: reached?'var(--ink-2)':'var(--ink-4)' }}>
              <CheckpointDot reached={reached} active={active}/>
              <span style={{ fontWeight: reached?500:400 }}>{c.label}</span>
              {reached && (
                <span style={{ marginLeft:'auto', fontFamily:'JetBrains Mono, monospace',
                  fontSize:10.5, color:'var(--ink-4)' }}>
                  {Math.round(c.at*1.8*100)/100}s
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ flex:1 }}/>

      <div style={{
        fontSize:11.5, color:'var(--ink-4)', display:'flex', alignItems:'center', gap:6,
      }}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <rect x="2" y="5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1"/>
          <path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1"/>
        </svg>
        Nothing leaves your computer.
      </div>
    </div>
  );
}

function CheckpointDot({ reached, active }) {
  return (
    <span style={{
      width:14, height:14, borderRadius:'50%', flexShrink:0,
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      background: reached ? 'var(--accent)' : '#fff',
      border: reached ? '0' : '1px solid var(--ink-4)',
      boxShadow: active && !reached ? '0 0 0 3px rgba(106,133,102,0.18)' : 'none',
      transition:'all 200ms ease',
    }}>
      {reached && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M2 4l1.5 1.5L6.5 2.5" stroke="#fff" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </span>
  );
}

// ──────────────────────────────────────────────────────────
// Result — top match + alternates + actions
// ──────────────────────────────────────────────────────────
function ResultPanel({ photo, onAnother }) {
  const alts = [
    { species:'Gray Fox',    latin:'Urocyon cinereoargenteus', confidence:0.04 },
    { species:'Coyote',      latin:'Canis latrans',            confidence:0.012 },
    { species:'Kit Fox',     latin:'Vulpes macrotis',          confidence:0.005 },
  ];
  const [saved, setSaved] = useS2(false);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:22, height:'100%' }}>
      <div>
        <div style={{
          fontSize:11, fontWeight:600, letterSpacing:'0.14em', textTransform:'uppercase',
          color:'var(--accent-deep)', marginBottom:8,
          display:'inline-flex', alignItems:'center', gap:8,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="5" fill="var(--accent)"/>
            <path d="M3.5 6.2l2 2L9 4.5" stroke="#fff" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          Identified
        </div>
        <div style={{
          fontFamily:'Fraunces, serif', fontSize:34, fontWeight:500,
          letterSpacing:'-0.02em', color:'var(--ink)', lineHeight:1.1, marginBottom:4,
        }}>{photo.species}</div>
        <div style={{
          fontFamily:'Fraunces, serif', fontStyle:'italic', fontSize:16,
          color:'var(--ink-3)',
        }}>{photo.latin}</div>
      </div>

      {/* confidence */}
      <div>
        <div style={{
          fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase',
          color:'var(--ink-3)', marginBottom:8,
        }}>Confidence</div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1, height:8, background:'var(--accent-softer)',
            borderRadius:999, overflow:'hidden' }}>
            <div style={{ width:`${photo.confidence*100}%`, height:'100%',
              background:'var(--accent)', borderRadius:999 }}/>
          </div>
          <div style={{
            fontFamily:'Fraunces, serif', fontSize:22, fontWeight:500,
            color:'var(--ink)', fontVariantNumeric:'tabular-nums',
          }}>{Math.round(photo.confidence*100)}%</div>
        </div>
      </div>

      {/* taxonomy chips */}
      <div style={{
        display:'flex', flexWrap:'wrap', gap:6,
        padding:'12px 14px', background:'#fbfaf6', borderRadius:8,
        border:'0.5px solid var(--hair)',
      }}>
        {[
          ['Kingdom','Animalia'],
          ['Class','Mammalia'],
          ['Family','Canidae'],
          ['Status','Least concern'],
        ].map(([k,v])=>(
          <div key={k} style={{ display:'inline-flex', alignItems:'baseline', gap:6,
            padding:'2px 4px' }}>
            <span style={{ fontSize:10, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase', color:'var(--ink-4)' }}>{k}</span>
            <span style={{ fontSize:12.5, color:'var(--ink-2)', fontWeight:450 }}>{v}</span>
          </div>
        ))}
      </div>

      {/* alternates */}
      <div>
        <div style={{
          fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase',
          color:'var(--ink-3)', marginBottom:8,
        }}>Other possibilities</div>
        <div style={{ display:'flex', flexDirection:'column' }}>
          {alts.map((a,i)=>(
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:12,
              padding:'10px 0',
              borderBottom: i<alts.length-1 ? '0.5px solid var(--hair)' : 'none',
            }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13.5, color:'var(--ink-2)', fontWeight:450 }}>
                  {a.species}{' '}
                  <span style={{ fontFamily:'Fraunces, serif', fontStyle:'italic',
                    fontSize:12, color:'var(--ink-4)' }}>{a.latin}</span>
                </div>
              </div>
              <div style={{ width:80, height:4, background:'var(--accent-softer)',
                borderRadius:999, overflow:'hidden' }}>
                <div style={{ width:`${a.confidence*100*5}%`, height:'100%',
                  background:'var(--ink-4)', borderRadius:999 }}/>
              </div>
              <div style={{
                width:42, textAlign:'right', fontSize:12, color:'var(--ink-3)',
                fontVariantNumeric:'tabular-nums',
              }}>{(a.confidence*100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex:1 }}/>

      {/* actions */}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={()=>setSaved(true)} style={{
          flex:1, appearance:'none', border:0,
          background: saved ? 'var(--accent-deep)' : 'var(--accent)',
          color:'#fff', fontFamily:'inherit', fontSize:13.5, fontWeight:500,
          padding:'0 16px', height:42, borderRadius:9, cursor:'pointer',
          display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8,
          boxShadow:'0 1px 0 rgba(255,255,255,0.2) inset, 0 4px 10px -4px rgba(80,110,80,0.5)',
        }}>
          {saved ? (<>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 7.2l3 3 5-5.4" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Saved to collection
          </>) : (<>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 2h8v10l-4-2.5L3 12V2z" stroke="currentColor" strokeWidth="1.4"
                strokeLinejoin="round" fill="none"/>
            </svg>
            Save to collection
          </>)}
        </button>
        <button onClick={onAnother} style={{
          appearance:'none', border:'0.5px solid var(--hair-2)',
          background:'#fff', color:'var(--ink-2)',
          fontFamily:'inherit', fontSize:13, fontWeight:500,
          padding:'0 18px', height:42, borderRadius:9, cursor:'pointer',
        }}>Identify another</button>
      </div>
    </div>
  );
}

Object.assign(window, { IdentifyTab, SAMPLE_PHOTOS, PhotoBitmap });
