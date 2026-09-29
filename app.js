(() => {
  'use strict';

  const STORAGE_KEY = 'flanneryNightDataV1';
  const ROLE_LABELS = {
    P: 'Portiere', DC: 'Difensore centrale', DL: 'Difensore laterale',
    CC: 'Centrocampista centrale', CL: 'Centrocampista laterale', PC: 'Punta centrale'
  };
  const ATTR_LABELS = {
    velTuf: 'VEL/TUF', tirPre: 'TIR/PRE', passRin: 'PASS/RIN',
    driRif: 'DRI/RIF', difRea: 'DIF/REA', fisPia: 'FIS/PIA'
  };
  const OVR_WEIGHTS = {
    P:  {velTuf:.25,tirPre:.15,passRin:.10,driRif:.25,difRea:.10,fisPia:.15},
    DC: {velTuf:.15,tirPre:0,passRin:.10,driRif:.05,difRea:.40,fisPia:.30},
    DL: {velTuf:.20,tirPre:0,passRin:.15,driRif:.05,difRea:.30,fisPia:.30},
    CC: {velTuf:.15,tirPre:.15,passRin:.30,driRif:.15,difRea:.15,fisPia:.10},
    CL: {velTuf:.30,tirPre:.10,passRin:.20,driRif:.25,difRea:.05,fisPia:.10},
    PC: {velTuf:.20,tirPre:.40,passRin:.05,driRif:.15,difRea:0,fisPia:.20}
  };
  const ADV_KEYS = [
    ['assists','Assist'], ['shotsOnTarget','Tiri porta'], ['keyPasses','Passaggi chiave'],
    ['dribbles','Dribbling riusciti'], ['recoveries','Recuperi'], ['duelsWon','Duelli vinti'], ['saves','Parate']
  ];

  let data = loadData();
  let currentView = 'dashboard';
  let editingMatchId = null;
  let editingPlayerId = null;

  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');

  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function loadData(){
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if(saved) return JSON.parse(saved);
    } catch(e) { console.warn('LocalStorage non disponibile', e); }
    return clone(window.FLANNERY_INITIAL_DATA);
  }
  function saveData(message){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch(e){ console.warn('Salvataggio locale non riuscito', e); }
    if(message) toast(message);
  }
  function toast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }
  function esc(v=''){
    return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function id(){ return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }
  function round1(v){ return Math.round((Number(v) + Number.EPSILON) * 10) / 10; }
  function fmt1(v){ return Number.isInteger(v) ? String(v) : Number(v).toFixed(1); }
  function dateIT(s){
    if(!s) return '';
    const [y,m,d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  function playerById(pid){ return data.players.find(p => p.id === pid); }
  function playerName(pid){ return playerById(pid)?.name || 'Giocatore rimosso'; }
  function directDriveUrl(url){
    if(!url) return '';
    const m = String(url).match(/\/d\/([^/]+)/) || String(url).match(/[?&]id=([^&]+)/);
    return m ? `https://drive.google.com/uc?export=view&id=${m[1]}` : url;
  }
  function sum(arr, key){ return arr.reduce((a,x) => a + Number(key ? x[key] || 0 : x || 0), 0); }
  function matchScore(m){
    const a = sum(m.teamA,'goals') + sum(m.teamB,'ownGoals');
    const b = sum(m.teamB,'goals') + sum(m.teamA,'ownGoals');
    return [a,b];
  }
  function resultCodes(a,b){
    if(a>b) return ['V','S'];
    if(a<b) return ['S','V'];
    return ['P','P'];
  }
  function computeLegacyOvr(p){
    const w = OVR_WEIGHTS[p.role];
    if(!w) return null;
    const vals = p.legacy || {};
    if(Object.keys(ATTR_LABELS).some(k => vals[k] === null || vals[k] === '' || vals[k] === undefined)) return null;
    let total = 0;
    for(const k of Object.keys(ATTR_LABELS)) total += Number(vals[k]) * (w[k] ?? 0);
    return Math.ceil(total);
  }

  function deriveStats(){
    const out = new Map();
    const ensure = pid => {
      if(!out.has(pid)) out.set(pid, {playerId:pid,played:0,wins:0,draws:0,losses:0,goals:0,ownGoals:0,points:0,results:[],mvp:0,critica:0,goalDiff:0});
      return out.get(pid);
    };
    data.players.forEach(p => ensure(p.id));
    [...data.matches].sort((a,b) => a.date.localeCompare(b.date)).forEach(m => {
      const [sa,sb] = matchScore(m);
      const [ra,rb] = resultCodes(sa,sb);
      [[m.teamA,ra,m.mvpA,sa-sb],[m.teamB,rb,m.mvpB,sb-sa]].forEach(([team,res,mvp,diff]) => {
        team.forEach(entry => {
          const x = ensure(entry.playerId);
          x.played++;
          x.goals += Number(entry.goals||0);
          x.ownGoals += Number(entry.ownGoals||0);
          x.goalDiff += diff;
          if(res==='V'){ x.wins++; x.points+=3; }
          else if(res==='P'){ x.draws++; x.points+=1; }
          else x.losses++;
          const star = entry.playerId === mvp;
          x.results.push(res + (star ? '*' : ''));
          if(star) x.mvp++;
          if(entry.playerId === m.critica) x.critica++;
        });
      });
    });
    for(const x of out.values()){
      x.avgGoals = x.played ? round1(x.goals/x.played) : 0;
      x.avgPoints = x.played ? round1(x.points/x.played) : 0;
      x.power = round1(x.points + x.mvp * Math.max(x.avgPoints,1));
      x.formText = x.results.join(' ');
      const recent = x.results.slice(-5);
      let weighted=0, max=0;
      recent.forEach((r,i) => {
        const w=i+1, base=r[0]==='V'?3:r[0]==='P'?1:0;
        weighted += w*(base + (r.includes('*') ? .35 : 0));
        max += w*3.35;
      });
      x.formIndex = max ? Math.round(100*weighted/max) : 0;
      x.goalDiffAvg = x.played ? round1(x.goalDiff/x.played) : 0;
    }
    return out;
  }

  function advancedAggregates(){
    const agg = new Map(data.players.map(p => [p.id,{tracked:0,goals:0,assists:0,shotsOnTarget:0,keyPasses:0,dribbles:0,recoveries:0,duelsWon:0,saves:0}]));
    for(const m of data.matches){
      if(!m.advancedTracked) continue;
      [...m.teamA,...m.teamB].forEach(e => {
        const a=agg.get(e.playerId); if(!a) return;
        a.tracked++; a.goals += Number(e.goals||0);
        ADV_KEYS.forEach(([k]) => a[k] += Number(e[k]||0));
      });
    }
    return agg;
  }
  function objectiveProfiles(){
    const agg=advancedAggregates();
    const raws=new Map();
    for(const [pid,a] of agg){
      if(!a.tracked){ raws.set(pid,null); continue; }
      const g=a.tracked;
      raws.set(pid,{
        finalizzazione: a.goals/g + (a.shotsOnTarget ? .8*a.goals/a.shotsOnTarget : 0),
        creazione: (a.assists + .5*a.keyPasses)/g,
        unoControUno: a.dribbles/g,
        difesa: a.recoveries/g,
        duelli: a.duelsWon/g,
        portiere: a.saves/g,
        tracked:g
      });
    }
    const keys=['finalizzazione','creazione','unoControUno','difesa','duelli','portiere'];
    const dist={};
    keys.forEach(k => {
      const vals=[...raws.values()].filter(Boolean).map(x=>x[k]);
      const mean=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
      const sd=vals.length>1?Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/(vals.length-1)):0;
      dist[k]={mean,sd};
    });
    const out=new Map();
    for(const [pid,r] of raws){
      if(!r){ out.set(pid,null); continue; }
      const profile={tracked:r.tracked};
      keys.forEach(k => {
        const {mean,sd}=dist[k];
        const z=sd ? (r[k]-mean)/sd : 0;
        const confidence=Math.min(1,r.tracked/6);
        profile[k]=Math.round(Math.max(20,Math.min(95,50 + 15*z*confidence)));
      });
      out.set(pid,profile);
    }
    return out;
  }

  function setView(view){
    currentView=view;
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view===view));
    render();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function render(){
    if(currentView==='dashboard') renderDashboard();
    else if(currentView==='matches') renderMatches();
    else if(currentView==='details') renderDetails();
    else if(currentView==='players') renderPlayers();
    else if(currentView==='method') renderMethod();
    else if(currentView==='backup') renderBackup();
    else if(currentView==='matchEdit') renderMatchEditor();
  }

  function formBadge(x){
    if(!x.played) return '<span class="badge">n/d</span>';
    const cls=x.formIndex>=65?'good':x.formIndex>=35?'mid':'bad';
    const icon=x.formIndex>=65?'↗':x.formIndex>=35?'→':'↘';
    return `<span class="badge ${cls}" title="Indice automatico ultime 5 partite">${icon} ${x.formIndex}</span>`;
  }
  function nationImg(p){
    const src=directDriveUrl(p.nationUrl);
    return src ? `<img src="${esc(src)}" alt="" class="flag" onerror="this.style.display='none'">` : '';
  }

  function renderDashboard(){
    const stats=deriveStats();
    const played=[...stats.values()].filter(x=>x.played>0);
    const totalGoals=data.matches.reduce((a,m)=>{const [x,y]=matchScore(m);return a+x+y},0);
    const leader=[...played].sort((a,b)=>b.power-a.power || b.points-a.points)[0];
    const scorer=[...played].sort((a,b)=>b.goals-a.goals || a.played-b.played)[0];
    const rows=[...played].sort((a,b)=>b.power-a.power || b.points-a.points || b.avgPoints-a.avgPoints || b.goals-a.goals);
    app.innerHTML=`
      <div class="toolbar">
        <div>
          <h2 style="margin:0 0 4px">Classifica</h2>
          <div class="muted">Calcolata automaticamente dalle ${data.matches.length} partite registrate.</div>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="label">Partite</div><div class="value">${data.matches.length}</div></div>
        <div class="kpi"><div class="label">Gol totali</div><div class="value">${totalGoals}</div></div>
        <div class="kpi"><div class="label">Leader Power</div><div class="value">${leader?esc(playerName(leader.playerId)):'-'}</div></div>
        <div class="kpi"><div class="label">Capocannoniere</div><div class="value">${scorer?`${esc(playerName(scorer.playerId))} · ${scorer.goals}`:'-'}</div></div>
      </div>
      <div class="notice">La classifica usa il Flannery Power. Il Rating tecnico dei giocatori deriva invece soltanto dalle votazioni degli altri giocatori nella versione pubblica.</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>#</th><th class="name">Giocatore</th><th>G</th><th>V</th><th>P</th><th>S</th><th>GF</th><th>AG</th><th>Media gol</th><th>Pt</th><th>Media pt</th><th>Rendimento</th><th>Forma</th><th>MVP</th><th>Critica</th><th>Power</th><th>Obj.</th><th>Conf.</th>
          </tr></thead>
          <tbody>${rows.map((x,i)=>{
            const p=playerById(x.playerId), o=obj.get(x.playerId);
            return `<tr>
              <td class="rank">${i+1}</td>
              <td class="name">${nationImg(p)} <strong>${esc(p.name)}</strong> <span class="muted">${esc(p.role||'')}</span></td>
              <td>${x.played}</td><td>${x.wins}</td><td>${x.draws}</td><td>${x.losses}</td><td>${x.goals}</td><td>${x.ownGoals}</td><td>${fmt1(x.avgGoals)}</td><td>${x.points}</td><td>${fmt1(x.avgPoints)}</td>
              <td>${esc(x.formText)}</td><td>${formBadge(x)}</td><td>${x.mvp}</td><td>${x.critica}</td><td class="power">${fmt1(x.power)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }


  function renderDetails(){
    const rows=[];
    [...data.matches].sort((a,b)=>a.date.localeCompare(b.date)).forEach(m=>{
      const [sa,sb]=matchScore(m); const [ra,rb]=resultCodes(sa,sb);
      [[m.teamA,'A',ra,m.mvpA],[m.teamB,'B',rb,m.mvpB]].forEach(([team,side,res,mvp])=>{
        team.forEach(e=>rows.push({
          date:m.date, playerId:e.playerId, team:side, goals:Number(e.goals||0), ownGoals:Number(e.ownGoals||0),
          result:res, mvp:e.playerId===mvp?1:0, critica:e.playerId===m.critica?1:0
        }));
      });
    });
    app.innerHTML=`
      <div class="toolbar"><div><h2 style="margin:0 0 4px">Dettagli</h2><div class="muted">Vista derivata automaticamente dalle partite, equivalente al foglio “Dettagli”. Non va compilata a mano.</div></div></div>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th class="name">Giocatore</th><th>Squadra</th><th>Gol</th><th>Autogol</th><th>Risultato</th><th>MVP?</th><th>Critica</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${dateIT(r.date)}</td><td class="name"><strong>${esc(playerName(r.playerId))}</strong></td><td>${r.team}</td><td>${r.goals}</td><td>${r.ownGoals}</td><td>${r.result}</td><td>${r.mvp}</td><td>${r.critica}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderMatches(){
    const matches=[...data.matches].sort((a,b)=>b.date.localeCompare(a.date));
    app.innerHTML=`
      <div class="toolbar"><div><h2 style="margin:0 0 4px">Partite</h2><div class="muted">Storico completo, modificabile partita per partita.</div></div><button id="newMatch" class="primary">+ Nuova partita</button></div>
      <div class="match-list">
        ${matches.length?matches.map(m=>{
          const [sa,sb]=matchScore(m);
          const roster=team=>team.map(e=>`${esc(playerName(e.playerId))}${e.goals?` (${e.goals})`:''}${e.ownGoals?` [AG ${e.ownGoals}]`:''}`).join(', ');
          return `<div class="card match-card">
            <div><div class="match-date">${dateIT(m.date)}</div><div class="score">${sa} - ${sb}</div></div>
            <div>
              <div class="teams">
                <div class="team"><div class="team-name">Squadra A</div><div class="roster">${roster(m.teamA)}</div></div>
                <div class="muted">vs</div>
                <div class="team right"><div class="team-name">Squadra B</div><div class="roster">${roster(m.teamB)}</div></div>
              </div>
              <div class="match-meta">MVP A: <strong>${m.mvpA?esc(playerName(m.mvpA)):'—'}</strong> · MVP B: <strong>${m.mvpB?esc(playerName(m.mvpB)):'—'}</strong>${m.critica?` · Critica: <strong>${esc(playerName(m.critica))}</strong>`:''}${m.advancedTracked?' · dati tecnici tracciati':''}</div>
            </div>
            <div class="match-actions"><button class="secondary small" data-edit="${m.id}">Modifica</button><button class="danger small" data-delete="${m.id}">Elimina</button></div>
          </div>`;
        }).join(''):'<div class="card empty">Nessuna partita registrata.</div>'}
      </div>`;
    document.getElementById('newMatch').onclick=()=>openMatchEditor();
    app.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openMatchEditor(b.dataset.edit));
    app.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteMatch(b.dataset.delete));
  }

  function blankMatch(){ return {id:id(),date:new Date().toISOString().slice(0,10),teamA:[],teamB:[],mvpA:'',mvpB:'',critica:'',notes:'',advancedTracked:false}; }
  function openMatchEditor(mid=null){ editingMatchId=mid; currentView='matchEdit'; document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active')); render(); }
  function workingMatch(){ return editingMatchId ? clone(data.matches.find(m=>m.id===editingMatchId)) : blankMatch(); }
  let matchDraft=null;

  function renderMatchEditor(){
    if(!matchDraft || (editingMatchId && matchDraft.id!==editingMatchId) || (!editingMatchId && data.matches.some(m=>m.id===matchDraft.id))) matchDraft=workingMatch();
    const m=matchDraft;
    const [sa,sb]=matchScore(m);
    const selected=new Set([...m.teamA,...m.teamB].map(x=>x.playerId));
    const available=data.players.filter(p=>p.active!==false && !selected.has(p.id)).sort((a,b)=>a.name.localeCompare(b.name,'it'));
    const allSelected=[...m.teamA,...m.teamB];
    const teamRows=(team,key)=>team.map((e,i)=>`
      <div class="player-row">
        <div><strong>${esc(playerName(e.playerId))}</strong><div class="muted">${esc(playerById(e.playerId)?.role||'')}</div></div>
        <div class="mini"><label>Gol</label><div class="stepper"><button data-step="${key}:${i}:goals:-1">−</button><input type="number" min="0" value="${Number(e.goals||0)}" data-num="${key}:${i}:goals"><button data-step="${key}:${i}:goals:1">+</button></div></div>
        <div class="mini"><label>Autogol</label><div class="stepper"><button data-step="${key}:${i}:ownGoals:-1">−</button><input type="number" min="0" value="${Number(e.ownGoals||0)}" data-num="${key}:${i}:ownGoals"><button data-step="${key}:${i}:ownGoals:1">+</button></div></div>
        <button class="ghost small" title="Rimuovi" data-remove="${key}:${i}">×</button>
      </div>`).join('');
    const opt=(list,current)=>`<option value="">Nessuno</option>${list.map(e=>`<option value="${e.playerId}" ${e.playerId===current?'selected':''}>${esc(playerName(e.playerId))}</option>`).join('')}`;
    app.innerHTML=`
      <div class="toolbar"><div><h2 style="margin:0">${editingMatchId?'Modifica partita':'Nuova partita'}</h2><div class="muted">Inserisci una volta i dati: classifica e dettagli vengono ricalcolati automaticamente.</div></div><button id="cancelMatch" class="ghost">Annulla</button></div>
      <div class="scoreboard"><div><div class="muted">Squadra A</div><div class="n">${sa}</div></div><div class="muted">${dateIT(m.date)}</div><div><div class="muted">Squadra B</div><div class="n">${sb}</div></div></div>
      <div class="card form-card">
        <div class="field" style="max-width:250px"><label>Data</label><input id="matchDate" type="date" value="${esc(m.date)}"></div>
        <label>Giocatori disponibili</label>
        <div class="player-pool">${available.length?available.map(p=>`<div class="pool-player"><strong>${esc(p.name)}</strong><button class="secondary small" data-add="A:${p.id}">A</button><button class="secondary small" data-add="B:${p.id}">B</button></div>`).join(''):'<span class="muted">Tutti i giocatori attivi sono già assegnati.</span>'}</div>
        <hr>
        <div class="grid-2">
          <div class="team-editor"><h3>Squadra A <span class="badge">${m.teamA.length} giocatori</span></h3>${teamRows(m.teamA,'teamA')||'<div class="muted">Aggiungi giocatori dalla lista.</div>'}</div>
          <div class="team-editor"><h3>Squadra B <span class="badge">${m.teamB.length} giocatori</span></h3>${teamRows(m.teamB,'teamB')||'<div class="muted">Aggiungi giocatori dalla lista.</div>'}</div>
        </div>
        <hr>
        <div class="grid-3">
          <div class="field"><label>MVP Squadra A</label><select id="mvpA">${opt(m.teamA,m.mvpA)}</select></div>
          <div class="field"><label>MVP Squadra B</label><select id="mvpB">${opt(m.teamB,m.mvpB)}</select></div>
          <div class="field"><label>Giocata della critica</label><select id="critica">${opt(allSelected,m.critica)}</select></div>
        </div>
        <div class="field"><label>Note</label><textarea id="matchNotes" rows="2" placeholder="Facoltative">${esc(m.notes||'')}</textarea></div>
        <div class="advanced">
          <label style="display:flex;gap:9px;align-items:center"><input id="advancedToggle" type="checkbox" ${m.advancedTracked?'checked':''}> Traccia dati tecnici oggettivi per questa partita</label>
          <div class="muted" style="margin:5px 0 10px">Facoltativo. Se attivo, niente voti 1–100: solo conteggi osservabili.</div>
          ${m.advancedTracked?advancedEditor(m):''}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px"><button id="cancelMatch2" class="ghost">Annulla</button><button id="saveMatch" class="primary">Salva partita</button></div>
      </div>`;
    bindMatchEditor();
  }

  function advancedEditor(m){
    const entries=[...m.teamA.map((e,i)=>({e,key:'teamA',i})),...m.teamB.map((e,i)=>({e,key:'teamB',i}))];
    if(!entries.length) return '<div class="muted">Aggiungi prima i giocatori.</div>';
    return `<div class="advanced-grid"><table><thead><tr><th class="name">Giocatore</th>${ADV_KEYS.map(x=>`<th>${x[1]}</th>`).join('')}</tr></thead><tbody>${entries.map(({e,key,i})=>`<tr><td class="name"><strong>${esc(playerName(e.playerId))}</strong></td>${ADV_KEYS.map(([k])=>`<td><input type="number" min="0" value="${Number(e[k]||0)}" data-adv="${key}:${i}:${k}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function bindMatchEditor(){
    document.getElementById('matchDate').onchange=e=>{matchDraft.date=e.target.value;renderMatchEditor()};
    document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{
      const [side,pid]=b.dataset.add.split(':');
      const entry={playerId:pid,goals:0,ownGoals:0,assists:0,shotsOnTarget:0,keyPasses:0,dribbles:0,recoveries:0,duelsWon:0,saves:0};
      matchDraft[side==='A'?'teamA':'teamB'].push(entry); renderMatchEditor();
    });
    document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{
      const [key,idx]=b.dataset.remove.split(':'); const removed=matchDraft[key].splice(Number(idx),1)[0];
      if(matchDraft.mvpA===removed.playerId) matchDraft.mvpA='';
      if(matchDraft.mvpB===removed.playerId) matchDraft.mvpB='';
      if(matchDraft.critica===removed.playerId) matchDraft.critica='';
      renderMatchEditor();
    });
    document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{
      const [key,idx,field,delta]=b.dataset.step.split(':');
      const e=matchDraft[key][Number(idx)]; e[field]=Math.max(0,Number(e[field]||0)+Number(delta)); renderMatchEditor();
    });
    document.querySelectorAll('[data-num]').forEach(inp=>inp.onchange=()=>{
      const [key,idx,field]=inp.dataset.num.split(':'); matchDraft[key][Number(idx)][field]=Math.max(0,Math.floor(Number(inp.value)||0)); renderMatchEditor();
    });
    document.getElementById('mvpA').onchange=e=>matchDraft.mvpA=e.target.value;
    document.getElementById('mvpB').onchange=e=>matchDraft.mvpB=e.target.value;
    document.getElementById('critica').onchange=e=>matchDraft.critica=e.target.value;
    document.getElementById('matchNotes').onchange=e=>matchDraft.notes=e.target.value;
    document.getElementById('advancedToggle').onchange=e=>{matchDraft.advancedTracked=e.target.checked;renderMatchEditor()};
    document.querySelectorAll('[data-adv]').forEach(inp=>inp.onchange=()=>{
      const [key,idx,field]=inp.dataset.adv.split(':'); matchDraft[key][Number(idx)][field]=Math.max(0,Math.floor(Number(inp.value)||0));
    });
    const cancel=()=>{matchDraft=null;editingMatchId=null;setView('matches')};
    document.getElementById('cancelMatch').onclick=cancel; document.getElementById('cancelMatch2').onclick=cancel;
    document.getElementById('saveMatch').onclick=saveMatchDraft;
  }
  function saveMatchDraft(){
    if(!matchDraft.date) return toast('Inserisci la data.');
    if(!matchDraft.teamA.length || !matchDraft.teamB.length) return toast('Inserisci almeno un giocatore per squadra.');
    const a=new Set(matchDraft.teamA.map(x=>x.playerId)), b=new Set(matchDraft.teamB.map(x=>x.playerId));
    if([...a].some(x=>b.has(x))) return toast('Un giocatore non può essere in entrambe le squadre.');
    if(matchDraft.mvpA && !a.has(matchDraft.mvpA)) matchDraft.mvpA='';
    if(matchDraft.mvpB && !b.has(matchDraft.mvpB)) matchDraft.mvpB='';
    if(editingMatchId){
      const i=data.matches.findIndex(x=>x.id===editingMatchId); data.matches[i]=clone(matchDraft);
    } else data.matches.push(clone(matchDraft));
    saveData('Partita salvata'); matchDraft=null; editingMatchId=null; setView('matches');
  }
  function deleteMatch(mid){
    const m=data.matches.find(x=>x.id===mid); if(!m) return;
    if(!confirm(`Eliminare la partita del ${dateIT(m.date)}? La classifica verrà ricalcolata.`)) return;
    data.matches=data.matches.filter(x=>x.id!==mid); saveData('Partita eliminata'); renderMatches();
  }

  function renderPlayers(){
    const stats=deriveStats(), profiles=objectiveProfiles();
    const ps=[...data.players].sort((a,b)=>(b.active!==false)-(a.active!==false) || (computeLegacyOvr(b)||0)-(computeLegacyOvr(a)||0) || a.name.localeCompare(b.name,'it'));
    app.innerHTML=`
      <div class="toolbar"><div><h2 style="margin:0 0 4px">Giocatori</h2><div class="muted">Anagrafica e valori tecnici del foglio originale, affiancati al rating automatico.</div></div><button id="newPlayer" class="primary">+ Giocatore</button></div>
      <div class="notice warn">I sei valori manuali del foglio Excel restano disponibili solo nell’area admin per compatibilità storica. Il Rating pubblico deriva esclusivamente dalle votazioni degli altri giocatori.</div>
      <div class="player-grid">${ps.map(p=>{
        const ovr=computeLegacyOvr(p), s=stats.get(p.id), prof=profiles.get(p.id);
        return `<div class="card player-card" style="${p.active===false?'opacity:.55':''}">
          <div class="player-top"><div><div class="role">${esc(p.role||'SENZA RUOLO')} · ${esc(ROLE_LABELS[p.role]||'')}</div><div class="player-name">${nationImg(p)} ${esc(p.name)}</div><div class="muted">${p.active===false?'Non attivo':`${s.played} partite · ${s.goals} gol`}</div></div><button class="secondary small" data-player-edit="${p.id}">Modifica</button></div>
          <div class="rating-pair"><div class="rating-box"><div class="muted">OVR Excel</div><div class="num">${ovr??'—'}</div></div></div>
          <div class="attrs">${Object.entries(ATTR_LABELS).map(([k,l])=>`<div class="attr"><span>${l}</span>${p.legacy?.[k]??'—'}</div>`).join('')}</div>
          ${prof?`<div class="muted" style="margin-top:9px">Profilo eventi: ${prof.tracked} partite tracciate</div>`:''}
        </div>`;
      }).join('')}</div>
      <div id="playerModal" class="modal hidden"></div>`;
    document.getElementById('newPlayer').onclick=()=>openPlayerModal();
    app.querySelectorAll('[data-player-edit]').forEach(b=>b.onclick=()=>openPlayerModal(b.dataset.playerEdit));
  }

  function openPlayerModal(pid=null){
    editingPlayerId=pid;
    const p=pid?clone(playerById(pid)):{id:id(),name:'',nationUrl:'',role:'',legacy:{velTuf:null,tirPre:null,passRin:null,driRif:null,difRea:null,fisPia:null},active:true};
    const modal=document.getElementById('playerModal'); modal.classList.remove('hidden');
    modal.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>${pid?'Modifica':'Nuovo'} giocatore</h2><button id="closePlayer" class="ghost">×</button></div>
      <div class="form-grid"><div class="field"><label>Nome</label><input id="pName" type="text" value="${esc(p.name)}"></div><div class="field"><label>Ruolo</label><select id="pRole"><option value="">Scegli</option>${Object.entries(ROLE_LABELS).map(([k,v])=>`<option value="${k}" ${p.role===k?'selected':''}>${k} · ${v}</option>`).join('')}</select></div></div>
      <div class="field"><label>URL bandiera/nazione</label><input id="pNation" type="text" value="${esc(p.nationUrl||'')}" placeholder="Facoltativo"></div>
      <label>Valori legacy Excel <span class="muted">(facoltativi)</span></label>
      <div class="form-grid six">${Object.entries(ATTR_LABELS).map(([k,l])=>`<div class="field"><label>${l}</label><input id="p-${k}" type="number" min="0" max="100" value="${p.legacy?.[k]??''}"></div>`).join('')}</div>
      <div class="field"><label style="display:flex;gap:9px;align-items:center"><input id="pActive" type="checkbox" ${p.active!==false?'checked':''}> Giocatore attivo</label></div>
      <div style="display:flex;justify-content:${pid?'space-between':'flex-end'};gap:8px"><div>${pid?'<button id="deletePlayer" class="danger">Elimina</button>':''}</div><div style="display:flex;gap:8px"><button id="cancelPlayer" class="ghost">Annulla</button><button id="savePlayer" class="primary">Salva</button></div></div>
    </div>`;
    const close=()=>modal.classList.add('hidden');
    document.getElementById('closePlayer').onclick=close; document.getElementById('cancelPlayer').onclick=close;
    document.getElementById('savePlayer').onclick=()=>{
      const name=document.getElementById('pName').value.trim(); if(!name) return toast('Inserisci il nome.');
      const duplicate=data.players.some(x=>x.id!==p.id && x.name.toLowerCase()===name.toLowerCase()); if(duplicate) return toast('Esiste già un giocatore con questo nome.');
      p.name=name; p.role=document.getElementById('pRole').value; p.nationUrl=document.getElementById('pNation').value.trim(); p.active=document.getElementById('pActive').checked;
      Object.keys(ATTR_LABELS).forEach(k=>{const v=document.getElementById('p-'+k).value;p.legacy[k]=v===''?null:Math.max(0,Math.min(100,Number(v)))});
      if(pid){ data.players[data.players.findIndex(x=>x.id===pid)]=p; } else data.players.push(p);
      saveData('Giocatore salvato'); close(); renderPlayers();
    };
    if(pid) document.getElementById('deletePlayer').onclick=()=>{
      const used=data.matches.some(m=>[...m.teamA,...m.teamB].some(e=>e.playerId===pid));
      if(used) return toast('È presente nello storico: disattivalo invece di eliminarlo.');
      if(confirm(`Eliminare ${p.name}?`)){data.players=data.players.filter(x=>x.id!==pid);saveData('Giocatore eliminato');close();renderPlayers();}
    };
  }

  function renderMethod(){
    const profiles=objectiveProfiles();
    const tracked=data.matches.filter(m=>m.advancedTracked).length;
    app.innerHTML=`
      <div class="toolbar"><div><h2 style="margin:0 0 4px">Metodo di calcolo</h2><div class="muted">Separiamo la replica del foglio dal nuovo sistema automatico.</div></div></div>
      <div class="grid-2">
        <div class="card pad method-section"><h3>1. Flannery Power Score · replica Excel</h3><p>La classifica corrente viene ricostruita dai dati partita per partita:</p>
          <p><span class="code">Punti = 3×V + 1×P</span></p>
          <p><span class="code">Power = Punti + MVP × max(Media punti, 1)</span></p>
          <p class="muted">La “Giocata della Critica” viene conteggiata ma non aumenta il Power Score. L’asterisco nel rendimento identifica l’MVP di quella squadra nella partita.</p>
        </div>
      </div>
      <div class="card pad method-section"><h3>OVR originale per ruolo</h3><div class="table-wrap"><table class="weight-table"><thead><tr><th>Ruolo</th>${Object.values(ATTR_LABELS).map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${Object.entries(OVR_WEIGHTS).map(([role,w])=>`<tr><td><strong>${role}</strong> · ${esc(ROLE_LABELS[role])}</td>${Object.keys(ATTR_LABELS).map(k=>`<td>${Math.round(w[k]*100)}%</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="muted">Come nell’Excel, il risultato è arrotondato per eccesso. Questi valori sono mantenuti perché fanno parte del sistema attuale, ma non sono oggettivi se i sei input vengono assegnati “a occhio”.</p></div>
      <div class="card pad method-section"><h3>Come rendere davvero oggettivi i valori tecnici</h3><p>Con i soli dati attuali non è possibile stimare in modo credibile passaggio, dribbling, difesa, riflessi o fisico. La soluzione meno arbitraria è registrare <strong>eventi contabili</strong>, non voti.</p>
        <div class="metric-list">
          <div class="metric"><strong>Finalizzazione</strong>Gol + tiri nello specchio. Permette gol/partita e conversione.</div>
          <div class="metric"><strong>Creazione</strong>Assist + passaggi chiave. Misura occasioni create senza assegnare un voto.</div>
          <div class="metric"><strong>1 contro 1</strong>Dribbling riusciti per partita.</div>
          <div class="metric"><strong>Difesa</strong>Recuperi/intercetti per partita.</div>
          <div class="metric"><strong>Duelli</strong>Duelli vinti per partita, più interpretabile del generico “fisico”.</div>
          <div class="metric"><strong>Portiere</strong>Parate per partita; con i tiri subiti si potrebbe aggiungere la percentuale di parate.</div>
        </div>
        <p style="margin-bottom:0">Nel modulo partita questi dati sono <strong>facoltativi</strong>. Partite con dati tecnici tracciati: <strong>${tracked}</strong>. Quando ce ne saranno abbastanza, l’app genera profili normalizzati rispetto al vostro gruppo, con regressione verso la media nelle prime partite.</p>
      </div>
      <div class="notice"><strong>Rating tecnico:</strong> nella versione pubblica è calcolato esclusivamente come media delle valutazioni ricevute dagli altri giocatori, con Overall ponderato in base al ruolo.</div>`;
  }

  function renderBackup(){
    app.innerHTML=`<div class="toolbar"><div><h2 style="margin:0 0 4px">Backup e portabilità</h2><div class="muted">Il prototipo salva sul browser. Esporta periodicamente un backup.</div></div></div>
      <div class="card pad"><h3>Dati locali</h3><p>Questa versione funziona anche senza server e conserva le modifiche in <strong>localStorage</strong> sul dispositivo. Per usare la stessa base dati da più telefoni serve collegarla a un backend condiviso.</p>
      <div class="backup-actions"><button id="exportJson" class="primary">Esporta backup JSON</button><button id="importJson" class="secondary">Importa backup JSON</button><button id="exportCsv" class="secondary">Esporta classifica CSV</button><button id="resetData" class="danger">Ripristina dati Excel iniziali</button><input id="importFile" class="file-input" type="file" accept="application/json,.json"></div>
      <hr><div class="muted">Giocatori: ${data.players.length} · Partite: ${data.matches.length} · Stagione: ${esc(data.season||'')}</div></div>`;
    document.getElementById('exportJson').onclick=()=>downloadBlob(`flannery-night-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),'application/json');
    document.getElementById('importJson').onclick=()=>document.getElementById('importFile').click();
    document.getElementById('importFile').onchange=async e=>{
      const f=e.target.files[0]; if(!f) return;
      try{ const x=JSON.parse(await f.text()); if(!Array.isArray(x.players)||!Array.isArray(x.matches)) throw new Error('Formato non valido'); data=x; saveData('Backup importato'); renderBackup(); }
      catch(err){toast('File JSON non valido');}
    };
    document.getElementById('exportCsv').onclick=exportStandingsCsv;
    document.getElementById('resetData').onclick=()=>{if(confirm('Ripristinare i dati iniziali importati dall’Excel? Le modifiche locali andranno perse.')){data=clone(window.FLANNERY_INITIAL_DATA);saveData('Dati iniziali ripristinati');renderBackup();}};
  }

  function downloadBlob(name,text,type){
    const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function csvCell(v){ const s=String(v??''); return /[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }
  function exportStandingsCsv(){
    const stats=deriveStats();
    const rows=[...stats.values()].filter(x=>x.played).sort((a,b)=>b.power-a.power);
    const header=['Nome','Giocate','Vinte','Pareggiate','Perse','Gol','Autogol','Media gol','Punti','Media punti','Rendimento','MVP','Critica','Power'];
    const body=rows.map(x=>{const o=obj.get(x.playerId);return [playerName(x.playerId),x.played,x.wins,x.draws,x.losses,x.goals,x.ownGoals,x.avgGoals,x.points,x.avgPoints,x.formText,x.mvp,x.critica,x.power,o.rating,o.confidence+'%']});
    downloadBlob('flannery-classifica.csv','\ufeff'+[header,...body].map(r=>r.map(csvCell).join(';')).join('\n'),'text/csv;charset=utf-8');
  }

  document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.getElementById('newMatchTop').addEventListener('click',()=>openMatchEditor());

  // Piccolo stile inline per le bandiere: evita un altro foglio solo per 3 regole.
  const flagStyle=document.createElement('style');
  flagStyle.textContent='.flag{width:23px;height:16px;object-fit:cover;border-radius:3px;vertical-align:-3px;margin-right:6px;background:#26342d}';
  document.head.appendChild(flagStyle);

  render();
})();