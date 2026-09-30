var FN = {
  DB_PROP: 'FLANNERY_DB_ID',
  DB_NAME: 'Flannery Night Backend',
  ACCESS: 'FN_ACCESS',
  VOTES: 'FN_VOTES',
  STATE: 'FN_STATE'
};

var PLAYERS = [
  ['salvio','Salvio','P'],['antonioportiere','AntonioPortiere','P'],['gabrieleportiere','GabrielePortiere','P'],
  ['guido','Guido','DC'],['kevin','Kevin','DC'],['fabio','Fabio','DL'],['vito','Vito','DL'],['mimmo','Mimmo','DL'],
  ['manuel','Manuel','DL'],['nicolas','Nicolas','DL'],['davide','Davide','DL'],['barzagli','Barzagli','DL'],['ivan','Ivan','DL'],
  ['antonio','Antonio','CC'],['carletto','Carletto','CC'],['gino','Gino','CC'],['ensino','Ensino','CC'],['angelo','Angelo','CC'],
  ['dom','Dom','CC'],['maledetto','Maledetto','CL'],['tanino','Tanino','CL'],['paolino','Paolino','CL'],['lob','Lob','CL'],
  ['koke','Koke','CL'],['mckennie','McKennie','CL'],['luzzo','Luzzo','CL'],['filippo','Filippo','CL'],['martin','Martin','PC'],
  ['pasquale','Pasquale','PC'],['ale','Ale','PC'],['peppe','Peppe','PC'],['frank','Frank','PC'],['lozio','LoZio','PC'],
  ['samuel','Samuel','PC']
];

function getDb() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(FN.DB_PROP);

  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      props.deleteProperty(FN.DB_PROP);
    }
  }

  var ss = SpreadsheetApp.create(FN.DB_NAME);
  props.setProperty(FN.DB_PROP, ss.getId());
  return ss;
}

function setupBackend() {
  var ss = getDb();

  var access = ss.getSheetByName(FN.ACCESS);
  if (!access) {
    access = ss.insertSheet(FN.ACCESS);
    access.appendRow(['playerId','name','role','salt','pinHash','pinOrigin','active','updatedAt']);
  }

  if (access.getLastRow() <= 1) {
    var rows = [];
    var i;
    for (i = 0; i < PLAYERS.length; i++) {
      rows.push([PLAYERS[i][0],PLAYERS[i][1],PLAYERS[i][2],'','','',true,new Date()]);
    }
    if (rows.length > 0) {
      access.getRange(2,1,rows.length,8).setValues(rows);
    }
  }

  var votes = ss.getSheetByName(FN.VOTES);
  if (!votes) {
    votes = ss.insertSheet(FN.VOTES);
    votes.appendRow(['voterId','targetId','velTuf','tirPre','passRin','driRif','difRea','fisPia','updatedAt']);
  }

  var state = ss.getSheetByName(FN.STATE);
  if (!state) {
    state = ss.insertSheet(FN.STATE);
    state.appendRow(['part','value','updatedAt']);
  }

  var defaultSheet = ss.getSheetByName('Foglio1');
  if (!defaultSheet) defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 2) {
    ss.deleteSheet(defaultSheet);
  }

  Logger.log('Backend creato/usato: ' + ss.getUrl());
  return ss.getUrl();
}

function resetBackendLink() {
  PropertiesService.getScriptProperties().deleteProperty(FN.DB_PROP);
  return 'Collegamento backend azzerato. Esegui di nuovo setupBackend().';
}

function doPost(e) {
  ensureStorage_();

  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    if (body.action === 'adminSaveState') {
      var state = body.state;
      if (!state || !Array.isArray(state.players) || !Array.isArray(state.matches)) {
        throw new Error('Stato stagione non valido.');
      }
      saveSeasonState_(state);
      return json_({ok:true, syncId:state._syncId || null});
    }

    return json_({ok:false, error:'Azione non valida'});
  } catch (err) {
    return json_({ok:false, error:(err && err.message) ? err.message : String(err)});
  }
}

