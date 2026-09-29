const FN = {
  SPREADSHEET_ID: '1HovZP5Owurvko_mnl2UeG08C38_HyytLKWSz8xx2BDw',
  ACCESS_SHEET: 'FN_ACCESS',
  VOTES_SHEET: 'FN_VOTES',
  STATE_SHEET: 'FN_STATE',
  PIN_EXPORT_SHEET: 'FN_PIN_EXPORT',
  PIN_FAILURE_LIMIT: 5,
  PIN_LOCK_SECONDS: 600
};

const FN_PLAYERS = [
  ['salvio','Salvio','P'],['antonioportiere','AntonioPortiere','P'],['gabrieleportiere','GabrielePortiere','P'],
  ['guido','Guido','DC'],['kevin','Kevin','DC'],['fabio','Fabio','DL'],['vito','Vito','DL'],['mimmo','Mimmo','DL'],
  ['manuel','Manuel','DL'],['nicolas','Nicolas','DL'],['davide','Davide','DL'],['barzagli','Barzagli','DL'],['ivan','Ivan','DL'],
  ['antonio','Antonio','CC'],['carletto','Carletto','CC'],['gino','Gino','CC'],['ensino','Ensino','CC'],['angelo','Angelo','CC'],
  ['dom','Dom','CC'],['maledetto','Maledetto','CL'],['tanino','Tanino','CL'],['paolino','Paolino','CL'],['lob','Lob','CL'],
  ['koke','Koke','CL'],['mckennie','McKennie','CL'],['luzzo','Luzzo','CL'],['filippo','Filippo','CL'],['martin','Martin','PC'],
  ['pasquale','Pasquale','PC'],['ale','Ale','PC'],['peppe','Peppe','PC'],['frank','Frank','PC'],['lozio','LoZio','PC'],
  ['samuel','Samuel','PC']
];

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};

    if (params.page === 'votes') {
      return HtmlService
        .createHtmlOutputFromFile('Votes')
        .setTitle('Flannery Night · Votazioni')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    const action = params.action || 'health';

    if (action === 'health') {
      return json_({ok:true, service:'Flannery Night', version:3});
    }

    if (action === 'publicState') {
      const payload = publicState_();
      const prefix = String(params.prefix || '');

      // JSONP is used only for public, non-sensitive aggregate data.
      if (prefix && /^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(prefix)) {
        return ContentService
          .createTextOutput(prefix + '(' + JSON.stringify(payload) + ');')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }

      return json_(payload);
    }

    return json_({ok:false,error:'Azione non valida'});
  } catch (err) {
    return json_({ok:false,error:safeError_(err)});
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = body.action || '';

    if (action === 'publicState') return json_(publicState_());

    if (action === 'playerPinStatus') {
      return json_({ok:true, hasPin:playerHasPin_(body.playerId)});
    }

    if (action === 'registerPlayerPin') {
      registerPlayerPin_(body.playerId, body.pin);
      return json_({ok:true});
    }

    if (action === 'verifyPlayer') {
      const ok = verifyPlayerPin_(body.playerId, body.pin);
      return json_({ok});
    }

    if (action === 'myVotes') {
      requirePlayer_(body.playerId, body.pin);
      return json_({ok:true, votes:getMyVotes_(body.playerId)});
    }

    if (action === 'submitVote') {
      requirePlayer_(body.voterId, body.pin);
      validateVote_(body);
      upsertVote_(body);
      return json_({ok:true, ratings:getPeerRatingMedians_()});
    }

    if (action === 'adminGetState') {
      requireAdmin_(body.adminSecret);
      return json_({ok:true, state:getState_()});
    }

    if (action === 'adminSaveState') {
      requireAdmin_(body.adminSecret);
      if (!body.state || typeof body.state !== 'object') throw new Error('Stato non valido');
      saveState_(body.state);
      syncAccessNamesFromState_(body.state);
      return json_({ok:true});
    }

    return json_({ok:false,error:'Azione non valida'});
  } catch (err) {
    return json_({ok:false,error:safeError_(err)});
  }
}


/**
 * Functions exposed only to the Apps Script Votes.html page through google.script.run.
 * They avoid cross-origin fetch calls from GitHub Pages.
 */
function uiBootstrap() {
  return {
    players: FN_PLAYERS.map(([id,name,role]) => ({id,name,role}))
  };
}

function uiPlayerPinStatus(playerId) {
  return {hasPin: playerHasPin_(playerId)};
}

