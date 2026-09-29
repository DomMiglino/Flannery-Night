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

  async function initBackend(){
    const url=window.FLANNERY_API_URL||'';
    if(!url) return;
    db=true;
    try{
      const r=await apiPost({action:'publicState'});
      if(r.state && r.state.players && r.state.matches) data=r.state;
      peerRatings=new Map((r.ratings||[]).map(x=>[x.player_id,x]));
    }catch(e){
      console.warn('Backend Google non disponibile',e);
    }
  }

  async function loadPeerRatings(){
    if(!db)return;
    const r=await apiPost({action:'publicState'});
    peerRatings=new Map((r.ratings||[]).map(x=>[x.player_id,x]));
  }

  function setView(v){
    currentView=v;
    document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
    render();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function render(){
    if(currentView==='dashboard')renderDashboard();
    else if(currentView==='matches')renderMatches();
    else if(currentView==='details')renderDetails();
    else if(currentView==='players')renderPlayers();
    else if(currentView==='method')renderMethod();
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
    const rows=[...played].sort((a,b)=>b.power-a.power||b.points-a.points||b.avgPoints-a.avgPoints||b.goals-a.goals);
    const goals=data.matches.reduce((t,m)=>{const [a,b]=matchScore(m);return t+a+b},0);
    const leader=[...played].sort((a,b)=>b.power-a.power)[0];
    const scorer=[...played].sort((a,b)=>b.goals-a.goals)[0];
    app.innerHTML=`
      <div class="toolbar">
        <div><h2 style="margin:0">Classifica · Flannery Power</h2><div class="muted">Classifica unica della stagione.</div></div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="label">Partite</div><div class="value">${data.matches.length}</div></div>
        <div class="kpi"><div class="label">Gol totali</div><div class="value">${goals}</div></div>
        <div class="kpi"><div class="label">Leader Power</div><div class="value">${leader?esc(playerName(leader.playerId)):'-'}</div></div>
        <div class="kpi"><div class="label">Capocannoniere</div><div class="value">${scorer?esc(playerName(scorer.playerId)):'-'}</div></div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th class="name">Giocatore</th><th>G</th><th>V</th><th>P</th><th>S</th><th>Gol</th><th>Media gol</th><th>Punti</th><th>Media pt</th><th>Forma</th><th>MVP</th><th>Critica</th><th>Power</th></tr></thead>
        <tbody>${rows.map((x,i)=>`<tr>
          <td class="rank">${i+1}</td><td class="name"><strong>${esc(playerName(x.playerId))}</strong></td>
          <td>${x.played}</td><td>${x.wins}</td><td>${x.draws}</td><td>${x.losses}</td><td>${x.goals}</td><td>${fmt1(x.avgGoals)}</td><td>${x.points}</td><td>${fmt1(x.avgPoints)}</td>
          <td>${formBadge(x)}</td><td>${x.mvp}</td><td>${x.critica}</td>
          <td class="power">${fmt1(x.power)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
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

  function renderDetails(){
    const rows=[];
    [...data.matches].sort((a,b)=>a.date.localeCompare(b.date)).forEach(m=>{
      const [sa,sb]=matchScore(m),[ra,rb]=resultCodes(sa,sb);
      [[m.teamA,'A',ra,m.mvpA],[m.teamB,'B',rb,m.mvpB]].forEach(([team,t,res,mvp])=>{
        team.forEach(e=>rows.push({date:m.date,team:t,player:e.playerId,result:res,goals:e.goals||0,own:e.ownGoals||0,mvp:e.playerId===mvp,crit:e.playerId===m.critica}));
      });
    });
    app.innerHTML=`<div class="toolbar"><div><h2 style="margin:0">Dettagli</h2><div class="muted">Vista generata automaticamente dalle partite.</div></div></div>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th class="name">Giocatore</th><th>Squadra</th><th>Esito</th><th>Gol</th><th>Autogol</th><th>MVP</th><th>Critica</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${dateIT(r.date)}</td><td class="name">${esc(playerName(r.player))}</td><td>${r.team}</td><td>${r.result}</td><td>${r.goals}</td><td>${r.own}</td><td>${r.mvp?'★':''}</td><td>${r.crit?'✓':''}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderPlayers(){
    const players=[...data.players].filter(p=>p.active).sort((a,b)=>a.name.localeCompare(b.name));
    app.innerHTML=`
      <div class="toolbar"><div><h2 style="margin:0">Giocatori</h2><div class="muted">I valori tecnici mostrati sono esclusivamente le medie anonime dei voti ricevuti dagli altri giocatori.</div></div></div>
      <div class="notice">Nessun valore tecnico inserito dagli amministratori viene mostrato in questa versione. L'Overall usa le stesse ponderazioni per ruolo della classifica originale, applicate alle medie dei voti della community.</div>
      <div class="player-grid">${players.map(p=>{
        const r=peerRatings.get(p.id);
        const voters=Number(r?.voters||0);
        return `<div class="card player-card">
          <div class="player-top"><div><div class="player-name">${esc(p.name)}</div><div class="role">${esc(p.role)} · ${esc(ROLE_LABELS[p.role]||'')}</div></div>
          <div class="rating-box"><div class="muted">OVR</div><div class="num">${voters?fmt1(r.overall):'n/d'}</div></div></div>
          <div class="attrs">${ATTRS.map(([k,l])=>`<div class="attr"><span>${l}</span><strong>${voters?fmt1(r[k]):'n/d'}</strong></div>`).join('')}</div>
          <div class="muted" style="margin-top:10px">${voters} votant${voters===1?'e':'i'}</div>
        </div>`;
      }).join('')}</div>`;
  }

  function renderMethod(){
    app.innerHTML=`
      <div class="card pad">
        <h2>Rating</h2>
        <p>Il <strong>Rating tecnico del giocatore</strong> deriva esclusivamente dai voti anonimi assegnati dagli altri calciatori. Nessun risultato di squadra, MVP o altro indicatore entra nel Rating.</p>
        <p>Ogni votante può valutare tutti tranne sé stesso sui sei attributi originari: VEL/TUF, TIR/PRE, PASS/RIN, DRI/RIF, DIF/REA e FIS/PIA. Per ogni giocatore vengono pubblicate soltanto le medie aggregate.</p>
        <p>L'Overall è calcolato sulle medie con le stesse ponderazioni per ruolo già adottate nel foglio originale.</p>
        <div class="notice warn">I voti individuali non sono pubblici. Un giocatore può aggiornare i propri voti, ma esiste una sola valutazione valida per ogni coppia votante → giocatore.</div>
      </div>`;
  }

  function loginForm(){
    const options=[...data.players].filter(p=>p.active).sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    return `<div class="card form-card" style="max-width:620px">
      <h2>Identificati come giocatore</h2>
      <p class="muted">Serve il PIN personale per impedire che qualcuno voti usando il nome di un altro giocatore.</p>
      <div class="field"><label>Giocatore</label><select id="voterSelect"><option value="">Seleziona...</option>${options}</select></div>
      <div class="field"><label>PIN personale</label><input id="voterPin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="PIN"></div>
      <button id="loginVote" class="primary">Accedi alle votazioni</button>
    </div>`;
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
    if(!db){
      app.innerHTML=`<div class="card pad"><h2>Votazioni</h2><div class="notice warn">Il sistema di voto condiviso è pronto nell'interfaccia, ma il database non è ancora collegato. Appena viene configurato, questa pagina permetterà l'identificazione con PIN e il salvataggio centralizzato dei voti.</div></div>`;
      return;
    }
    if(!voterSession){
      app.innerHTML=loginForm();
      document.getElementById('loginVote').onclick=voteLogin;
      return;
    }
    const me=playerById(voterSession.id);
    const targets=[...data.players].filter(p=>p.active&&p.id!==voterSession.id).sort((a,b)=>a.name.localeCompare(b.name));
    app.innerHTML=`
      <div class="toolbar"><div><h2 style="margin:0">Votazioni</h2><div class="muted">Hai effettuato l'accesso come <strong>${esc(me?.name||'')}</strong>. Non puoi votare te stesso.</div></div><button id="logoutVote" class="secondary">Esci</button></div>
      <div class="notice">Valuta ogni giocatore da 1 a 99. Puoi tornare in qualsiasi momento e modificare i voti già inviati.</div>
      <div class="grid-2">${targets.map(voteCard).join('')}</div>`;
    document.getElementById('logoutVote').onclick=()=>{voterSession=null;myVotes.clear();renderVotes();};
    app.querySelectorAll('.save-vote').forEach(btn=>btn.onclick=()=>saveVote(btn.closest('.vote-card')));
  }

  async function voteLogin(){
    const id=document.getElementById('voterSelect').value;
    const pin=document.getElementById('voterPin').value.trim();
    if(!id||!pin){toast('Seleziona il giocatore e inserisci il PIN');return;}
    const btn=document.getElementById('loginVote');btn.disabled=true;btn.textContent='Verifica...';
    try{
      const vr=await apiPost({action:'verifyPlayer',playerId:id,pin});
      if(!vr.ok){throw new Error('Identificazione non valida');}
      voterSession={id,pin};
      const mv=await apiPost({action:'myVotes',playerId:id,pin});
      myVotes=new Map((mv.votes||[]).map(x=>[x.target_id,x]));
      renderVotes();
    }catch(e){
      btn.disabled=false;btn.textContent='Accedi alle votazioni';toast('Giocatore o PIN non validi');
    }
  }

  async function saveVote(card){
    const target=card.dataset.target;
    const vals={};
    let valid=true;
    card.querySelectorAll('[data-attr]').forEach(inp=>{
      const n=Number(inp.value);
      if(!Number.isInteger(n)||n<1||n>99)valid=false;
      vals[inp.dataset.attr]=n;
    });
    if(!valid){toast('Inserisci tutti i voti con valori interi da 1 a 99');return;}
    const btn=card.querySelector('.save-vote');btn.disabled=true;btn.textContent='Salvataggio...';
    try{
      const out=await apiPost({
        action:'submitVote',
        voterId:voterSession.id,pin:voterSession.pin,targetId:target,
        velTuf:vals.vel_tuf,tirPre:vals.tir_pre,passRin:vals.pass_rin,
        driRif:vals.dri_rif,difRea:vals.dif_rea,fisPia:vals.fis_pia
      });
      btn.disabled=false;btn.textContent='Salva voto';
      myVotes.set(target,{target_id:target,...vals});
      peerRatings=new Map((out.ratings||[]).map(x=>[x.player_id,x]));
      toast('Voto salvato');
      renderVotes();
    }catch(e){
      btn.disabled=false;btn.textContent='Salva voto';toast(e.message||'Salvataggio non riuscito');
    }
  }

  document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>setView(b.dataset.view));

  (async()=>{
    await initBackend();
    render();
  })();
})();