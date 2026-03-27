(function () {
  window.GTOApp = window.GTOApp || {};
  const { config, normalizer } = window.GTOApp;

  function scoreHeader(header, synonyms) {
    const normalized = normalizer.normalizeHeader(header);
    let best = 0;
    synonyms.forEach((synonym) => {
      const prepared = normalizer.normalizeHeader(synonym);
      if (normalized === prepared) best = Math.max(best, 100);
      else if (normalized.includes(prepared)) best = Math.max(best, 70);
    });
    return best;
  }

  function autoMatch(headers, synonymMap) {
    const result = {};
    Object.entries(synonymMap).forEach(([field, synonyms]) => {
      let bestIndex = null;
      let bestScore = -1;
      headers.forEach((header, index) => {
        const currentScore = scoreHeader(header, synonyms);
        if (currentScore > bestScore) {
          bestScore = currentScore;
          bestIndex = index;
        }
      });
      result[field] = { index: bestScore > 0 ? bestIndex : null, label: bestScore > 0 ? headers[bestIndex] : '', confidence: bestScore };
    });
    return result;
  }

  window.GTOApp.mapper = {
    matchSchoolHeaders(headers) {
      return autoMatch(headers, config.schoolHeaderSynonyms);
    },
    matchAsuHeaders(headers) {
      return autoMatch(headers, config.asuFields);
    },
    mappingToSelectable(headers, mapping) {
      return Object.fromEntries(Object.entries(mapping).map(([field, value]) => [field, value.index === null ? '' : String(value.index)]));
    },
    resolveSelection(selection, headers) {
      const result = {};
      Object.entries(selection || {}).forEach(([field, indexValue]) => {
        const index = indexValue === '' || indexValue === null || indexValue === undefined ? null : Number(indexValue);
        result[field] = { index, label: index === null ? '' : headers[index] || '' };
      });
      return result;
    },
    buildAsuLookup(records) {
      const byExactName = new Map();
      const bySurnameAndInitials = new Map();
      records.forEach((record) => {
        const key = normalizer.normalizeFio(record.fullName);
        if (key) byExactName.set(key, record);
        /* Also index by "ФАМИЛИЯ И О" for partial matching */
        const parts = key.split(/\s+/);
        if (parts.length >= 2) {
          const shortKey = parts[0] + ' ' + parts.slice(1).map((p) => p.charAt(0)).join(' ');
          if (!bySurnameAndInitials.has(shortKey)) bySurnameAndInitials.set(shortKey, record);
        }
      });
      return {
        find(fullName) {
          const normalized = normalizer.normalizeFio(fullName);
          /* 1. Exact match */
          const exact = byExactName.get(normalized);
          if (exact) return exact;
          /* 2. Match by initials: school "Иванов И.И." → ASU "Иванов Иван Иванович" */
          const cleanParts = normalized.split(/\s+/);
          if (cleanParts.length >= 2) {
            const shortKey = cleanParts[0] + ' ' + cleanParts.slice(1).map((p) => p.charAt(0)).join(' ');
            const byInitials = bySurnameAndInitials.get(shortKey);
            if (byInitials) return byInitials;
          }
          return null;
        }
      };
    }
  };
})();