function uiRegisterPlayerPin(playerId, pin) {
  registerPlayerPin_(playerId, pin);
  return {ok:true};
}

function uiLogin(playerId, pin) {
  requirePlayer_(playerId, pin);
  return {
    ok:true,
    votes:getMyVotes_(playerId),
    players:FN_PLAYERS.map(([id,name,role]) => ({id,name,role}))
  };
}

function uiSubmitVote(voterId, pin, targetId, values) {
  requirePlayer_(voterId, pin);

  const body = {
    voterId:voterId,
    targetId:targetId,
    velTuf:Number(values && values.velTuf),
    tirPre:Number(values && values.tirPre),
    passRin:Number(values && values.passRin),
    driRif:Number(values && values.driRif),
    difRea:Number(values && values.difRea),
    fisPia:Number(values && values.fisPia)
  };

  validateVote_(body);
  upsertVote_(body);

  return {
    ok:true,
    ratings:getPeerRatingMedians_()
  };
}

/**
 * Run ONCE from the Apps Script editor.
 * Creates the database sheets and generates one PIN for every player.
 * PINs are written only to FN_PIN_EXPORT so you can distribute them.
 */
function setupFlanneryNight() {
  const ss = ss_();

  const access = getOrCreateSheet_(FN.ACCESS_SHEET, ['playerId','name','role','salt','pinHash','active','updatedAt']);
  const votes = getOrCreateSheet_(FN.VOTES_SHEET, ['voterId','targetId','velTuf','tirPre','passRin','driRif','difRea','fisPia','updatedAt']);
  const state = getOrCreateSheet_(FN.STATE_SHEET, ['key','value','updatedAt']);
  if (access.getLastRow() > 1) {
    throw new Error('FN_ACCESS contiene già dati. Setup interrotto per non sovrascrivere gli accessi esistenti.');
  }

  const rows = [];
  FN_PLAYERS.forEach(([id,name,role]) => {
    rows.push([id,name,role,'','',true,new Date()]);
  });

  if (rows.length) access.getRange(2,1,rows.length,rows[0].length).setValues(rows);

  access.hideSheet();
  votes.hideSheet();
  state.hideSheet();

  return {
    ok:true,
    message:'Setup completato. Ogni giocatore creerà il proprio PIN di 6 cifre al primo accesso dalla webapp.'
  };
}

/**
 * Run once from the editor to set the shared admin secret used by admin.html.
 * Example: setAdminSecret('una-frase-lunga-che-conosci-solo-tu')
 */
function setAdminSecret(secret) {
  if (!secret || String(secret).length < 12) throw new Error('Usa una password admin di almeno 12 caratteri.');
  const props = PropertiesService.getScriptProperties();
  const salt = Utilities.getUuid();
  props.setProperties({
    FN_ADMIN_SALT: salt,
    FN_ADMIN_HASH: hash_(String(secret), salt)
  });
  return 'Admin secret impostato.';
}

/**
 * Optional. Reset one player's PIN from the Apps Script editor.
 * Returns the new plaintext PIN once.
 */
function resetPlayerPin(playerId) {
  const sh = sheet_(FN.ACCESS_SHEET);
  const rows = sh.getDataRange().getValues();
  const idx = headerMap_(rows[0]);
  const rowIndex = rows.findIndex((r,i) => i>0 && String(r[idx.playerId]) === String(playerId));
  if (rowIndex < 1) throw new Error('Giocatore non trovato.');

  sh.getRange(rowIndex+1, idx.salt+1).clearContent();
  sh.getRange(rowIndex+1, idx.pinHash+1).clearContent();
  sh.getRange(rowIndex+1, idx.updatedAt+1).setValue(new Date());
  CacheService.getScriptCache().remove('fn_fail_' + String(playerId));
  return 'PIN azzerato. Il giocatore potrà crearne uno nuovo al prossimo accesso.';
}

/**
 * Esegui UNA SOLA VOLTA dopo il passaggio dal vecchio sistema con PIN casuali.
 * Azzera tutti i PIN senza cancellare giocatori, partite o voti.
 */
