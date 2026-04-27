// Collection tab — gallery of saved identifications

const { useState: useS3, useMemo: useM3, useRef: useR3 } = React;

// 18 saved entries; reuses sample palettes from identify-tab
const COLLECTION_DATA = [
  { id:1,  species:'Red Fox',           latin:'Vulpes vulpes',         confidence:0.94, date:'Apr 21, 2026', loc:'Skyline Wilderness, CA',  group:'Mammals',  status:'Least concern', palette:['#7e5a36','#b88a52','#3b2c1c','#d4b48a'], tag:'fox' },
  { id:2,  species:'Great Horned Owl',  latin:'Bubo virginianus',      confidence:0.88, date:'Apr 20, 2026', loc:'Briones Regional Park',   group:'Birds',    status:'Least concern', palette:['#5a4a36','#a08866','#2b231a','#c9b48f'], tag:'owl' },
  { id:3,  species:'Pacific Tree Frog', latin:'Pseudacris regilla',    confidence:0.91, date:'Apr 18, 2026', loc:'Tilden Park pond',        group:'Amphibians',status:'Least concern',palette:['#4d6a3a','#8aa66a','#2d3e22','#cfd9b3'], tag:'frog'},
  { id:4,  species:'Mule Deer',         latin:'Odocoileus hemionus',   confidence:0.96, date:'Apr 18, 2026', loc:'Mt. Diablo trailhead',    group:'Mammals',  status:'Least concern', palette:['#6f5535','#a78a5e','#3a2c1c','#d4b58a'], tag:'deer' },
  { id:5,  species:'Anna\u2019s Hummingbird', latin:'Calypte anna',     confidence:0.82, date:'Apr 16, 2026', loc:'Backyard feeder',         group:'Birds',    status:'Least concern', palette:['#3d5a4a','#7ba892','#1f2f26','#c9e0d2'], tag:'hummer' },
  { id:6,  species:'Western Fence Lizard',latin:'Sceloporus occidentalis',confidence:0.79,date:'Apr 15, 2026',loc:'Sunol Wilderness',     group:'Reptiles', status:'Least concern', palette:['#5a4a32','#9a8255','#2c241a','#c4b48a'], tag:'lizard' },
  { id:7,  species:'Coyote',            latin:'Canis latrans',         confidence:0.86, date:'Apr 14, 2026', loc:'Marin Headlands',         group:'Mammals',  status:'Least concern', palette:['#6a5a44','#9d8a6e','#2e2820','#c4b59a'], tag:'coyote'},
  { id:8,  species:'Steller\u2019s Jay',latin:'Cyanocitta stelleri',   confidence:0.93, date:'Apr 12, 2026', loc:'Big Basin Redwoods',      group:'Birds',    status:'Least concern', palette:['#1f3a5a','#3d6a96','#0f1a2c','#7aa6cf'], tag:'jay' },
  { id:9,  species:'Western Tiger Swallowtail',latin:'Papilio rutulus',confidence:0.80,date:'Apr 11, 2026', loc:'Garden, Berkeley',        group:'Insects',  status:'Least concern', palette:['#7a6a2a','#d4b850','#2a2410','#f0e0a0'], tag:'butterfly'},
  { id:10, species:'California Newt',   latin:'Taricha torosa',        confidence:0.75, date:'Apr 09, 2026', loc:'Tilden creek',            group:'Amphibians',status:'Special concern',palette:['#5a3a26','#9a6a48','#2c1a10','#c89a6a'], tag:'newt' },
  { id:11, species:'Black-tailed Jackrabbit',latin:'Lepus californicus',confidence:0.84,date:'Apr 08, 2026', loc:'Coyote Hills',            group:'Mammals',  status:'Least concern', palette:['#7a6a52','#a89478','#322820','#cdb89c'], tag:'rabbit'},
  { id:12, species:'Acorn Woodpecker', latin:'Melanerpes formicivorus',confidence:0.90,date:'Apr 06, 2026', loc:'Mt. Tamalpais',           group:'Birds',    status:'Least concern', palette:['#3a2a1c','#a83a30','#1c1410','#e0dac6'], tag:'wood'},
  { id:13, species:'Garter Snake',      latin:'Thamnophis sirtalis',   confidence:0.71, date:'Apr 04, 2026', loc:'Backyard',                group:'Reptiles', status:'Least concern', palette:['#3a4a26','#6a8a3a','#1a200f','#a8c060'], tag:'snake'},
  { id:14, species:'Bobcat',            latin:'Lynx rufus',            confidence:0.77, date:'Apr 02, 2026', loc:'Mission Peak',            group:'Mammals',  status:'Least concern', palette:['#7a5a36','#b08a5a','#3a2818','#d4b48a'], tag:'bobcat'},
  { id:15, species:'Western Bluebird',  latin:'Sialia mexicana',       confidence:0.92, date:'Mar 30, 2026', loc:'Henry Coe State Park',    group:'Birds',    status:'Least concern', palette:['#1f4a7a','#7a3a2a','#0f1f3a','#cd8870'], tag:'blue'},
  { id:16, species:'Banana Slug',       latin:'Ariolimax columbianus', confidence:0.97, date:'Mar 28, 2026', loc:'Muir Woods',              group:'Insects',  status:'Least concern', palette:['#7a6a1c','#d4be3a','#2a2410','#f0dc70'], tag:'slug'},
  { id:17, species:'Red-tailed Hawk',   latin:'Buteo jamaicensis',     confidence:0.85, date:'Mar 26, 2026', loc:'Sunol pasture',           group:'Birds',    status:'Least concern', palette:['#6a3a26','#a8694a','#2a1810','#d49a7a'], tag:'hawk'},
  { id:18, species:'Sea Otter',         latin:'Enhydra lutris',        confidence:0.89, date:'Mar 22, 2026', loc:'Monterey Bay',            group:'Mammals',  status:'Endangered',     palette:['#3a2a1c','#6a4a32','#1a1208','#a8866a'], tag:'otter' },
];

