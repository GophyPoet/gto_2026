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
      const byName = new Map();
      records.forEach((record) => byName.set(normalizer.normalizeFio(record.fullName), record));
      return byName;
    }
  };
})();
