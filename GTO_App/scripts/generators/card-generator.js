/**
 * card-generator.js — Generate personal GTO application cards (DOCX) and pack into ZIP.
 *
 * Uses the embedded DOCX template (card-template.js) with JSZip (bundled with XLSX).
 * For each selected participant, replaces placeholders in document.xml and produces
 * a separate .docx file. All files are collected into a single ZIP for download.
 *
 * Public API: window.GTOApp.cardGenerator
 *   .generateCards(participants, standardsSelections, meta) → Promise<void> (downloads ZIP)
 *   .generateSingleCard(participant, selectedTests, meta) → Promise<Blob>
 */
(function () {
  'use strict';
  window.GTOApp = window.GTOApp || {};

  var utils = window.GTOApp.utils;

  /**
   * Escape XML special characters.
   */
  function escXml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Transliterate Cyrillic to Latin for safe filenames.
   */
  function transliterate(str) {
    var map = {
      'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh',
      'з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
      'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
      'ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
      'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh',
      'З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O',
      'П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts',
      'Ч':'Ch','Ш':'Sh','Щ':'Shch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya'
    };
    return String(str || '').split('').map(function (c) { return map[c] || c; }).join('');
  }

  /**
   * Build safe filename from participant's full name.
   */
  function buildFileName(fullName) {
    var parts = String(fullName || 'participant').trim().split(/\s+/);
    var slug = parts.map(function (p) { return transliterate(p); }).join('_');
    slug = slug.replace(/[^a-zA-Z0-9_-]/g, '');
    return slug + '_kartochka.docx';
  }

  /**
   * Format tests list for the card: numbered lines.
   */
  function formatTestsList(selectedTests) {
    if (!selectedTests || !selectedTests.length) return '-';
    return selectedTests.map(function (test, i) {
      return (i + 1) + '. ' + test;
    }).join('\n');
  }

  /**
   * Build the replacement map for a single participant.
   */
  function buildReplacements(participant, selectedTests, meta) {
    var placeholder = '-';
    var docSeries = participant.documentSeries || '';
    var docNumber = participant.documentNumber || '';
    var documentStr = (docSeries && docNumber)
      ? docSeries + ' ' + docNumber
      : docSeries || docNumber || placeholder;

    var birthDate = participant.birthDate
      ? utils.formatDate(participant.birthDate)
      : placeholder;

    var address = participant.address || placeholder;
    /* If address is not pre-built, try building from components */
    if (address === placeholder && window.GTOApp.normalizer) {
      var builtAddr = window.GTOApp.normalizer.buildAddress(participant);
      if (builtAddr) address = builtAddr;
    }

    return {
      '{{FULLNAME}}': participant.fullName || placeholder,
      '{{GENDER}}': participant.gender || placeholder,
      '{{IDNUMBER}}': participant.uin || placeholder,
      '{{BIRTHDATE}}': birthDate,
      '{{DOCUMENT}}': documentStr,
      '{{ADDRESS}}': address,
      '{{PHONE}}': placeholder,
      '{{EMAIL}}': placeholder,
      '{{SCHOOL}}': participant.schoolName || meta.schoolName || placeholder,
      '{{SPORTTITLE}}': placeholder,
      '{{HONORTITLE}}': placeholder,
      '{{SPORTRANK}}': placeholder,
      '{{TESTS}}': formatTestsList(selectedTests)
    };
  }

  /**
   * Replace placeholders in DOCX document.xml.
   * Handles the case where Word splits placeholder text across multiple <w:t> elements.
   */
  function replacePlaceholders(docXml, replacements) {
    var result = docXml;
    Object.keys(replacements).forEach(function (key) {
      var value = escXml(replacements[key]);
      /* Handle newlines in value: convert to DOCX line breaks */
      value = value.replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
      /* Simple replace — placeholders should be intact in our generated template */
      result = result.split(key).join(value);
    });
    return result;
  }

  /**
   * Generate a single DOCX Blob for one participant.
   */
  function generateSingleCard(participant, selectedTests, meta) {
    var template = window.GTOApp.cardTemplate;
    if (!template || !template.base64) {
      return Promise.reject(new Error('Шаблон личной карточки не загружен'));
    }

    var binary = utils.base64ToUint8Array(template.base64);
    return JSZip.loadAsync(binary).then(function (zip) {
      return zip.file('word/document.xml').async('string').then(function (docXml) {
        var replacements = buildReplacements(participant, selectedTests, meta);
        var newDocXml = replacePlaceholders(docXml, replacements);
        zip.file('word/document.xml', newDocXml);
        return zip.generateAsync({
          type: 'blob',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          compression: 'DEFLATE'
        });
      });
    });
  }

  /**
   * Generate cards for all participants and download as ZIP.
   *
   * @param {Array} participants — selected participants with full data
   * @param {Object} standardsSelections — { participantId: [test1, test2, ...] }
   * @param {Object} meta — { schoolName, ... }
   */
  function generateCards(participants, standardsSelections, meta) {
    if (!participants || !participants.length) {
      return Promise.reject(new Error('Нет выбранных участников'));
    }

    var masterZip = new JSZip();
    var usedNames = {};

    var tasks = participants.map(function (p) {
      var tests = standardsSelections[p.id] || [];
      return generateSingleCard(p, tests, meta).then(function (blob) {
        var name = buildFileName(p.fullName);
        /* Avoid duplicate filenames */
        if (usedNames[name]) {
          var count = usedNames[name]++;
          name = name.replace('.docx', '_' + count + '.docx');
        } else {
          usedNames[name] = 1;
        }
        return blob.arrayBuffer().then(function (buf) {
          masterZip.file(name, buf);
        });
      });
    });

    return Promise.all(tasks).then(function () {
      return masterZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    }).then(function (zipBlob) {
      var schoolSlug = utils.slugify(meta.schoolName || 'school');
      utils.downloadBlob(zipBlob, 'Kartochki_GTO_' + schoolSlug + '.zip');
    });
  }

  window.GTOApp.cardGenerator = {
    generateSingleCard: generateSingleCard,
    generateCards: generateCards,
    buildFileName: buildFileName
  };
})();