const GROUPS = ['All','Mammals','Birds','Reptiles','Amphibians','Insects'];

function CollectionTab({ tweaks, setTweak }) {
  const [group, setGroup] = useS3('All');
  const [query, setQuery] = useS3('');
  const [sort, setSort]   = useS3('recent'); // recent | confidence | species
  const [view, setView]   = useS3('grid');   // grid | list
  const [selected, setSelected] = useS3(null);

  const filtered = useM3(()=>{
    let r = COLLECTION_DATA.filter(d =>
      (group==='All' || d.group===group) &&
      (!query || (d.species+' '+d.latin+' '+d.loc).toLowerCase().includes(query.toLowerCase()))
    );
    if (sort==='recent')      r = [...r].sort((a,b)=> b.id - a.id);
    if (sort==='confidence')  r = [...r].sort((a,b)=> b.confidence - a.confidence);
    if (sort==='species')     r = [...r].sort((a,b)=> a.species.localeCompare(b.species));
    return r;
  }, [group, query, sort]);

  const speciesCount = useM3(()=> new Set(COLLECTION_DATA.map(d=>d.species)).size, []);

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', minHeight:0 }}>
      <CollectionHeader total={COLLECTION_DATA.length} species={speciesCount}/>

      {/* filter bar */}
      <div style={{
        display:'flex', alignItems:'center', gap:12,
        padding:'14px 32px', borderBottom:'0.5px solid var(--hair)',
        flexShrink:0,
      }}>
        <div style={{ display:'flex', gap:4, padding:3, background:'#fbfaf6',
          borderRadius:8, border:'0.5px solid var(--hair)' }}>
          {GROUPS.map(g=>(
            <button key={g} onClick={()=>setGroup(g)} style={{
              appearance:'none', border:0, cursor:'pointer',
              padding:'5px 11px', borderRadius:5,
              background: group===g ? '#fff' : 'transparent',
              color: group===g ? 'var(--ink)' : 'var(--ink-3)',
              fontFamily:'inherit', fontSize:12, fontWeight: group===g?500:450,
              boxShadow: group===g ? '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.06)' : 'none',
            }}>{g}</button>
          ))}
        </div>

        <div style={{ flex:1, position:'relative', maxWidth:280 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
            style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }}>
            <circle cx="5.5" cy="5.5" r="4" stroke="var(--ink-4)" strokeWidth="1.4"/>
            <path d="M8.5 8.5l3 3" stroke="var(--ink-4)" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Search species or location"
            style={{
              width:'100%', appearance:'none',
              border:'0.5px solid var(--hair-2)', borderRadius:7,
              background:'#fff', padding:'7px 10px 7px 30px',
              fontFamily:'inherit', fontSize:13, color:'var(--ink)',
              outline:'none',
            }}/>
        </div>

        <div style={{ flex:1 }}/>

        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink-3)' }}>
          <span>Sort</span>
          <select value={sort} onChange={e=>setSort(e.target.value)}
            style={{
              appearance:'none', border:'0.5px solid var(--hair-2)', borderRadius:6,
              background:'#fff', padding:'5px 22px 5px 8px',
              fontFamily:'inherit', fontSize:12, color:'var(--ink-2)', cursor:'pointer',
              backgroundImage:`url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'><path fill='%23999' d='M0 0h8L4 5z'/></svg>")`,
              backgroundRepeat:'no-repeat', backgroundPosition:'right 7px center',
            }}>
            <option value="recent">Most recent</option>
            <option value="confidence">Highest confidence</option>
            <option value="species">Species (A–Z)</option>
          </select>
        </div>

        <div style={{ display:'flex', padding:2, background:'#fbfaf6',
          borderRadius:7, border:'0.5px solid var(--hair)' }}>
          <ViewToggle active={view==='grid'} onClick={()=>setView('grid')} icon="grid"/>
          <ViewToggle active={view==='list'} onClick={()=>setView('list')} icon="list"/>
        </div>
      </div>

      {/* body */}
      <div style={{ flex:1, overflow:'auto', minHeight:0 }}>
        {filtered.length === 0 ? (
          <EmptyResult onClear={()=>{ setQuery(''); setGroup('All'); }}/>
        ) : view === 'grid' ? (
          <GridView items={filtered} onOpen={setSelected}/>
        ) : (
          <ListView items={filtered} onOpen={setSelected}/>
        )}
      </div>

      {selected && (
        <DetailDrawer item={selected} onClose={()=>setSelected(null)}/>
      )}
    </div>
  );
}