function migrateToPlayerChosenPins() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FN_PLAYER_PIN_MIGRATED') === '1') {
    return 'Migrazione già eseguita: nessun PIN è stato modificato.';
  }

  const ss = ss_();
  const exportSheet = ss.getSheetByName(FN.PIN_EXPORT_SHEET);

  // Il vecchio setup casuale creava FN_PIN_EXPORT.
  // Se il foglio non esiste, evitiamo di azzerare PIN scelti dagli utenti.
  if (!exportSheet) {
    props.setProperty('FN_PLAYER_PIN_MIGRATED','1');
    return 'FN_PIN_EXPORT non presente: nessun PIN è stato azzerato. Migrazione marcata come completata.';
  }

  const sh = sheet_(FN.ACCESS_SHEET);
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) {
    props.setProperty('FN_PLAYER_PIN_MIGRATED','1');
    return 'Nessun giocatore da migrare.';
  }

  const idx = headerMap_(rows[0]);

  for (let i=1;i<rows.length;i++) {
    sh.getRange(i+1, idx.salt+1).clearContent();
    sh.getRange(i+1, idx.pinHash+1).clearContent();
    sh.getRange(i+1, idx.updatedAt+1).setValue(new Date());
    CacheService.getScriptCache().remove('fn_fail_' + String(rows[i][idx.playerId]));
  }

  ss.deleteSheet(exportSheet);
  props.setProperty('FN_PLAYER_PIN_MIGRATED','1');

  return 'Migrazione completata: i vecchi PIN casuali sono stati rimossi. Ogni giocatore creerà il proprio PIN al primo accesso.';
}

function publicState_() {
  return {
    ok:true,
    state:getState_(),
    ratings:getPeerRatingMedians_()
  };
}

function getState_() {
  const sh = getOrCreateSheet_(FN.STATE_SHEET, ['key','value','updatedAt']);
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return null;
  const idx = headerMap_(rows[0]);
  const row = rows.find((r,i) => i>0 && String(r[idx.key]) === 'season_state');
  if (!row || !row[idx.value]) return null;
  try { return JSON.parse(String(row[idx.value])); }
  catch (_) { return null; }
}

function saveState_(state) {
  const sh = getOrCreateSheet_(FN.STATE_SHEET, ['key','value','updatedAt']);
  const json = JSON.stringify(state);
  const rows = sh.getDataRange().getValues();
  const idx = headerMap_(rows[0]);
  const rowIndex = rows.findIndex((r,i) => i>0 && String(r[idx.key]) === 'season_state');
  if (rowIndex >= 1) {
    sh.getRange(rowIndex+1, idx.value+1).setValue(json);
    sh.getRange(rowIndex+1, idx.updatedAt+1).setValue(new Date());
  } else {
    sh.appendRow(['season_state',json,new Date()]);
  }
}

function syncAccessNamesFromState_(state) {
  if (!state || !Array.isArray(state.players)) return;
  const sh = sheet_(FN.ACCESS_SHEET);
  const rows = sh.getDataRange().getValues();
  if (!rows.length) return;
  const idx = headerMap_(rows[0]);
  const byId = new Map(state.players.map(p => [String(p.id),p]));
  for (let i=1;i<rows.length;i++) {
    const p = byId.get(String(rows[i][idx.playerId]));
    if (!p) continue;
    sh.getRange(i+1, idx.name+1).setValue(p.name || rows[i][idx.name]);
    sh.getRange(i+1, idx.role+1).setValue(p.role || rows[i][idx.role]);
  }
}

function playerHasPin_(playerId) {
  if (!playerId) return false;
  const sh = sheet_(FN.ACCESS_SHEET);
  const rows = sh.getDataRange().getValues();
  const idx = headerMap_(rows[0]);
  const row = rows.find((r,i) => i>0 &&
    String(r[idx.playerId])===String(playerId) &&
    String(r[idx.active]).toLowerCase()!=='false');
  if (!row) return false;
  return Boolean(String(row[idx.salt]||'').trim() && String(row[idx.pinHash]||'').trim());
}

function registerPlayerPin_(playerId,pin) {
  if (!playerId) throw new Error('Seleziona un giocatore.');
  if (!/^\d{6}$/.test(String(pin||''))) throw new Error('Il PIN deve contenere esattamente 6 cifre.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_(FN.ACCESS_SHEET);
    const rows = sh.getDataRange().getValues();
    const idx = headerMap_(rows[0]);
    const rowIndex = rows.findIndex((r,i) => i>0 &&
      String(r[idx.playerId])===String(playerId) &&
      String(r[idx.active]).toLowerCase()!=='false');

    if (rowIndex < 1) throw new Error('Giocatore non valido.');

    const row = rows[rowIndex];
    if (String(row[idx.salt]||'').trim() || String(row[idx.pinHash]||'').trim()) {
      throw new Error('Questo giocatore ha già creato il proprio PIN.');
    }

    const salt = Utilities.getUuid();
    sh.getRange(rowIndex+1, idx.salt+1).setValue(salt);
    sh.getRange(rowIndex+1, idx.pinHash+1).setValue(hash_(String(pin),salt));
    sh.getRange(rowIndex+1, idx.updatedAt+1).setValue(new Date());
  } finally {
    lock.releaseLock();
  }
}

