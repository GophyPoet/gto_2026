(function () {
  window.GTOApp = window.GTOApp || {};

  const normalizer = {
    normalizeHeader(value) {
      return String(value || '')
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[Ёё]/g, (symbol) => (symbol === 'Ё' ? 'Е' : 'е'))
        .trim()
        .toLowerCase();
    },
    normalizeFio(value) {
      return String(value || '')
        .replace(/[Ёё]/g, (symbol) => (symbol === 'Ё' ? 'Е' : 'е'))
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N}\s-]+/gu, '')
        .trim()
        .toUpperCase();
    },
    normalizeClassName(value) {
      return String(value || '').replace(/\s+/g, '').toUpperCase().replace('Ё', 'Е');
    },
    cleanUin(value) {
      return String(value || '').replace(/\s+/g, '').replace(/\n/g, '').trim();
    },
    toGenderLabel(value) {
      const source = normalizer.normalizeHeader(value);
      if (source === 'м' || source === 'male' || source.includes('муж') || source.includes('мальч')) return 'М';
      if (source === 'ж' || source === 'female' || source.includes('жен') || source.includes('девоч')) return 'Ж';
      return '';
    },
    joinFio(parts) {
      return parts.map((part) => String(part || '').trim()).filter(Boolean).join(' ');
    },
    normalizeStreet(streetType, streetName) {
      return `${String(streetType || '').trim()} ${String(streetName || '').trim()}`.trim();
    },
    buildAddress(record) {
      const locality = String(record.residenceLocality || '').trim();
      const street = normalizer.normalizeStreet(record.residenceStreetType, record.residenceStreetName);
      const house = String(record.residenceHouse || '').trim();
      const building = String(record.residenceBuilding || '').trim();
      const apartment = String(record.residenceApartment || '').trim();
      const parts = [];
      if (locality) parts.push(locality);
      if (street) parts.push(street);
      if (house) parts.push(`д. ${house}`);
      if (building) parts.push(`корп. ${building}`);
      if (apartment) parts.push(`кв. ${apartment}`);
      return parts.join(', ').replace(/\s+/g, ' ').trim();
    }
  };

  window.GTOApp.normalizer = normalizer;
})();
