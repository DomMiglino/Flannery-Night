(() => {
  'use strict';

  const ROLE_LABELS = {
    P:'Portiere', DC:'Difensore centrale', DL:'Difensore laterale',
    CC:'Centrocampista centrale', CL:'Centrocampista laterale', PC:'Punta centrale'
  };
  const ATTRS = [
    ['vel_tuf','VEL/TUF'],
    ['tir_pre','TIR/PRE'],
    ['pass_rin','PASS/RIN'],
    ['dri_rif','DRI/RIF'],
    ['dif_rea','DIF/REA'],
    ['fis_pia','FIS/PIA']
  ];

  let data = JSON.parse(JSON.stringify(window.FLANNERY_INITIAL_DATA));
  let currentView = 'dashboard';
  let peerRatings = new Map();
  let db = null;
  let voterSession = null;
  let myVotes = new Map();
  let dashboardSort = {key:'power', dir:'desc'};

  function removeLegacyDetailsTab(){
    document.querySelectorAll('[data-view="details"]').forEach(el=>el.remove());
  }

  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');

  function esc(v=''){
    return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function toast(msg){
    toastEl.textContent=msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t=setTimeout(()=>toastEl.classList.remove('show'),2400);
  }
  function round1(v){ return Math.round((Number(v)+Number.EPSILON)*10)/10; }
  function fmt1(v){ return v===null || v===undefined ? 'n/d' : (Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(1)); }
  function dateIT(s){ if(!s)return ''; const [y,m,d]=s.split('-'); return `${d}/${m}/${y}`; }
  function playerById(id){ return data.players.find(p=>p.id===id); }
  function playerName(id){ return playerById(id)?.name || 'Giocatore'; }
  function sum(arr,key){ return arr.reduce((a,x)=>a+Number(key?x[key]||0:x||0),0); }
  function matchScore(m){
    const a=sum(m.teamA,'goals')+sum(m.teamB,'ownGoals');
    const b=sum(m.teamB,'goals')+sum(m.teamA,'ownGoals');
    return [a,b];
  }
  function resultCodes(a,b){ return a>b?['V','S']:a<b?['S','V']:['P','P']; }

  function deriveStats(){
    const out=new Map();
    const ensure=pid=>{
      if(!out.has(pid)) out.set(pid,{playerId:pid,played:0,wins:0,draws:0,losses:0,goals:0,ownGoals:0,points:0,results:[],mvp:0,critica:0});
      return out.get(pid);
    };
    data.players.forEach(p=>ensure(p.id));
    [...data.matches].sort((a,b)=>a.date.localeCompare(b.date)).forEach(m=>{
      const [sa,sb]=matchScore(m);
      const [ra,rb]=resultCodes(sa,sb);
      [[m.teamA,ra,m.mvpA],[m.teamB,rb,m.mvpB]].forEach(([team,res,mvp])=>{
        team.forEach(e=>{
          const x=ensure(e.playerId);
          x.played++;
          x.goals+=Number(e.goals||0);
          x.ownGoals+=Number(e.ownGoals||0);
          if(res==='V'){x.wins++;x.points+=3;} else if(res==='P'){x.draws++;x.points+=1;} else x.losses++;
          const star=e.playerId===mvp;
          x.results.push(res+(star?'*':''));
          if(star)x.mvp++;
          if(e.playerId===m.critica)x.critica++;
        });
      });
    });
    for(const x of out.values()){
      x.avgGoals=x.played?round1(x.goals/x.played):0;
      x.avgPoints=x.played?round1(x.points/x.played):0;
      x.power=round1(x.points+x.mvp*Math.max(x.avgPoints,1));
      const recent=x.results.slice(-5);
      let n=0,d=0;
      recent.forEach((r,i)=>{const w=i+1, base=r[0]==='V'?3:r[0]==='P'?1:0;n+=w*(base+(r.includes('*')?.35:0));d+=w*3.35;});
      x.formIndex=d?Math.round(100*n/d):0;
      x.formText=x.results.join(' ');
    }
    return out;
  }

  async function apiPost(payload){
    const url=window.FLANNERY_API_URL||'';
    if(!url) throw new Error('API non configurata');
    const r=await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload)
    });
    const out=await r.json();
    if(!out.ok) throw new Error(out.error||'Errore API');
    return out;
  }

  function publicJsonp(){
    return new Promise((resolve,reject)=>{
      const url=window.FLANNERY_API_URL||'';
      if(!url){reject(new Error('API non configurata'));return;}
      const cb='flanneryJsonp_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const s=document.createElement('script');
      const timer=setTimeout(()=>{cleanup();reject(new Error('Timeout API'));},10000);
      function cleanup(){clearTimeout(timer);delete window[cb];if(s.parentNode)s.parentNode.removeChild(s);}
      window[cb]=(payload)=>{cleanup();payload&&payload.ok?resolve(payload):reject(new Error(payload?.error||'Errore API'));};
      s.onerror=()=>{cleanup();reject(new Error('Errore caricamento API'));};
      s.src=url+(url.includes('?')?'&':'?')+'action=publicState&prefix='+encodeURIComponent(cb)+'&_='+Date.now();
      document.head.appendChild(s);
    });
  }

  async function initBackend(){
    const url=window.FLANNERY_API_URL||'';
    if(!url) return;
    db=true;
    try{
      const r=await publicJsonp();
      if(r.state && r.state.players && r.state.matches) data=r.state;
      peerRatings=new Map((r.ratings||[]).map(x=>[x.player_id,x]));
    }catch(e){
      console.warn('Backend Google non disponibile',e);
    }
  }

  async function loadPeerRatings(){
    if(!db)return;
    const r=await publicJsonp();
    peerRatings=new Map((r.ratings||[]).map(x=>[x.player_id,x]));
  }

  async function setView(v){
    currentView=v;
    document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));

    render();
    window.scrollTo({top:0,behavior:'smooth'});

    if(v==='players' && db){
      try{
        await loadPeerRatings();
        if(currentView==='players') renderPlayers();
      }catch(e){
        console.warn('Aggiornamento rating non disponibile',e);
      }
    }
  }

  function render(){
    if(currentView==='dashboard')renderDashboard();
    else if(currentView==='matches')renderMatches();
    else if(currentView==='players')renderPlayers();
    else if(currentView==='votes')renderVotes();
  }

  function formBadge(x){
    if(!x.played)return '<span class="badge">n/d</span>';
    const cls=x.formIndex>=65?'good':x.formIndex>=35?'mid':'bad';
    const icon=x.formIndex>=65?'↗':x.formIndex>=35?'→':'↘';
    return `<span class="badge ${cls}">${icon} ${x.formIndex}</span>`;
  }

  function renderDashboard(){
    const stats=deriveStats();
    const played=[...stats.values()].filter(x=>x.played);
    const sorters={
      name:x=>playerName(x.playerId).toLowerCase(),
      played:x=>x.played,
      wins:x=>x.wins,
      draws:x=>x.draws,
      losses:x=>x.losses,
      goals:x=>x.goals,
      ownGoals:x=>x.ownGoals,
      avgGoals:x=>x.avgGoals,
      points:x=>x.points,
      avgPoints:x=>x.avgPoints,
      formIndex:x=>x.formIndex,
      mvp:x=>x.mvp,
      critica:x=>x.critica,
      power:x=>x.power
    };
    const dir=dashboardSort.dir==='asc'?1:-1;
    const getter=sorters[dashboardSort.key]||sorters.power;
    const rows=[...played].sort((a,b)=>{
      const av=getter(a),bv=getter(b);
      if(typeof av==='string') return dir*av.localeCompare(bv,'it');
      return dir*(Number(av)-Number(bv)) || b.power-a.power;
    });
    const goals=data.matches.reduce((t,m)=>{const [a,b]=matchScore(m);return t+a+b},0);
    const leader=[...played].sort((a,b)=>b.power-a.power)[0];
    const scorer=[...played].sort((a,b)=>b.goals-a.goals)[0];
    const arrow=key=>dashboardSort.key===key?(dashboardSort.dir==='asc'?' ▲':' ▼'):'';
    const th=(key,label,cls='')=>`<th class="sortable ${cls}" data-sort="${key}" title="Ordina per ${esc(label)}">${esc(label)}<span class="sort-arrow">${arrow(key)}</span></th>`;

    app.innerHTML=`
      <div class="toolbar">
        <div><h2 style="margin:0">Classifica · Flannery Power</h2><div class="muted">Clicca sulle intestazioni per ordinare la classifica.</div></div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="label">Partite</div><div class="value">${data.matches.length}</div></div>
        <div class="kpi"><div class="label">Gol totali</div><div class="value">${goals}</div></div>
        <div class="kpi"><div class="label">Leader Power</div><div class="value">${leader?esc(playerName(leader.playerId)):'-'}</div></div>
        <div class="kpi"><div class="label">Capocannoniere</div><div class="value">${scorer?esc(playerName(scorer.playerId)):'-'}</div></div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th>${th('name','Giocatore','name')}${th('played','G')}${th('wins','V')}${th('draws','P')}${th('losses','S')}${th('goals','Gol')}${th('ownGoals','AG')}${th('avgGoals','Media gol')}${th('points','Punti')}${th('avgPoints','Media pt')}${th('formIndex','Forma')}${th('mvp','MVP')}${th('critica','Critica')}${th('power','Power')}</tr></thead>
        <tbody>${rows.map((x,i)=>`<tr>
          <td class="rank">${i+1}</td><td class="name"><strong>${esc(playerName(x.playerId))}</strong></td>
          <td>${x.played}</td><td>${x.wins}</td><td>${x.draws}</td><td>${x.losses}</td><td>${x.goals}</td><td>${x.ownGoals}</td><td>${fmt1(x.avgGoals)}</td><td>${x.points}</td><td>${fmt1(x.avgPoints)}</td>
          <td>${formBadge(x)}</td><td>${x.mvp}</td><td>${x.critica}</td>
          <td class="power">${fmt1(x.power)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;

    app.querySelectorAll('th[data-sort]').forEach(el=>el.onclick=()=>{
      const key=el.dataset.sort;
      if(dashboardSort.key===key) dashboardSort.dir=dashboardSort.dir==='asc'?'desc':'asc';
      else{
        dashboardSort.key=key;
        dashboardSort.dir=key==='name'?'asc':'desc';
      }
      renderDashboard();
    });
  }

  function renderMatches(){
    const ms=[...data.matches].sort((a,b)=>b.date.localeCompare(a.date));
    app.innerHTML=`<div class="toolbar"><div><h2 style="margin:0">Partite</h2><div class="muted">Archivio pubblico della stagione.</div></div></div>
      <div class="match-list">${ms.map(m=>{
        const [a,b]=matchScore(m);
        return `<div class="card match-card">
          <div class="match-date">${dateIT(m.date)}</div>
          <div>
            <div class="teams">
              <div class="team"><div class="team-name">Squadra A</div><div class="roster">${m.teamA.map(e=>esc(playerName(e.playerId))+(e.goals?` (${e.goals})`:'')).join(', ')}</div></div>
              <div class="score">${a} - ${b}</div>
              <div class="team right"><div class="team-name">Squadra B</div><div class="roster">${m.teamB.map(e=>esc(playerName(e.playerId))+(e.goals?` (${e.goals})`:'')).join(', ')}</div></div>
            </div>
            <div class="match-meta">MVP A: ${esc(playerName(m.mvpA))} · MVP B: ${esc(playerName(m.mvpB))}${m.critica?` · Critica: ${esc(playerName(m.critica))}`:''}</div>
          </div>
        </div>`;
      }).join('')}</div>`;
  }


  function renderPlayers(){
    const players=[...data.players].filter(p=>p.active).sort((a,b)=>a.name.localeCompare(b.name));
    const tierClass=(voters,overall)=>{
      if(!voters || overall===null || overall===undefined) return '';
      const n=Number(overall);
      if(n>=90) return 'tier-gold';
      if(n>=80) return 'tier-silver';
      return 'tier-bronze';
    };
    app.innerHTML=`
      <div class="toolbar"><div><h2 style="margin:0">Giocatori</h2><div class="muted">Rating tecnico basato esclusivamente sulle mediane anonime dei voti ricevuti dagli altri giocatori.</div></div></div>

      <div class="notice">
        <strong>Come leggere le statistiche:</strong> ogni sigla indica l'attributo del giocatore di movimento e, dopo la barra, il corrispondente attributo del portiere.
        <div class="metric-list" style="margin-top:12px">
          <div class="metric"><strong>VEL / TUF</strong>Velocità / Tuffo</div>
          <div class="metric"><strong>TIR / PRE</strong>Tiro / Presa</div>
          <div class="metric"><strong>PASS / RIN</strong>Passaggio / Rinvio</div>
          <div class="metric"><strong>DRI / RIF</strong>Dribbling / Riflessi</div>
          <div class="metric"><strong>DIF / REA</strong>Difesa / Reattività</div>
          <div class="metric"><strong>FIS / PIA</strong>Fisico / Piazzamento</div>
        </div>
        <p style="margin:12px 0 0">Per ogni giocatore vengono pubblicate soltanto le <strong>mediane aggregate</strong>. L'Overall è calcolato sulle mediane con ponderazioni diverse in base al ruolo. I voti individuali non sono pubblici.</p>
      </div>

      <div class="notice rating-legend"><strong>Fasce Overall:</strong> <span class="legend-dot gold"></span> Oro 90–100 · <span class="legend-dot silver"></span> Argento 80–89 · <span class="legend-dot bronze"></span> Bronzo fino a 79</div>

      <div class="player-grid">${players.map(p=>{
        const r=peerRatings.get(p.id);
        const voters=Number(r?.voters||0);
        const tier=tierClass(voters,r?.overall);
        return `<div class="card player-card ${tier}">
          <div class="player-top"><div><div class="player-name">${esc(p.name)}</div><div class="role">${esc(p.role)} · ${esc(ROLE_LABELS[p.role]||'')}</div></div>
          <div class="rating-box"><div class="muted">OVR</div><div class="num">${voters?fmt1(r.overall):'n/d'}</div></div></div>
          <div class="attrs">${ATTRS.map(([k,l])=>`<div class="attr"><span>${l}</span><strong>${voters?fmt1(r[k]):'n/d'}</strong></div>`).join('')}</div>
          <div class="muted" style="margin-top:10px">${voters} votant${voters===1?'e':'i'}</div>
        </div>`;
      }).join('')}</div>`;
  }

  function loginForm(){
    const options=[...data.players].filter(p=>p.active).sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    return `<div class="card form-card" style="max-width:620px">
      <h2>Accesso giocatore</h2>
      <p class="muted">Se è il tuo primo accesso potrai creare il tuo PIN personale di 6 cifre. Dagli accessi successivi userai sempre lo stesso PIN.</p>
      <div class="field"><label>Giocatore</label><select id="voterSelect"><option value="">Seleziona...</option>${options}</select></div>
      <div id="pinArea"></div>
    </div>`;
  }

  async function renderPinAccess(){
    const id=document.getElementById('voterSelect')?.value;
    const area=document.getElementById('pinArea');
    if(!area)return;
    if(!id){area.innerHTML='';return;}

    area.innerHTML='<div class="muted">Controllo accesso...</div>';
    try{
      const st=await apiPost({action:'playerPinStatus',playerId:id});
      if(st.hasPin){
        area.innerHTML=`
          <div class="field"><label>PIN personale</label><input id="voterPin" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" placeholder="6 cifre"></div>
          <button id="loginVote" class="primary">Accedi alle votazioni</button>`;
        document.getElementById('loginVote').onclick=voteLogin;
      }else{
        area.innerHTML=`
          <div class="notice">Primo accesso: crea adesso il tuo PIN personale. Dovrà essere composto da <strong>6 cifre</strong>.</div>
          <div class="field"><label>Crea PIN</label><input id="newPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="6 cifre"></div>
          <div class="field"><label>Conferma PIN</label><input id="newPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="Ripeti il PIN"></div>
          <button id="registerPin" class="primary">Crea PIN e accedi</button>`;
        document.getElementById('registerPin').onclick=registerPin;
      }
    }catch(e){
      area.innerHTML='<div class="notice warn"></div>';
    }
  }

  async function registerPin(){
    const id=document.getElementById('voterSelect').value;
    const pin=document.getElementById('newPin').value.trim();
    const pin2=document.getElementById('newPin2').value.trim();
    if(!/^\d{6}$/.test(pin)){toast('Il PIN deve contenere esattamente 6 cifre');return;}
    if(pin!==pin2){toast('I due PIN non coincidono');return;}

    const btn=document.getElementById('registerPin');
    btn.disabled=true;btn.textContent='Creazione...';
    try{
      await apiPost({action:'registerPlayerPin',playerId:id,pin});
      voterSession={id,pin};
      myVotes=new Map();
      toast('PIN creato correttamente');
      renderVotes();
    }catch(e){
      btn.disabled=false;btn.textContent='Crea PIN e accedi';
      toast(e.message||'Creazione PIN non riuscita');
      await renderPinAccess();
    }
  }

  function voteCard(target){
    const old=myVotes.get(target.id)||{};
    return `<div class="card form-card vote-card" data-target="${esc(target.id)}">
      <div class="player-top"><div><div class="player-name">${esc(target.name)}</div><div class="role">${esc(target.role)} · ${esc(ROLE_LABELS[target.role]||'')}</div></div><span class="badge ${old.target_id?'good':''}">${old.target_id?'Votato':'Da votare'}</span></div>
      <div class="form-grid six" style="margin-top:14px">
        ${ATTRS.map(([k,l])=>`<div class="field"><label>${l}</label><input type="number" min="1" max="99" step="1" data-attr="${k}" value="${old[k]??''}" placeholder="1-99"></div>`).join('')}
      </div>
      <button class="primary save-vote">Salva voto</button>
    </div>`;
  }

  function renderVotes(){
    const base=window.FLANNERY_API_URL||'';
    if(!base){
      app.innerHTML='<div class="card pad"><h2>Votazioni</h2><div class="notice warn">Sistema votazioni non configurato.</div></div>';
      return;
    }
    const src=base+(base.includes('?')?'&':'?')+'page=votes';
    app.innerHTML=`
      <div class="toolbar"><div><h2 style="margin:0">Votazioni</h2><div class="muted">Area protetta per la creazione del PIN e l'invio dei voti.</div></div></div>
      <iframe title="Votazioni Flannery Night" src="${esc(src)}" style="width:100%;height:1500px;border:0;border-radius:18px;background:#0f1713"></iframe>`;
  }

  removeLegacyDetailsTab();
  document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>setView(b.dataset.view));

  (async()=>{
    await initBackend();
    render();
  })();
})();