function CollectionHeader({ total, species }) {
  return (
    <div style={{
      padding:'22px 32px 18px',
      display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexShrink:0,
    }}>
      <div>
        <div style={{
          fontSize:11, fontWeight:600, letterSpacing:'0.14em', textTransform:'uppercase',
          color:'var(--accent-deep)', marginBottom:6,
        }}>Your collection</div>
        <h1 style={{
          fontFamily:'Fraunces, serif', fontWeight:500, fontSize:26,
          letterSpacing:'-0.015em', color:'var(--ink)', margin:0,
        }}>
          {total} sightings
          <span style={{ fontFamily:'Fraunces, serif', fontStyle:'italic',
            fontWeight:400, color:'var(--ink-3)', fontSize:18, marginLeft:10 }}>
            across {species} species
          </span>
        </h1>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button style={ghostBtn}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4h8M2 6h8M2 8h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Export CSV
        </button>
        <button style={primaryBtn}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          New identification
        </button>
      </div>
    </div>
  );
}

const ghostBtn = {
  appearance:'none', border:'0.5px solid var(--hair-2)', background:'#fff',
  color:'var(--ink-2)', fontFamily:'inherit', fontSize:12.5, fontWeight:500,
  padding:'7px 12px', borderRadius:7, cursor:'pointer',
  display:'inline-flex', alignItems:'center', gap:6,
};
const primaryBtn = {
  appearance:'none', border:0, background:'var(--accent)', color:'#fff',
  fontFamily:'inherit', fontSize:12.5, fontWeight:500,
  padding:'7px 14px', borderRadius:7, cursor:'pointer',
  display:'inline-flex', alignItems:'center', gap:6,
  boxShadow:'0 1px 0 rgba(255,255,255,0.2) inset, 0 4px 10px -4px rgba(80,110,80,0.5)',
};

function ViewToggle({ active, onClick, icon }) {
  const paths = {
    grid: <><rect x="2" y="2" width="4" height="4" rx="0.5" fill="currentColor"/>
      <rect x="8" y="2" width="4" height="4" rx="0.5" fill="currentColor"/>
      <rect x="2" y="8" width="4" height="4" rx="0.5" fill="currentColor"/>
      <rect x="8" y="8" width="4" height="4" rx="0.5" fill="currentColor"/></>,
    list: <><rect x="2" y="3" width="10" height="1.5" rx="0.5" fill="currentColor"/>
      <rect x="2" y="6.5" width="10" height="1.5" rx="0.5" fill="currentColor"/>
      <rect x="2" y="10" width="10" height="1.5" rx="0.5" fill="currentColor"/></>,
  };
  return (
    <button onClick={onClick} style={{
      appearance:'none', border:0, background: active?'#fff':'transparent',
      color: active?'var(--ink)':'var(--ink-4)',
      width:26, height:24, borderRadius:5, cursor:'pointer',
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.06)' : 'none',
    }}>
      <svg width="14" height="14" viewBox="0 0 14 14">{paths[icon]}</svg>
    </button>
  );
}

