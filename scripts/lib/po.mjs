/*
 * Minimalny parser plików gettext w formacie PO.
 *
 * Potrzebny, żeby wyciągnąć polskie nazwy gwiazdozbiorów, ich dopełniacze
 * oraz nazwy ciał Układu Słonecznego z tłumaczeń Stellarium.
 * Obsługuje msgctxt, msgid, msgstr oraz ciągi łamane na wiele wierszy.
 * Wpisy puste i oznaczone jako niepewne pomijamy.
 */

function unquote(line) {
  const match = line.match(/"((?:[^"\\]|\\.)*)"/);
  if (!match) return '';
  return match[1]
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/** Zwraca mapę, w której kluczem jest "kontekst identyfikator" albo sam identyfikator. */
export function parsePo(text) {
  const entries = new Map();
  let ctx = null;
  let id = null;
  let str = null;
  let field = null;
  let fuzzy = false;

  const flush = () => {
    if (id !== null && str && !fuzzy) {
      entries.set(ctx === null ? id : `${ctx} ${id}`, str);
    }
    ctx = null;
    id = null;
    str = null;
    field = null;
    fuzzy = false;
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();

    if (line.startsWith('#,') && line.includes('fuzzy')) {
      fuzzy = true;
      continue;
    }
    if (line.startsWith('#')) continue;
    if (line === '') {
      if (field !== null) flush();
      continue;
    }

    if (line.startsWith('msgctxt')) {
      if (field === 'str') flush();
      ctx = unquote(line);
      field = 'ctx';
    } else if (line.startsWith('msgid_plural')) {
      field = 'plural';
    } else if (line.startsWith('msgid')) {
      if (field === 'str') flush();
      id = unquote(line);
      field = 'id';
    } else if (line.startsWith('msgstr[0]')) {
      str = unquote(line);
      field = 'str';
    } else if (line.startsWith('msgstr')) {
      str = unquote(line);
      field = 'str';
    } else if (line.startsWith('"')) {
      const part = unquote(line);
      if (field === 'ctx') ctx = (ctx ?? '') + part;
      else if (field === 'id') id = (id ?? '') + part;
      else if (field === 'str') str = (str ?? '') + part;
    }
  }
  flush();
  return entries;
}

/** Wyszukuje tłumaczenie, próbując najpierw z podanymi kontekstami, potem bez kontekstu. */
export function lookup(entries, id, ...contexts) {
  for (const ctx of contexts) {
    const hit = entries.get(`${ctx} ${id}`);
    if (hit) return hit;
  }
  return entries.get(id) ?? null;
}

/*
 * Wariant bez awaryjnego szukania po samym identyfikatorze.
 * Przy dopełniaczach jest to istotne, bo ten sam łańcuch znaków potrafi występować
 * w pliku w zupełnie innym znaczeniu i wynik byłby cichym błędem.
 */
export function lookupStrict(entries, id, ...contexts) {
  for (const ctx of contexts) {
    const hit = entries.get(`${ctx} ${id}`);
    if (hit) return hit;
  }
  return null;
}