function doGet(e) {
  ensureStorage_();
  var p = (e && e.parameter) ? e.parameter : {};

  if (p.page === 'votes') {
    return HtmlService.createHtmlOutputFromFile('Votes')
      .setTitle('Flannery Night - Votazioni')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (p.page === 'adminbridge') {
    return HtmlService.createHtmlOutput(adminBridgeHtml_())
      .setTitle('Flannery Night Admin Bridge')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if ((p.action || 'health') === 'publicState') {
    var payload = {ok:true, state:getSeasonState_(), ratings:getMedians_()};
    var cb = String(p.prefix || '');
    if (cb && /^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(cb)) {
      return ContentService.createTextOutput(cb + '(' + JSON.stringify(payload) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return json_(payload);
  }

  return json_({ok:true, service:'Flannery Night', version:4});
}

function uiBootstrap() {
  ensureStorage_();
  return {players:playerObjects_()};
}

function uiPlayerPinStatus(playerId) {
  ensureStorage_();
  return {hasPin:hasUserPin_(playerId)};
}

function uiRegisterPlayerPin(playerId, pin) {
  ensureStorage_();
  createPin_(playerId, pin);
  return {ok:true};
}

function uiLogin(playerId, pin) {
  ensureStorage_();
  requirePin_(playerId, pin);
  return {ok:true, players:playerObjects_(), votes:getMyVotes_(playerId)};
}

function uiSubmitVote(voterId, pin, targetId, v) {
  ensureStorage_();
  requirePin_(voterId, pin);

  var vote = {
    voterId:voterId,
    targetId:targetId,
    velTuf:Number(v.velTuf),
    tirPre:Number(v.tirPre),
    passRin:Number(v.passRin),
    driRif:Number(v.driRif),
    difRea:Number(v.difRea),
    fisPia:Number(v.fisPia)
  };

  validateVote_(vote);
  saveVote_(vote);
  return {ok:true, ratings:getMedians_()};
}

function uiAdminGetState() {
  ensureStorage_();
  return {ok:true, state:getSeasonState_()};
}

function uiAdminSaveState(state) {
  ensureStorage_();
  if (!state || !Array.isArray(state.players) || !Array.isArray(state.matches)) {
    throw new Error('Stato stagione non valido.');
  }
  saveSeasonState_(state);
  return {ok:true, savedAt:new Date().toISOString()};
}

function getSeasonState_() {
  var sh = getDb().getSheetByName(FN.STATE);
  if (!sh || sh.getLastRow() < 2) return null;

  var rows = sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  rows.sort(function(a,b){ return Number(a[0]) - Number(b[0]); });

  var text = '';
  for (var i=0; i<rows.length; i++) {
    if (rows[i][1] !== '' && rows[i][1] !== null) text += String(rows[i][1]);
  }
  if (!text) return null;

  try {
    var state = JSON.parse(text);
    if (!state || !Array.isArray(state.players) || !Array.isArray(state.matches)) return null;
    return state;
  } catch (err) {
    return null;
  }
}

function saveSeasonState_(state) {
  var sh = getDb().getSheetByName(FN.STATE);
  var text = JSON.stringify(state);
  var chunkSize = 30000;
  var rows = [];
  var part = 1;

  for (var i=0; i<text.length; i+=chunkSize) {
    rows.push([part++, text.substring(i,i+chunkSize), new Date()]);
  }

  if (sh.getLastRow() > 1) {
    sh.getRange(2,1,sh.getLastRow()-1,3).clearContent();
  }
  if (rows.length) {
    sh.getRange(2,1,rows.length,3).setValues(rows);
  }
}

function adminBridgeHtml_() {
  return '<!doctype html><html><head><base target="_top"></head><body>' +
    '<script>' +
    'window.addEventListener("message",function(ev){' +
      'var m=ev.data||{};' +
      'if(!m||m.type!=="flannery-admin")return;' +
      'var id=m.id;' +
      'var done=function(result){parent.postMessage({type:"flannery-admin-result",id:id,ok:true,result:result},"*");};' +
      'var fail=function(err){parent.postMessage({type:"flannery-admin-result",id:id,ok:false,error:(err&&err.message)||String(err)},"*");};' +
      'var r=google.script.run.withSuccessHandler(done).withFailureHandler(fail);' +
      'if(m.action==="getState")r.uiAdminGetState();' +
      'else if(m.action==="saveState")r.uiAdminSaveState(m.state);' +
      'else fail(new Error("Azione non valida"));' +
    '});' +
    'parent.postMessage({type:"flannery-admin-ready"},"*");' +
    '<\/script></body></html>';
}

function ensureStorage_() {
  var ss = getDb();
  var access = ss.getSheetByName(FN.ACCESS);

  if (!access) {
    access = ss.insertSheet(FN.ACCESS);
    access.appendRow(['playerId','name','role','salt','pinHash','pinOrigin','active','updatedAt']);
  }

  ensurePinOrigin_(access);

  if (access.getLastRow() <= 1) {
    var rows = [];
    for (var i=0; i<PLAYERS.length; i++) {
      rows.push([PLAYERS[i][0],PLAYERS[i][1],PLAYERS[i][2],'','','',true,new Date()]);
    }
    access.getRange(2,1,rows.length,rows[0].length).setValues(rows);
  }

  var votes = ss.getSheetByName(FN.VOTES);
  if (!votes) {
    votes = ss.insertSheet(FN.VOTES);
    votes.appendRow(['voterId','targetId','velTuf','tirPre','passRin','driRif','difRea','fisPia','updatedAt']);
  }

  var state = ss.getSheetByName(FN.STATE);
  if (!state) {
    state = ss.insertSheet(FN.STATE);
    state.appendRow(['part','value','updatedAt']);
  }
}

function ensurePinOrigin_(sheet) {
  var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('pinOrigin') >= 0) return;

  var activeIndex = headers.indexOf('active');
  var insertBefore = activeIndex >= 0 ? activeIndex + 1 : sheet.getLastColumn() + 1;
  sheet.insertColumnBefore(insertBefore);
  sheet.getRange(1,insertBefore).setValue('pinOrigin');
}

function playerObjects_() {
  var out = [];
  for (var i=0; i<PLAYERS.length; i++) {
    out.push({id:PLAYERS[i][0], name:PLAYERS[i][1], role:PLAYERS[i][2]});
  }
  return out;
}

function hasUserPin_(playerId) {
  var row = accessRow_(playerId);
  if (!row) return false;
  return String(row.pinOrigin || '') === 'user' && !!row.salt && !!row.pinHash;
}

function createPin_(playerId, pin) {
  pin = String(pin || '');
  if (!/^\d{6}$/.test(pin)) throw new Error('Il PIN deve avere esattamente 6 cifre.');

  var sh = getDb().getSheetByName(FN.ACCESS);
  var data = sh.getDataRange().getValues();
  var h = headerMap_(data[0]);
  var r = findPlayerRowIndex_(data, h, playerId);
  if (r < 1) throw new Error('Giocatore non trovato.');
  if (String(data[r][h.pinOrigin] || '') === 'user') throw new Error('Questo giocatore ha gia creato il PIN.');

  var salt = Utilities.getUuid();
  sh.getRange(r+1,h.salt+1).setValue(salt);
  sh.getRange(r+1,h.pinHash+1).setValue(hash_(pin,salt));
  sh.getRange(r+1,h.pinOrigin+1).setValue('user');
  sh.getRange(r+1,h.updatedAt+1).setValue(new Date());
}

function requirePin_(playerId, pin) {
  if (!verifyPin_(playerId, pin)) throw new Error('Giocatore o PIN non validi.');
}

function verifyPin_(playerId, pin) {
  pin = String(pin || '');
  if (!/^\d{6}$/.test(pin)) return false;

  var row = accessRow_(playerId);
  if (!row || String(row.pinOrigin || '') !== 'user') return false;
  return safeEqual_(String(row.pinHash), hash_(pin,String(row.salt)));
}

function accessRow_(playerId) {
  var sh = getDb().getSheetByName(FN.ACCESS);
  var data = sh.getDataRange().getValues();
  var h = headerMap_(data[0]);
  var r = findPlayerRowIndex_(data, h, playerId);
  if (r < 1) return null;

  return {
    playerId:data[r][h.playerId],
    salt:data[r][h.salt],
    pinHash:data[r][h.pinHash],
    pinOrigin:data[r][h.pinOrigin],
    active:data[r][h.active]
  };
}

function findPlayerRowIndex_(data, h, playerId) {
  for (var i=1; i<data.length; i++) {
    if (String(data[i][h.playerId]) === String(playerId) && String(data[i][h.active]).toLowerCase() !== 'false') return i;
  }
  return -1;
}

function getMyVotes_(voterId) {
  var sh = getDb().getSheetByName(FN.VOTES);
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  var h = headerMap_(data[0]);
  var out = [];
  for (var i=1; i<data.length; i++) {
    if (String(data[i][h.voterId]) !== String(voterId)) continue;
    out.push({
      target_id:String(data[i][h.targetId]),
      vel_tuf:Number(data[i][h.velTuf]),
      tir_pre:Number(data[i][h.tirPre]),
      pass_rin:Number(data[i][h.passRin]),
      dri_rif:Number(data[i][h.driRif]),
      dif_rea:Number(data[i][h.difRea]),
      fis_pia:Number(data[i][h.fisPia])
    });
  }
  return out;
}

function validateVote_(v) {
  if (!v.voterId || !v.targetId) throw new Error('Giocatore non valido.');
  if (String(v.voterId) === String(v.targetId)) throw new Error('Non puoi votare te stesso.');

  var keys = ['velTuf','tirPre','passRin','driRif','difRea','fisPia'];
  for (var i=0; i<keys.length; i++) {
    var n = Number(v[keys[i]]);
    if (Math.floor(n) !== n || n < 1 || n > 99) throw new Error('Tutti i voti devono essere interi da 1 a 99.');
  }
}

function saveVote_(v) {
  var sh = getDb().getSheetByName(FN.VOTES);
  var data = sh.getDataRange().getValues();
  var h = headerMap_(data[0]);
  var row = -1;

  for (var i=1; i<data.length; i++) {
    if (String(data[i][h.voterId]) === String(v.voterId) && String(data[i][h.targetId]) === String(v.targetId)) {
      row = i + 1;
      break;
    }
  }

  var values = [[v.voterId,v.targetId,v.velTuf,v.tirPre,v.passRin,v.driRif,v.difRea,v.fisPia,new Date()]];
  if (row > 0) sh.getRange(row,1,1,9).setValues(values);
  else sh.appendRow(values[0]);
}

function getMedians_() {
  var ss = getDb();
  var access = ss.getSheetByName(FN.ACCESS).getDataRange().getValues();
  var ah = headerMap_(access[0]);
  var roles = {};
  var i;
  for (i=1; i<access.length; i++) roles[String(access[i][ah.playerId])] = String(access[i][ah.role]);

  var votes = ss.getSheetByName(FN.VOTES).getDataRange().getValues();
  var out = {};

  if (votes.length > 1) {
    var vh = headerMap_(votes[0]);
    for (i=1; i<votes.length; i++) {
      var id = String(votes[i][vh.targetId]);
      if (!out[id]) out[id] = {voters:0,vel_tuf:[],tir_pre:[],pass_rin:[],dri_rif:[],dif_rea:[],fis_pia:[]};
      out[id].voters++;
      out[id].vel_tuf.push(Number(votes[i][vh.velTuf]));
      out[id].tir_pre.push(Number(votes[i][vh.tirPre]));
      out[id].pass_rin.push(Number(votes[i][vh.passRin]));
      out[id].dri_rif.push(Number(votes[i][vh.driRif]));
      out[id].dif_rea.push(Number(votes[i][vh.difRea]));
      out[id].fis_pia.push(Number(votes[i][vh.fisPia]));
    }
  }

  var result = [];
  for (i=0; i<PLAYERS.length; i++) {
    var pid = PLAYERS[i][0];
    var a = out[pid];
    if (!a) {
      result.push({player_id:pid,voters:0,vel_tuf:null,tir_pre:null,pass_rin:null,dri_rif:null,dif_rea:null,fis_pia:null,overall:null});
      continue;
    }

    var r = {
      player_id:pid,
      voters:a.voters,
      vel_tuf:median_(a.vel_tuf),
      tir_pre:median_(a.tir_pre),
      pass_rin:median_(a.pass_rin),
      dri_rif:median_(a.dri_rif),
      dif_rea:median_(a.dif_rea),
      fis_pia:median_(a.fis_pia)
    };
    r.overall = round1_(overall_(roles[pid],r));
    result.push(r);
  }
  return result;
}

function median_(a) {
  var b = a.slice().sort(function(x,y){return x-y;});
  var m = Math.floor(b.length/2);
  return b.length % 2 ? b[m] : round1_((b[m-1]+b[m])/2);
}

function overall_(role,a) {
  var v=a.vel_tuf,t=a.tir_pre,p=a.pass_rin,d=a.dri_rif,df=a.dif_rea,f=a.fis_pia;
  if (role==='P')  return .25*v+.15*t+.10*p+.25*d+.10*df+.15*f;
  if (role==='DC') return .15*v+.10*p+.05*d+.40*df+.30*f;
  if (role==='DL') return .20*v+.15*p+.05*d+.30*df+.30*f;
  if (role==='CC') return .15*v+.15*t+.30*p+.15*d+.15*df+.10*f;
  if (role==='CL') return .30*v+.10*t+.20*p+.25*d+.05*df+.10*f;
  if (role==='PC') return .20*v+.40*t+.05*p+.15*d+.20*f;
  return (v+t+p+d+df+f)/6;
}

function headerMap_(row) {
  var h = {};
  for (var i=0; i<row.length; i++) h[String(row[i])] = i;
  return h;
}

function hash_(value,salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt)+'|'+String(value), Utilities.Charset.UTF_8);
  var out = '';
  for (var i=0; i<bytes.length; i++) {
    var n = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    out += ('0' + n.toString(16)).slice(-2);
  }
  return out;
}

function safeEqual_(a,b) {
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i=0; i<a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function round1_(n) {
  return Math.round(Number(n)*10)/10;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function diagnoseFlannery() {
  ensureStorage_();
  return {
    ok:true,
    spreadsheetId:getDb().getId(),
    accessRows:getDb().getSheetByName(FN.ACCESS).getLastRow(),
    votesRows:getDb().getSheetByName(FN.VOTES).getLastRow(),
    stateParts:getDb().getSheetByName(FN.STATE).getLastRow()-1,
    mimmoHasPin:hasUserPin_('mimmo')
  };
}