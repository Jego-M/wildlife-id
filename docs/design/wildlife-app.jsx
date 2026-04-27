// Wildlife ID — first-launch onboarding
// Two screens: Welcome → Choose Model (with download state)

const { useState, useEffect, useRef, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#6a8566",
  "screen": "app",
  "downloadSpeed": 1.0,
  "showGrain": true,
  "tab": "settings",
  "identifyStage": "empty",
  "identifySpeed": 1.0,
  "activeModel": "fast",
  "installedModels": ["fast"]
}/*EDITMODE-END*/;

// ────────────────────────────────────────────────────────────
// Desktop window chrome — minimal, no sidebar
// ────────────────────────────────────────────────────────────
function WindowChrome({ children, width = 1120, height = 740, showWordmark = true }) {
  return (
    <div style={{
      width, height, borderRadius: 14, overflow: 'hidden',
      background: 'var(--bg-app)',
      boxShadow:
        '0 0 0 0.5px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.9) inset, ' +
        '0 30px 60px -20px rgba(20,25,20,0.35), 0 60px 120px -40px rgba(20,25,20,0.25)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, -apple-system, sans-serif',
      position: 'relative',
    }}>
      <TitleBar showWordmark={showWordmark}/>
      <div style={{ flex: 1, position:'relative', overflow:'hidden' }}>{children}</div>
    </div>
  );
}

function TitleBar({ showWordmark = true }) {
  const dot = (bg) => (
    <div style={{
      width:12,height:12,borderRadius:'50%',background:bg,
      boxShadow:'inset 0 0 0 0.5px rgba(0,0,0,0.18)'
    }}/>
  );
  return (
    <div style={{
      height: 38, flexShrink:0,
      background: 'linear-gradient(#fbfaf6, #f3f0e8)',
      borderBottom: '0.5px solid var(--hair)',
      display:'flex', alignItems:'center', padding:'0 14px',
      position:'relative', zIndex:2,
    }}>
      <div style={{ display:'flex', gap:8 }}>
        {dot('#ff6057')}{dot('#febc2e')}{dot('#28c840')}
      </div>
      {showWordmark && (
        <div style={{
          position:'absolute', left:0, right:0, textAlign:'center',
          fontSize:12, fontWeight:500, color:'var(--ink-3)', letterSpacing:'0.01em',
          pointerEvents:'none',
        }}>
          <Wordmark small/>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Wordmark — small glyph + name
// ────────────────────────────────────────────────────────────
function Wordmark({ small=false, large=false }) {
  const size = large ? 28 : small ? 14 : 18;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap: large?12:6, whiteSpace:'nowrap' }}>
      <AppGlyph size={large ? 26 : small ? 14 : 18}/>
      <span style={{
        fontFamily:'Fraunces, serif',
        fontWeight:500, fontSize: size,
        letterSpacing: large ? '-0.02em' : '-0.005em',
        color: large ? 'var(--ink)' : 'var(--ink-2)',
        whiteSpace:'nowrap',
      }}>
        Wildlife&nbsp;<span style={{ fontStyle:'italic', fontWeight:400, color: large? 'var(--accent-deep)':'var(--ink-3)', whiteSpace:'nowrap' }}>ID</span>
      </span>
    </span>
  );
}

// a simple, grown-up mark: concentric arcs suggesting a lens / aperture
function AppGlyph({ size=18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="var(--accent-deep)" strokeWidth="1.25"/>
      <circle cx="12" cy="12" r="5.5" fill="var(--accent-soft)" stroke="var(--accent-deep)" strokeWidth="1.25"/>
      <circle cx="12" cy="12" r="1.6" fill="var(--accent-deep)"/>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// Buttons
// ────────────────────────────────────────────────────────────
function PrimaryButton({ children, onClick, disabled, style }) {
  const [hover, setHover] = useState(false);
  const [down, setDown] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>{setHover(false);setDown(false)}}
      onMouseDown={()=>setDown(true)} onMouseUp={()=>setDown(false)}
      disabled={disabled}
      style={{
        appearance:'none', border:0, cursor: disabled?'not-allowed':'pointer',
        fontFamily:'inherit', fontSize:14, fontWeight:500, letterSpacing:'0.005em',
        color:'#fff',
        padding:'0 22px', height:44, borderRadius:10,
        background: disabled
          ? '#c8ccc5'
          : down ? 'var(--accent-deep)'
          : hover ? '#5c7658'
          : 'var(--accent)',
        boxShadow: disabled
          ? 'none'
          : '0 1px 0 rgba(255,255,255,0.2) inset, 0 -1px 0 rgba(0,0,0,0.12) inset, 0 1px 2px rgba(30,50,30,0.18), 0 6px 16px -6px rgba(80,110,80,0.4)',
        transform: down && !disabled ? 'translateY(0.5px)' : 'none',
        transition: 'background 120ms ease, transform 80ms ease',
        display:'inline-flex', alignItems:'center', gap:8,
        ...style,
      }}
    >{children}</button>
  );
}

function GhostButton({ children, onClick, style }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{
        appearance:'none', border:'0.5px solid var(--hair-2)',
        background: hover? 'rgba(0,0,0,0.03)' : 'transparent',
        cursor:'pointer', fontFamily:'inherit', fontSize:14, fontWeight:500,
        color:'var(--ink-2)', padding:'0 18px', height:44, borderRadius:10,
        ...style,
      }}>{children}</button>
  );
}

