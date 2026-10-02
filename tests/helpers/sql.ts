// PASSO 3: splitter SQL per i test.
// D1 exec non capisce le CREATE TABLE su piu' righe, quindi spezziamo
// noi il testo (come fa wrangler) e mandiamo una istruzione alla volta.
// Gestisce stringhe, commenti e corpi BEGIN ... END dei trigger.

function findQuoteEnd(sql: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === quote) {
      if (sql[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i;
    }
    i += 1;
  }
  return sql.length - 1;
}

export function splitSql(sql: string): string[] {
  const out: string[] = [];
  let str = "";
  let depth = 0;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      const end = findQuoteEnd(sql, i, ch);
      str += sql.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      str += "\n";
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      str += " ";
      continue;
    }
    if (ch === ";") {
      if (depth === 0) {
        out.push(str);
        str = "";
        i += 1;
        continue;
      }
      str += ch;
      i += 1;
      continue;
    }
    str += ch;
    if (/\s(BEGIN|CASE)\s$/i.test(str)) depth += 1;
    else if (depth > 0 && /\sEND[;\s]$/i.test(str)) depth -= 1;
    i += 1;
  }
  out.push(str);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}