function verifyPlayerPin_(playerId,pin) {
  if (!playerId || !/^\d{6}$/.test(String(pin||''))) return false;

  const cache = CacheService.getScriptCache();
  const failKey = 'fn_fail_' + String(playerId);
  const failures = Number(cache.get(failKey) || 0);
  if (failures >= FN.PIN_FAILURE_LIMIT) return false;

  const sh = sheet_(FN.ACCESS_SHEET);
  const rows = sh.getDataRange().getValues();
  const idx = headerMap_(rows[0]);
  const row = rows.find((r,i) => i>0 && String(r[idx.playerId])===String(playerId) && String(r[idx.active]).toLowerCase()!=='false');
  if (!row) return false;

  const ok = timingSafeEqual_(String(row[idx.pinHash]), hash_(String(pin), String(row[idx.salt])));
  if (ok) {
    cache.remove(failKey);
    return true;
  }

  cache.put(failKey, String(failures+1), FN.PIN_LOCK_SECONDS);
  return false;
}

function requirePlayer_(playerId,pin) {
  if (!verifyPlayerPin_(playerId,pin)) throw new Error('Giocatore o PIN non validi.');
}

function requireAdmin_(secret) {
  const props = PropertiesService.getScriptProperties();
  const salt = props.getProperty('FN_ADMIN_SALT');
  const expected = props.getProperty('FN_ADMIN_HASH');
  if (!salt || !expected) throw new Error('Password admin non configurata.');
  if (!secret || !timingSafeEqual_(expected, hash_(String(secret),salt))) throw new Error('Password admin non valida.');
}

function getMyVotes_(voterId) {
  const sh = sheet_(FN.VOTES_SHEET);
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];
  const idx = headerMap_(rows[0]);
  return rows.slice(1)
    .filter(r => String(r[idx.voterId]) === String(voterId))
    .map(r => ({
      target_id:String(r[idx.targetId]),
      vel_tuf:Number(r[idx.velTuf]),
      tir_pre:Number(r[idx.tirPre]),
      pass_rin:Number(r[idx.passRin]),
      dri_rif:Number(r[idx.driRif]),
      dif_rea:Number(r[idx.difRea]),
      fis_pia:Number(r[idx.fisPia]),
      updated_at:r[idx.updatedAt] ? new Date(r[idx.updatedAt]).toISOString() : null
    }));
}

function validateVote_(body) {
  if (!body.voterId || !body.targetId) throw new Error('Giocatore non valido.');
  if (String(body.voterId) === String(body.targetId)) throw new Error('Non puoi votare te stesso.');

  const validIds = new Set(FN_PLAYERS.map(r => r[0]));
  if (!validIds.has(String(body.targetId))) throw new Error('Giocatore votato non valido.');

  ['velTuf','tirPre','passRin','driRif','difRea','fisPia'].forEach(k => {
    const n = Number(body[k]);
    if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error('Tutti i voti devono essere interi da 1 a 99.');
  });
}

function upsertVote_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_(FN.VOTES_SHEET);
    const rows = sh.getDataRange().getValues();
    const idx = headerMap_(rows[0]);
    const rowIndex = rows.findIndex((r,i) => i>0 &&
      String(r[idx.voterId])===String(body.voterId) &&
      String(r[idx.targetId])===String(body.targetId));

    const values = [
      body.voterId,body.targetId,
      Number(body.velTuf),Number(body.tirPre),Number(body.passRin),
      Number(body.driRif),Number(body.difRea),Number(body.fisPia),new Date()
    ];

    if (rowIndex >= 1) sh.getRange(rowIndex+1,1,1,values.length).setValues([values]);
    else sh.appendRow(values);
  } finally {
    lock.releaseLock();
  }
}