// ──────────────────────────────────────────────────────────
// GridView — uses CSS grid w/ auto-fill, soft cards
// ──────────────────────────────────────────────────────────
function GridView({ items, onOpen }) {
  return (
    <div style={{
      padding:'22px 32px 32px',
      display:'grid',
      gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))',
      gap:16,
    }}>
      {items.map(it => <GridCard key={it.id} item={it} onClick={()=>onOpen(it)}/>)}
    </div>
  );
}

function GridCard({ item, onClick }) {
  const [hover, setHover] = useS3(false);
  return (
    <div onClick={onClick}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{
        cursor:'pointer', borderRadius:12, overflow:'hidden',
        background:'#fff', border:'0.5px solid var(--hair)',
        boxShadow: hover
          ? '0 12px 28px -14px rgba(20,30,20,0.25), 0 0 0 0.5px rgba(106,133,102,0.4)'
          : '0 1px 2px rgba(20,30,20,0.04)',
        transform: hover ? 'translateY(-2px)' : 'none',
        transition:'all 200ms ease',
        display:'flex', flexDirection:'column',
      }}>
      <div style={{ position:'relative', aspectRatio:'4/3' }}>
        <PhotoBitmap photo={{ id:item.tag, palette:item.palette }}
          style={{ position:'absolute', inset:0 }}/>
        <ConfidencePill value={item.confidence}/>
        {item.status === 'Endangered' && (
          <span style={{
            position:'absolute', top:10, left:10,
            fontSize:10, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase',
            color:'#fff', background:'rgba(184,71,53,0.92)',
            padding:'3px 7px', borderRadius:4,
          }}>Endangered</span>
        )}
        {item.status === 'Special concern' && (
          <span style={{
            position:'absolute', top:10, left:10,
            fontSize:10, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase',
            color:'#fff', background:'rgba(184,135,43,0.92)',
            padding:'3px 7px', borderRadius:4,
          }}>Watch</span>
        )}
      </div>
      <div style={{ padding:'12px 14px 14px' }}>
        <div style={{
          fontFamily:'Fraunces, serif', fontWeight:500, fontSize:16,
          color:'var(--ink)', letterSpacing:'-0.005em', lineHeight:1.2,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        }}>{item.species}</div>
        <div style={{
          fontFamily:'Fraunces, serif', fontStyle:'italic', fontSize:12,
          color:'var(--ink-3)', marginTop:1,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        }}>{item.latin}</div>
        <div style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          marginTop:10, fontSize:11.5, color:'var(--ink-3)',
        }}>
          <span style={{
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            maxWidth:'70%',
          }}>{item.loc}</span>
          <span style={{
            fontFamily:'JetBrains Mono, monospace', fontSize:10.5,
            color:'var(--ink-4)', flexShrink:0,
          }}>{item.date.split(',')[0]}</span>
        </div>
      </div>
    </div>
  );
}