// ────────────────────────────────────────────────────────────
// Step indicator — tiny, understated
// ────────────────────────────────────────────────────────────
function StepDots({ step }) {
  return (
    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
      {[0,1].map(i => (
        <div key={i} style={{
          width: i===step ? 18 : 6, height:6, borderRadius:999,
          background: i===step ? 'var(--accent)' : 'var(--ink-4)',
          opacity: i<=step ? 1 : 0.4,
          transition:'all 300ms cubic-bezier(.3,.7,.4,1)',
        }}/>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// SCREEN 1 — Welcome
// ────────────────────────────────────────────────────────────
function WelcomeScreen({ onContinue }) {
  return (
    <div style={{
      height:'100%', display:'grid', gridTemplateColumns:'1.05fr 1fr',
      background:'var(--bg-app)',
    }}>
      {/* Left: copy */}
      <div style={{
        padding:'72px 72px 48px', display:'flex', flexDirection:'column',
        justifyContent:'space-between',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <Wordmark large/>
          <StepDots step={0}/>
        </div>

        <div style={{ maxWidth: 460 }}>
          <div style={{
            fontSize:12, fontWeight:600, letterSpacing:'0.14em',
            textTransform:'uppercase', color:'var(--accent-deep)', marginBottom:18,
          }}>Welcome</div>

          <h1 style={{
            fontFamily:'Fraunces, serif', fontWeight:400,
            fontSize:44, lineHeight:1.08, letterSpacing:'-0.02em',
            color:'var(--ink)', margin:'0 0 20px',
            textWrap:'balance',
          }}>
            Identify wildlife from your photos,<br/>
            <span style={{ fontStyle:'italic', color:'var(--accent-deep)' }}>right on your computer.</span>
          </h1>

          <p style={{
            fontSize:15.5, lineHeight:1.6, color:'var(--ink-2)', margin:'0 0 32px',
            maxWidth: 440, textWrap:'pretty',
          }}>
            Drop in a photo of an animal and Wildlife ID names the species using an
            on‑device AI model. Save findings to a personal collection that stays
            yours — it all works offline, and nothing ever leaves your machine.
          </p>

          <div style={{ display:'flex', gap:28, marginBottom:40 }}>
            <FeatureChip icon="offline" label="Fully offline"/>
            <FeatureChip icon="lock" label="Private by design"/>
            <FeatureChip icon="collection" label="Personal collection"/>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <PrimaryButton onClick={onContinue}>
              Get started
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </PrimaryButton>
            <span style={{ fontSize:13, color:'var(--ink-3)' }}>Takes about a minute</span>
          </div>
        </div>

        <div style={{ fontSize:12, color:'var(--ink-3)' }}>
          By continuing, you agree to the <a href="#" onClick={e=>e.preventDefault()} style={{
            color:'var(--ink-2)', textDecoration:'underline', textDecorationColor:'var(--ink-4)',
            textUnderlineOffset:3,
          }}>License Agreement</a>.
        </div>
      </div>

      {/* Right: decorative canvas */}
      <WelcomeArt/>
    </div>
  );
}

function FeatureChip({ icon, label }) {
  const icons = {
    offline: <path d="M2 10c3-3 9-3 12 0M4.5 12.5c2-2 5-2 7 0M7 15l1 1 1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/>,
    lock: <><rect x="3.5" y="7.5" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5" stroke="currentColor" strokeWidth="1.3" fill="none"/></>,
    collection: <><rect x="2.5" y="3.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M2.5 7h11M6 3.5v9" stroke="currentColor" strokeWidth="1.3"/></>,
  };
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={{
        width:26, height:26, borderRadius:8,
        background:'var(--accent-softer)',
        border:'0.5px solid rgba(106,133,102,0.25)',
        color:'var(--accent-deep)',
        display:'inline-flex', alignItems:'center', justifyContent:'center',
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16">{icons[icon]}</svg>
      </span>
      <span style={{ fontSize:13, fontWeight:450, color:'var(--ink-2)' }}>{label}</span>
    </div>
  );
}

// Decorative image panel — placeholder photo with metadata card
function WelcomeArt() {
  return (
    <div style={{
      position:'relative', overflow:'hidden',
      background:'linear-gradient(160deg, #ecece4 0%, #d9dbcd 100%)',
      borderLeft:'0.5px solid var(--hair)',
    }}>
      {/* subtle topographic lines */}
      <svg width="100%" height="100%" style={{ position:'absolute', inset:0, opacity:0.35 }}>
        <defs>
          <pattern id="topo" x="0" y="0" width="140" height="140" patternUnits="userSpaceOnUse">
            {[20,45,70,95,120].map((r,i)=>(
              <circle key={i} cx="70" cy="70" r={r} fill="none" stroke="#8a9183" strokeWidth="0.5"/>
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#topo)"/>
      </svg>

      {/* photo placeholder */}
      <div style={{
        position:'absolute', left:'8%', top:'14%', width:'72%', height:'58%',
        borderRadius:12, overflow:'hidden',
        boxShadow:'0 20px 40px -10px rgba(20,30,20,0.35), 0 0 0 0.5px rgba(0,0,0,0.15)',
        background:'repeating-linear-gradient(45deg,#b9b9ad 0 8px,#aeae9f 8px 16px)',
      }}>
        <div style={{
          position:'absolute', inset:0,
          background:'linear-gradient(180deg, rgba(80,90,70,0.25) 0%, rgba(40,50,35,0.45) 100%)',
        }}/>
        <div style={{
          position:'absolute', left:16, top:14, display:'flex', alignItems:'center', gap:8,
          fontFamily:'JetBrains Mono, monospace', fontSize:10.5, color:'rgba(255,255,255,0.85)',
          letterSpacing:'0.04em',
        }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'#e8d66a' }}/>
          IMG_4218.jpg · wildlife photo
        </div>
        <div style={{
          position:'absolute', right:16, bottom:16,
          fontFamily:'JetBrains Mono, monospace', fontSize:10, color:'rgba(255,255,255,0.7)',
        }}>1024 × 1536 · f/5.6 · 1/320s</div>
      </div>

      {/* result card — understated */}
      <div style={{
        position:'absolute', right:'6%', bottom:'10%', width:300,
        background:'#fff', borderRadius:12, padding:'18px 20px',
        boxShadow:'0 20px 50px -20px rgba(20,30,20,0.35), 0 0 0 0.5px rgba(0,0,0,0.06)',
        border:'0.5px solid var(--hair)',
      }}>
        <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'0.12em',
          textTransform:'uppercase', color:'var(--accent-deep)', marginBottom:6 }}>Identified</div>
        <div style={{ fontFamily:'Fraunces, serif', fontSize:22, fontWeight:500,
          letterSpacing:'-0.01em', color:'var(--ink)', marginBottom:2 }}>Red Fox</div>
        <div style={{ fontFamily:'Fraunces, serif', fontStyle:'italic', fontSize:13,
          color:'var(--ink-3)', marginBottom:14 }}>Vulpes vulpes</div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1, height:4, background:'var(--accent-softer)', borderRadius:999, overflow:'hidden' }}>
            <div style={{ width:'94%', height:'100%', background:'var(--accent)' }}/>
          </div>
          <span style={{ fontSize:12, fontWeight:500, color:'var(--ink-2)',
            fontVariantNumeric:'tabular-nums' }}>94%</span>
        </div>
        <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:10, display:'flex', gap:10 }}>
          <span>Mammalia</span><span style={{ color:'var(--ink-4)' }}>·</span>
          <span>Canidae</span><span style={{ color:'var(--ink-4)' }}>·</span>
          <span>Least concern</span>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// SCREEN 2 — Choose Your Model
// ────────────────────────────────────────────────────────────
function ModelScreen({ onBack, speed, onComplete }) {
  const [selected, setSelected] = useState('fast');
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!downloading) return;
    const start = performance.now();
    const total = (selected === 'fast' ? 8000 : 14000) / (speed || 1);
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / total);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [downloading, selected, speed]);

  const startDownload = () => { setProgress(0); setDone(false); setDownloading(true); };
  const reset = () => { setDownloading(false); setProgress(0); setDone(false); };

  return (
    <div style={{
      height:'100%', display:'flex', flexDirection:'column',
      background:'var(--bg-app)',
      padding:'32px 72px 40px',
    }}>
      {/* top bar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={onBack} style={{
          appearance:'none', border:0, background:'transparent',
          cursor:'pointer', color:'var(--ink-3)', fontFamily:'inherit', fontSize:13,
          display:'inline-flex', alignItems:'center', gap:6, padding:'6px 8px', marginLeft:-8,
          borderRadius:6,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
        <Wordmark/>
        <StepDots step={1}/>
      </div>

      {/* header */}
      <div style={{ marginTop: 44, marginBottom: 36, maxWidth: 680 }}>
        <div style={{
          fontSize:12, fontWeight:600, letterSpacing:'0.14em',
          textTransform:'uppercase', color:'var(--accent-deep)', marginBottom:14,
        }}>Step 2 of 2 · Choose a model</div>
        <h2 style={{
          fontFamily:'Fraunces, serif', fontWeight:400,
          fontSize:34, lineHeight:1.12, letterSpacing:'-0.015em',
          color:'var(--ink)', margin:'0 0 10px', textWrap:'balance',
        }}>
          Which AI model would you like to use?
        </h2>
        <p style={{ fontSize:14.5, lineHeight:1.55, color:'var(--ink-3)', margin:0, maxWidth:560 }}>
          Both run entirely on your device. Pick the one that suits your hardware —
          you can switch anytime.
        </p>
      </div>

      {/* cards */}
      <div style={{
        display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, maxWidth: 880,
      }}>
        <ModelCard
          id="fast" recommended
          name="Fast"
          subtitle="Best for most laptops"
          stats={[
            { label:'Speed',   value:'1–2 sec',  sub:'per image' },
            { label:'Size',    value:'600 MB',   sub:'download' },
            { label:'Hardware',value:'Any modern computer', sub:'' },
          ]}
          selected={selected==='fast'}
          disabled={downloading}
          onSelect={()=>setSelected('fast')}
          downloading={downloading && selected==='fast'}
          progress={progress} done={done}
        />
        <ModelCard
          id="accurate"
          name="Accurate"
          subtitle="Slightly more accurate, a bit slower"
          stats={[
            { label:'Speed',   value:'3–6 sec',  sub:'per image' },
            { label:'Size',    value:'1.7 GB',   sub:'download' },
            { label:'Hardware',value:'16 GB+ RAM recommended', sub:'' },
          ]}
          selected={selected==='accurate'}
          disabled={downloading}
          onSelect={()=>setSelected('accurate')}
          downloading={downloading && selected==='accurate'}
          progress={progress} done={done}
        />
      </div>

      {/* footer */}
      <div style={{ flex:1 }}/>
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        marginTop: 28,
      }}>
        <div style={{ fontSize:13, color:'var(--ink-3)' }}>
          You can switch models later in Settings.
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {done && (
            <span style={{
              fontSize:13, color:'var(--accent-deep)', fontWeight:500,
              display:'inline-flex', alignItems:'center', gap:6,
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" fill="var(--accent)"/>
                <path d="M4 7.2l2 2 4-4.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Ready
            </span>
          )}
          {downloading && !done && (
            <GhostButton onClick={reset} style={{ height:40 }}>Cancel</GhostButton>
          )}
          <PrimaryButton
            onClick={done ? onComplete : startDownload}
            disabled={downloading && !done}
            style={{ minWidth: 200, justifyContent:'center' }}
          >
            {done ? 'Open Wildlife ID'
              : downloading ? `Downloading… ${Math.round(progress*100)}%`
              : 'Download and continue'}
            {!downloading && (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function ModelCard({
  id, name, subtitle, stats, selected, recommended,
  onSelect, disabled, downloading, progress, done,
}) {
  const dim = disabled && !selected;
  return (
    <div
      role="button"
      onClick={disabled ? undefined : onSelect}
      style={{
        position:'relative',
        background:'var(--bg-card)',
        borderRadius:14,
        padding:'26px 26px 24px',
        cursor: disabled ? 'default' : 'pointer',
        border: selected
          ? '1.5px solid var(--accent)'
          : '0.5px solid var(--hair-2)',
        boxShadow: selected
          ? '0 0 0 4px rgba(106,133,102,0.12), 0 10px 28px -14px rgba(30,60,30,0.25)'
          : '0 1px 0 rgba(255,255,255,0.8) inset, 0 2px 6px -2px rgba(20,30,20,0.08)',
        transition:'all 200ms ease',
        opacity: dim ? 0.5 : 1,
        filter: dim ? 'saturate(0.6)' : 'none',
        minHeight: 300,
        display:'flex', flexDirection:'column',
      }}
    >
      {/* top row */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
            <h3 style={{
              fontFamily:'Fraunces, serif', fontWeight:500, fontSize:24,
              letterSpacing:'-0.01em', color:'var(--ink)', margin:0,
            }}>{name}</h3>
            {recommended && (
              <span style={{
                fontSize:10.5, fontWeight:600, letterSpacing:'0.08em',
                textTransform:'uppercase', color:'var(--accent-deep)',
                background:'var(--accent-softer)',
                border:'0.5px solid rgba(106,133,102,0.3)',
                padding:'3px 8px', borderRadius:999,
              }}>Recommended</span>
            )}
          </div>
          <div style={{ fontSize:13.5, color:'var(--ink-3)' }}>{subtitle}</div>
        </div>
        <SelectionMark selected={selected}/>
      </div>

      {/* stats */}
      <div style={{
        display:'grid', gridTemplateColumns:'repeat(3, 1fr)',
        borderTop:'0.5px solid var(--hair)',
        borderBottom:'0.5px solid var(--hair)',
        padding:'14px 0', margin:'6px 0 18px',
      }}>
        {stats.map((s,i)=>(
          <div key={i} style={{
            paddingLeft: i===0?0:14, paddingRight: i===2?0:14,
            borderRight: i<2 ? '0.5px solid var(--hair)' : 'none',
          }}>
            <div style={{
              fontSize:10, fontWeight:600, letterSpacing:'0.1em',
              textTransform:'uppercase', color:'var(--ink-4)', marginBottom:5,
            }}>{s.label}</div>
            <div style={{
              fontFamily:'Fraunces, serif', fontWeight:500, fontSize:16,
              color:'var(--ink)', letterSpacing:'-0.005em', lineHeight:1.2,
            }}>{s.value}</div>
            {s.sub && (
              <div style={{ fontSize:11.5, color:'var(--ink-3)', marginTop:2 }}>{s.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* bottom — description or progress */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
        {downloading ? (
          <DownloadStatus progress={progress} done={done} size={id==='fast'?'600 MB':'1.7 GB'}/>
        ) : (
          <p style={{
            fontSize:12.5, lineHeight:1.55, color:'var(--ink-3)', margin:0,
          }}>
            {id==='fast'
              ? 'A compact, distilled model tuned for everyday use. Handles common birds, mammals, reptiles, and insects with high confidence.'
              : 'A larger model with finer-grained recognition — better at subspecies, juveniles, and uncommon visitors. Needs more memory.'}
          </p>
        )}
      </div>
    </div>
  );
}

function SelectionMark({ selected }) {
  return (
    <div style={{
      width:22, height:22, borderRadius:'50%',
      border: selected ? '0px' : '1.5px solid var(--ink-4)',
      background: selected ? 'var(--accent)' : 'transparent',
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      flexShrink:0,
      transition:'all 180ms ease',
    }}>
      {selected && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 6.2l2 2 4-4.4" stroke="#fff" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}

function DownloadStatus({ progress, done, size }) {
  const pct = Math.round(progress*100);
  const downloaded = (progress * parseFloat(size)).toFixed(size.includes('GB')?2:0);
  const unit = size.split(' ')[1];
  return (
    <div>
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:8,
      }}>
        <div style={{
          fontSize:12.5, color: done? 'var(--accent-deep)':'var(--ink-2)',
          fontWeight:500, display:'inline-flex', alignItems:'center', gap:8,
        }}>
          {!done && <Spinner/>}
          {done ? 'Download complete' : 'Downloading model…'}
        </div>
        <div style={{
          fontFamily:'JetBrains Mono, monospace', fontSize:11.5,
          color:'var(--ink-3)', fontVariantNumeric:'tabular-nums',
        }}>
          {downloaded} / {size}
        </div>
      </div>
      <div style={{
        height:6, borderRadius:999, background:'var(--accent-softer)',
        overflow:'hidden', position:'relative',
      }}>
        <div style={{
          width:`${pct}%`, height:'100%',
          background: done
            ? 'var(--accent)'
            : 'linear-gradient(90deg, var(--accent-deep), var(--accent))',
          borderRadius:999,
          transition:'width 120ms linear',
          position:'relative', overflow:'hidden',
        }}>
          {!done && (
            <div style={{
              position:'absolute', inset:0,
              background:'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
              animation:'shimmer 1.4s linear infinite',
            }}/>
          )}
        </div>
      </div>
      <div style={{
        display:'flex', justifyContent:'space-between', marginTop:8,
        fontSize:11, color:'var(--ink-4)',
      }}>
        <span style={{ fontVariantNumeric:'tabular-nums' }}>{pct}%</span>
        <span>{done ? 'Ready to use' : estimateRemaining(progress)}</span>
      </div>
    </div>
  );
}

function estimateRemaining(p) {
  if (p < 0.02) return 'Starting…';
  if (p >= 1) return '';
  const frac = (1 - p);
  const secs = Math.max(1, Math.round(frac * 12));
  return `About ${secs} sec remaining`;
}

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation:'spin 1s linear infinite' }}>
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--ink-4)" strokeWidth="1.2" opacity="0.3"/>
      <path d="M6 1.5A4.5 4.5 0 0 1 10.5 6" stroke="var(--accent)" strokeWidth="1.5"
            strokeLinecap="round" fill="none"/>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// App shell — manages the two screens, wires Tweaks
// ────────────────────────────────────────────────────────────
function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = useState(tweaks.screen || 'welcome');
  const [transitioning, setTransitioning] = useState(false);

  // keep tweaks in sync when user toggles via panel
  useEffect(()=>{ if (tweaks.screen !== screen) setScreen(tweaks.screen); }, [tweaks.screen]);
  useEffect(()=>{
    document.documentElement.style.setProperty('--accent', tweaks.accent);
    // derive deep + softs from accent
    document.documentElement.style.setProperty('--accent-deep', shade(tweaks.accent, -0.18));
    document.documentElement.style.setProperty('--accent-soft', mix(tweaks.accent, '#ffffff', 0.82));
    document.documentElement.style.setProperty('--accent-softer', mix(tweaks.accent, '#ffffff', 0.92));
  }, [tweaks.accent]);

  const goTo = (s) => {
    setTransitioning(true);
    setTimeout(()=>{
      setScreen(s); setTweak('screen', s);
      requestAnimationFrame(()=>setTransitioning(false));
    }, 160);
  };

  return (
    <div data-screen-label={
      screen==='welcome'?'01 Welcome'
      : screen==='model'?'02 Choose Model'
      : '03 App · Identify'
    }>
      <WindowChrome showWordmark={screen!=='app'}>
        <div style={{
          height:'100%',
          opacity: transitioning ? 0 : 1,
          transform: transitioning ? 'translateY(6px)' : 'none',
          transition:'opacity 200ms ease, transform 240ms ease',
        }}>
          {screen==='welcome' && <WelcomeScreen onContinue={()=>goTo('model')}/>}
          {screen==='model'   && <ModelScreen onBack={()=>goTo('welcome')}
                                   onComplete={()=>goTo('app')}
                                   speed={tweaks.downloadSpeed}/>}
          {screen==='app'     && <AppShell tweaks={tweaks} setTweak={setTweak}/>}
        </div>
        {tweaks.showGrain && <GrainOverlay/>}
      </WindowChrome>

      <TweaksPanel>
        <TweakSection label="Flow"/>
        <TweakRadio label="Screen" value={tweaks.screen}
          options={[{value:'welcome',label:'Welcome'},{value:'model',label:'Model'},{value:'app',label:'App'}]}
          onChange={v=>{ setTweak('screen', v); setScreen(v); }}/>
        {screen==='app' && (
          <TweakRadio label="Identify stage" value={tweaks.identifyStage}
            options={[
              {value:'empty',label:'Empty'},
              {value:'crop',label:'Crop'},
              {value:'identifying',label:'Working'},
              {value:'result',label:'Result'},
            ]}
            onChange={v=>setTweak('identifyStage', v)}/>
        )}
        <TweakSlider label="Download speed" value={tweaks.downloadSpeed}
          min={0.3} max={4} step={0.1} unit="×"
          onChange={v=>setTweak('downloadSpeed', v)}/>
        <TweakSlider label="Identify speed" value={tweaks.identifySpeed}
          min={0.3} max={4} step={0.1} unit="×"
          onChange={v=>setTweak('identifySpeed', v)}/>
        <TweakSection label="Theme"/>
        <TweakColor label="Accent" value={tweaks.accent}
          onChange={v=>setTweak('accent', v)}
          presets={['#6a8566','#566c7c','#8a6d4a','#4f6a4c','#7a7e6a','#54707a']}/>
        <TweakToggle label="Film grain" value={tweaks.showGrain}
          onChange={v=>setTweak('showGrain', v)}/>
      </TweaksPanel>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// AppShell — post-onboarding home with sidebar tabs.
// ────────────────────────────────────────────────────────────
function AppShell({ tweaks, setTweak }) {
  const tab = tweaks.tab || 'identify';
  const setTab = (t) => setTweak('tab', t);

  return (
    <div style={{ height:'100%', display:'flex', minHeight:0,
      background:'var(--bg-app)' }}>
      <AppSidebar tab={tab} setTab={setTab}/>
      <div style={{ flex:1, display:'flex', flexDirection:'column',
        minWidth:0, minHeight:0,
        background:'#fff',
        borderLeft:'0.5px solid var(--hair)',
      }}>
        {tab === 'identify'   && <IdentifyTab tweaks={tweaks} setTweak={setTweak}/>}
        {tab === 'collection' && <CollectionTab tweaks={tweaks} setTweak={setTweak}/>}
        {tab === 'settings'   && <SettingsTab tweaks={tweaks} setTweak={setTweak}/>}
        {tab !== 'identify' && tab !== 'collection' && tab !== 'settings' && <ComingSoon tab={tab}/>}
      </div>
    </div>
  );
}

function AppSidebar({ tab, setTab }) {
  const items = [
    { id:'identify',   label:'Identify',   icon:'identify' },
    { id:'collection', label:'Collection', icon:'collection' },
    { id:'history',    label:'History',    icon:'history' },
    { id:'field',      label:'Field guide',icon:'field' },
  ];
  return (
    <div style={{
      width:200, flexShrink:0, padding:'18px 12px 14px',
      display:'flex', flexDirection:'column', gap:2,
      background:'#fbfaf6',
    }}>
      <div style={{ padding:'4px 10px 14px' }}>
        <Wordmark/>
      </div>
      <div style={{
        fontSize:10, fontWeight:600, letterSpacing:'0.12em',
        textTransform:'uppercase', color:'var(--ink-4)',
        padding:'8px 10px 4px',
      }}>Workspace</div>
      {items.map(it => {
        const active = tab===it.id;
        return (
          <button key={it.id} onClick={()=>setTab(it.id)} style={{
            appearance:'none', border:0, cursor:'pointer', textAlign:'left',
            display:'flex', alignItems:'center', gap:10,
            height:30, padding:'0 10px', borderRadius:7,
            background: active ? 'var(--accent-softer)' : 'transparent',
            color: active ? 'var(--accent-deep)' : 'var(--ink-2)',
            fontFamily:'inherit', fontSize:13, fontWeight: active? 500 : 450,
            transition:'background 120ms ease',
          }}>
            <SidebarIcon name={it.icon} active={active}/>
            <span>{it.label}</span>
          </button>
        );
      })}
      <div style={{ flex:1 }}/>
      <button onClick={()=>setTab('settings')} style={{
        appearance:'none', border:0, cursor:'pointer', textAlign:'left',
        display:'flex', alignItems:'center', gap:10,
        height:30, padding:'0 10px', borderRadius:7,
        background: tab==='settings' ? 'var(--accent-softer)' : 'transparent',
        color: tab==='settings' ? 'var(--accent-deep)' : 'var(--ink-3)',
        fontFamily:'inherit', fontSize:13,
      }}>
        <SidebarIcon name="settings"/>
        <span>Settings</span>
      </button>
    </div>
  );
}

function SidebarIcon({ name, active }) {
  const stroke = 'currentColor';
  const sw = 1.4;
  const paths = {
    identify: <><circle cx="8" cy="8" r="4.5" fill="none" stroke={stroke} strokeWidth={sw}/>
      <path d="M11.2 11.2L14 14" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/></>,
    collection: <><rect x="2.5" y="3.5" width="11" height="9" rx="1.5" fill="none" stroke={stroke} strokeWidth={sw}/>
      <path d="M2.5 7h11M6 3.5v9" stroke={stroke} strokeWidth={sw}/></>,
    history: <><circle cx="8" cy="8" r="5.5" fill="none" stroke={stroke} strokeWidth={sw}/>
      <path d="M8 5v3l2 1.5" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/></>,
    field: <><path d="M3 3.5h7a3 3 0 0 1 3 3v6.5H6a3 3 0 0 1-3-3v-6.5z" fill="none" stroke={stroke} strokeWidth={sw}/>
      <path d="M3 6.5h10" stroke={stroke} strokeWidth={sw}/></>,
    settings: <><circle cx="8" cy="8" r="2.2" fill="none" stroke={stroke} strokeWidth={sw}/>
      <path d="M8 2.5v1.5M8 12v1.5M2.5 8h1.5M12 8h1.5M4.2 4.2l1 1M10.8 10.8l1 1M11.8 4.2l-1 1M5.2 10.8l-1 1"
        stroke={stroke} strokeWidth={sw} strokeLinecap="round"/></>,
  };
  return (
    <span style={{
      width:18, height:18, display:'inline-flex', alignItems:'center', justifyContent:'center',
      opacity: active ? 1 : 0.75,
    }}>
      <svg width="16" height="16" viewBox="0 0 16 16">{paths[name]}</svg>
    </span>
  );
}

function ComingSoon({ tab }) {
  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
      flexDirection:'column', gap:10, color:'var(--ink-3)' }}>
      <div style={{ fontFamily:'Fraunces, serif', fontSize:22, color:'var(--ink-2)',
        textTransform:'capitalize' }}>{tab}</div>
      <div style={{ fontSize:13 }}>Not part of this design pass.</div>
    </div>
  );
}

// Soft grain overlay — adds a hint of texture, easy to toggle off
function GrainOverlay() {
  return (
    <div aria-hidden style={{
      position:'absolute', inset:0, pointerEvents:'none',
      mixBlendMode:'multiply', opacity:0.035, zIndex:3,
      backgroundImage:
        'url("data:image/svg+xml;utf8,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"200\\" height=\\"200\\"><filter id=\\"n\\"><feTurbulence type=\\"fractalNoise\\" baseFrequency=\\"0.9\\" numOctaves=\\"2\\" stitchTiles=\\"stitch\\"/></filter><rect width=\\"100%\\" height=\\"100%\\" filter=\\"url(%23n)\\" opacity=\\"0.8\\"/></svg>")',
    }}/>
  );
}

// ────────────────────────────────────────────────────────────
// Color helpers for accent tweak
// ────────────────────────────────────────────────────────────
function hex2rgb(h){ h=h.replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join('');
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function rgb2hex([r,g,b]){ const t=v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');
  return '#'+t(r)+t(g)+t(b); }
function shade(hex, amt){ const [r,g,b]=hex2rgb(hex);
  const f=(v)=>amt<0? v*(1+amt) : v+(255-v)*amt; return rgb2hex([f(r),f(g),f(b)]); }
function mix(a,b,t){ const A=hex2rgb(a), B=hex2rgb(b);
  return rgb2hex([A[0]*(1-t)+B[0]*t, A[1]*(1-t)+B[1]*t, A[2]*(1-t)+B[2]*t]); }

// ────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