function getPeerRatingMedians_() {
  const access = sheet_(FN.ACCESS_SHEET).getDataRange().getValues();
  const accessIdx = headerMap_(access[0]);
  const roles = new Map();
  access.slice(1).forEach(r => roles.set(String(r[accessIdx.playerId]), String(r[accessIdx.role])));

  const sh = sheet_(FN.VOTES_SHEET);
  const rows = sh.getDataRange().getValues();
  const out = new Map();

  if (rows.length > 1) {
    const idx = headerMap_(rows[0]);
    rows.slice(1).forEach(r => {
      const id = String(r[idx.targetId]);
      if (!out.has(id)) {
        out.set(id,{
          player_id:id,
          voters:0,
          vel_tuf:[], tir_pre:[], pass_rin:[],
          dri_rif:[], dif_rea:[], fis_pia:[]
        });
      }
      const a = out.get(id);
      a.voters++;
      a.vel_tuf.push(Number(r[idx.velTuf]));
      a.tir_pre.push(Number(r[idx.tirPre]));
      a.pass_rin.push(Number(r[idx.passRin]));
      a.dri_rif.push(Number(r[idx.driRif]));
      a.dif_rea.push(Number(r[idx.difRea]));
      a.fis_pia.push(Number(r[idx.fisPia]));
    });
  }

  const result = [];
  FN_PLAYERS.forEach(([id]) => {
    const a = out.get(id);

    if (a && a.voters) {
      const rating = {
        player_id:id,
        voters:a.voters,
        vel_tuf:median_(a.vel_tuf),
        tir_pre:median_(a.tir_pre),
        pass_rin:median_(a.pass_rin),
        dri_rif:median_(a.dri_rif),
        dif_rea:median_(a.dif_rea),
        fis_pia:median_(a.fis_pia)
      };
      rating.overall = round1_(overall_(roles.get(id),rating));
      result.push(rating);
    } else {
      result.push({
        player_id:id, voters:0,
        vel_tuf:null, tir_pre:null, pass_rin:null,
        dri_rif:null, dif_rea:null, fis_pia:null,
        overall:null
      });
    }
  });

  return result;
}

function median_(values) {
  const nums = (values || [])
    .map(Number)
    .filter(Number.isFinite)
    .sort((a,b) => a-b);

  if (!nums.length) return null;

  const middle = Math.floor(nums.length / 2);
  if (nums.length % 2) return round1_(nums[middle]);

  return round1_((nums[middle - 1] + nums[middle]) / 2);
}

function overall_(role,a) {
  const v=a.vel_tuf,t=a.tir_pre,p=a.pass_rin,d=a.dri_rif,df=a.dif_rea,f=a.fis_pia;
  switch(role) {
    case 'P': return .25*v+.15*t+.10*p+.25*d+.10*df+.15*f;
    case 'DC': return .15*v+.10*p+.05*d+.40*df+.30*f;
    case 'DL': return .20*v+.15*p+.05*d+.30*df+.30*f;
    case 'CC': return .15*v+.15*t+.30*p+.15*d+.15*df+.10*f;
    case 'CL': return .30*v+.10*t+.20*p+.25*d+.05*df+.10*f;
    case 'PC': return .20*v+.40*t+.05*p+.15*d+.20*f;
    default: return (v+t+p+d+df+f)/6;
  }
}

function ss_() {
  return SpreadsheetApp.openById(FN.SPREADSHEET_ID);
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Foglio mancante: '+name+'. Esegui setupFlanneryNight().');
  return sh;
}

function getOrCreateSheet_(name,headers) {
  const ss=ss_();
  let sh=ss.getSheetByName(name);
  if(!sh) sh=ss.insertSheet(name);
  if(sh.getLastRow()===0) sh.getRange(1,1,1,headers.length).setValues([headers]);
  return sh;
}

function headerMap_(header) {
  const out={};
  header.forEach((h,i)=>out[String(h)]=i);
  return out;
}

function hash_(value,salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt)+'|'+String(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0'+((b<0?b+256:b).toString(16))).slice(-2)).join('');
}

function timingSafeEqual_(a,b) {
  a=String(a||''); b=String(b||'');
  if(a.length!==b.length) return false;
  let diff=0;
  for(let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

function round1_(n) {
  return Math.round((Number(n)+Number.EPSILON)*10)/10;
}

function safeError_(err) {
  const msg = err && err.message ? String(err.message) : 'Errore';
  return msg.replace(/Exception:\s*/i,'').slice(0,300);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