function ConfidencePill({ value }) {
  return (
    <div style={{
      position:'absolute', bottom:10, right:10,
      background:'rgba(20,28,22,0.78)', backdropFilter:'blur(8px)',
      WebkitBackdropFilter:'blur(8px)',
      color:'#fff', fontSize:11, fontWeight:500,
      padding:'4px 9px', borderRadius:999,
      fontVariantNumeric:'tabular-nums',
      display:'inline-flex', alignItems:'center', gap:5,
    }}>
      <span style={{ width:5, height:5, borderRadius:'50%',
        background:'var(--accent)', boxShadow:'0 0 4px var(--accent)' }}/>
      {Math.round(value*100)}%
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// ListView — denser, table-like rows
// ──────────────────────────────────────────────────────────
function ListView({ items, onOpen }) {
  return (
    <div style={{ padding:'8px 32px 32px' }}>
      <div style={{
        display:'grid',
        gridTemplateColumns:'56px 1.6fr 1fr 1fr 90px 32px',
        gap:14, alignItems:'center',
        padding:'10px 12px',
        fontSize:10, fontWeight:600, letterSpacing:'0.1em',
        textTransform:'uppercase', color:'var(--ink-4)',
        borderBottom:'0.5px solid var(--hair)',
      }}>
        <span/><span>Species</span><span>Location</span><span>Date</span>
        <span style={{ textAlign:'right' }}>Confidence</span><span/>
      </div>
      {items.map(it => (
        <div key={it.id} onClick={()=>onOpen(it)}
          onMouseEnter={e=>e.currentTarget.style.background='var(--accent-softer)'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          style={{
            display:'grid',
            gridTemplateColumns:'56px 1.6fr 1fr 1fr 90px 32px',
            gap:14, alignItems:'center',
            padding:'10px 12px', borderRadius:8,
            cursor:'pointer', transition:'background 120ms ease',
            borderBottom:'0.5px solid var(--hair)',
          }}>
          <PhotoBitmap photo={{ id:it.tag, palette:it.palette }}
            style={{ width:48, height:36, borderRadius:5 }}/>
          <div style={{ minWidth:0 }}>
            <div style={{
              fontFamily:'Fraunces, serif', fontSize:14.5, fontWeight:500,
              color:'var(--ink)', letterSpacing:'-0.005em',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            }}>{it.species}</div>
            <div style={{
              fontFamily:'Fraunces, serif', fontStyle:'italic', fontSize:11.5,
              color:'var(--ink-3)',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            }}>{it.latin}</div>
          </div>
          <span style={{
            fontSize:12.5, color:'var(--ink-2)',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          }}>{it.loc}</span>
          <span style={{
            fontFamily:'JetBrains Mono, monospace', fontSize:11.5,
            color:'var(--ink-3)', fontVariantNumeric:'tabular-nums',
          }}>{it.date}</span>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:8 }}>
            <div style={{ width:50, height:4, background:'var(--accent-softer)',
              borderRadius:999, overflow:'hidden' }}>
              <div style={{ width:`${it.confidence*100}%`, height:'100%',
                background:'var(--accent)' }}/>
            </div>
            <span style={{
              fontSize:11.5, color:'var(--ink-2)', fontWeight:500,
              fontVariantNumeric:'tabular-nums', minWidth:28,
            }}>{Math.round(it.confidence*100)}%</span>
          </div>
          <span style={{ color:'var(--ink-4)', textAlign:'right' }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyResult({ onClear }) {
  return (
    <div style={{ padding:'80px 32px', textAlign:'center', color:'var(--ink-3)' }}>
      <div style={{ fontFamily:'Fraunces, serif', fontSize:20, color:'var(--ink-2)',
        marginBottom:6 }}>Nothing matches</div>
      <div style={{ fontSize:13, marginBottom:16 }}>Try another search or clear the filter.</div>
      <button onClick={onClear} style={ghostBtn}>Clear filters</button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Detail drawer — slides in from the right
// ──────────────────────────────────────────────────────────
function DetailDrawer({ item, onClose }) {
  return (
    <div style={{ position:'absolute', inset:0, zIndex:5,
      display:'flex', justifyContent:'flex-end',
      pointerEvents:'auto',
    }}>
      <div onClick={onClose} style={{
        position:'absolute', inset:0, background:'rgba(20,25,20,0.35)',
        animation:'fadeIn 180ms ease',
      }}/>
      <div style={{
        position:'relative', width:440, height:'100%', background:'#fff',
        borderLeft:'0.5px solid var(--hair)', display:'flex', flexDirection:'column',
        boxShadow:'-12px 0 40px -10px rgba(20,30,20,0.2)',
        animation:'slideIn 240ms cubic-bezier(.3,.7,.4,1)',
      }}>
        {/* photo header */}
        <div style={{ position:'relative', height:240, flexShrink:0 }}>
          <PhotoBitmap photo={{ id:item.tag, palette:item.palette }}
            style={{ position:'absolute', inset:0 }}/>
          <div style={{ position:'absolute', inset:0,
            background:'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 40%, rgba(0,0,0,0.6) 100%)' }}/>
          <button onClick={onClose} style={{
            position:'absolute', top:14, right:14,
            appearance:'none', border:0, background:'rgba(20,25,20,0.5)',
            color:'#fff', width:30, height:30, borderRadius:'50%',
            cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center',
            backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)',
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <div style={{ position:'absolute', left:24, bottom:18, color:'#fff' }}>
            <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'0.12em',
              textTransform:'uppercase', opacity:0.8, marginBottom:6 }}>{item.group}</div>
            <div style={{ fontFamily:'Fraunces, serif', fontSize:28, fontWeight:500,
              letterSpacing:'-0.015em', lineHeight:1.1 }}>{item.species}</div>
            <div style={{ fontFamily:'Fraunces, serif', fontStyle:'italic', fontSize:14,
              opacity:0.85, marginTop:2 }}>{item.latin}</div>
          </div>
        </div>

        {/* body */}
        <div style={{ flex:1, overflow:'auto', padding:'24px 28px' }}>
          {/* confidence */}
          <div style={{ marginBottom:22 }}>
            <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'0.12em',
              textTransform:'uppercase', color:'var(--ink-4)', marginBottom:6 }}>Confidence</div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ flex:1, height:6, background:'var(--accent-softer)',
                borderRadius:999, overflow:'hidden' }}>
                <div style={{ width:`${item.confidence*100}%`, height:'100%',
                  background:'var(--accent)' }}/>
              </div>
              <span style={{ fontFamily:'Fraunces, serif', fontSize:18, fontWeight:500,
                color:'var(--ink)', fontVariantNumeric:'tabular-nums' }}>
                {Math.round(item.confidence*100)}%
              </span>
            </div>
          </div>

          {/* metadata */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginBottom:22 }}>
            <Field label="Date" value={item.date}/>
            <Field label="Location" value={item.loc}/>
            <Field label="Group" value={item.group}/>
            <Field label="Status" value={item.status}/>
          </div>

          {/* notes */}
          <div style={{ marginBottom:22 }}>
            <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'0.12em',
              textTransform:'uppercase', color:'var(--ink-4)', marginBottom:8 }}>Notes</div>
            <div style={{
              padding:'12px 14px', background:'#fbfaf6', borderRadius:8,
              border:'0.5px solid var(--hair)', minHeight:64,
              fontSize:13, lineHeight:1.55, color:'var(--ink-2)',
            }}>
              {sampleNote(item)}
            </div>
          </div>

          {/* tags */}
          <div style={{ marginBottom:8 }}>
            <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'0.12em',
              textTransform:'uppercase', color:'var(--ink-4)', marginBottom:8 }}>Tags</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {['backyard', 'morning', 'photographed'].map(t=>(
                <span key={t} style={{
                  fontSize:11.5, color:'var(--ink-2)',
                  padding:'3px 9px', borderRadius:999,
                  background:'var(--accent-softer)',
                  border:'0.5px solid rgba(106,133,102,0.2)',
                }}>{t}</span>
              ))}
              <button style={{
                fontSize:11.5, color:'var(--ink-3)',
                padding:'3px 9px', borderRadius:999,
                background:'transparent', border:'0.5px dashed var(--hair-2)',
                cursor:'pointer', fontFamily:'inherit',
              }}>+ Add tag</button>
            </div>
          </div>
        </div>

        {/* footer actions */}
        <div style={{ padding:'14px 28px', borderTop:'0.5px solid var(--hair)',
          display:'flex', gap:8, flexShrink:0 }}>
          <button style={{ ...ghostBtn, flex:1, justifyContent:'center', height:38 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 5l4 4 4-7" stroke="currentColor" strokeWidth="1.4"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Re‑identify
          </button>
          <button style={{ ...primaryBtn, flex:1, justifyContent:'center', height:38 }}>
            View in field guide
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'0.1em',
        textTransform:'uppercase', color:'var(--ink-4)', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:13, color:'var(--ink)', lineHeight:1.4 }}>{value}</div>
    </div>
  );
}

function sampleNote(item) {
  const notes = {
    fox:'Curled up near the trail edge at dawn. Coat in good condition; tagged for repeat sightings.',
    owl:'Heard the call before spotting it. Perched in the same oak as last week.',
    frog:'Calling from the cattails after a rain. Several individuals visible.',
    deer:'Doe with two yearlings. Browsing the grass near the parking lot.',
  };
  return notes[item.tag] || 'No notes yet — tap to add observations from this sighting.';
}

Object.assign(window, { CollectionTab });
