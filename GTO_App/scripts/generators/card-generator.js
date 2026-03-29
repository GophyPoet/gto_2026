/**
 * card-generator.js — Generate personal GTO application cards as PDF and pack into ZIP.
 *
 * Uses jsPDF with embedded Liberation Serif font (Cyrillic support).
 * For each selected participant, renders a one-page A4 PDF card.
 * All cards are collected into:
 *   1. A combined multi-page PDF (first in ZIP)
 *   2. Individual per-participant PDF files
 *
 * Public API: window.GTOApp.cardGenerator
 *   .generateCards(participants, standardsSelections, meta) → Promise<void> (downloads ZIP)
 *   .generateSingleCardPdf(participant, selectedTests, meta) → jsPDF instance
 */
(function () {
  'use strict';
  window.GTOApp = window.GTOApp || {};

  var utils = window.GTOApp.utils;

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
    return slug + '_kartochka.pdf';
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
   * Register Liberation Serif fonts in jsPDF instance.
   */
  function registerFonts(doc) {
    var fonts = window.GTOApp.pdfFonts;
    if (!fonts) return;
    doc.addFileToVFS('LiberationSerif-Regular.ttf', fonts.regular);
    doc.addFont('LiberationSerif-Regular.ttf', 'LiberationSerif', 'normal');
    doc.addFileToVFS('LiberationSerif-Bold.ttf', fonts.bold);
    doc.addFont('LiberationSerif-Bold.ttf', 'LiberationSerif', 'bold');
    doc.setFont('LiberationSerif', 'normal');
  }

  /**
   * Create a new jsPDF document with fonts registered.
   */
  function createPdfDoc() {
    var doc = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    registerFonts(doc);
    return doc;
  }

  /**
   * Build data rows for the card table.
   */
  function buildCardRows(participant, selectedTests, meta) {
    var placeholder = '-';
    var docSeries = participant.documentSeries || '';
    var docNumber = participant.documentNumber || '';
    var documentStr = (docSeries && docNumber)
      ? docSeries + ' ' + docNumber
      : docSeries || docNumber || placeholder;

    var birthDate = participant.birthDate
      ? utils.formatDate(participant.birthDate)
      : placeholder;

    var address = participant.address || '';
    if (!address && window.GTOApp.normalizer) {
      address = window.GTOApp.normalizer.buildAddress(participant) || placeholder;
    }
    if (!address) address = placeholder;

    return [
      { num: '1', label: 'Фамилия, Имя, Отчество', value: participant.fullName || placeholder },
      { num: '2', label: 'Пол', value: participant.gender || placeholder },
      { num: '3', label: 'ID номер — Идентификационный номер участника тестирования в АИС ГТО', value: participant.uin || placeholder },
      { num: '4', label: 'Дата рождения', value: birthDate },
      { num: '5', label: 'Документ, удостоверяющий личность (паспорт или св-во о рождении)', value: documentStr },
      { num: '6', label: 'Адрес места жительства', value: address },
      { num: '7', label: 'Контактный телефон', value: placeholder },
      { num: '8', label: 'Адрес электронной почты', value: placeholder },
      { num: '9', label: 'Основное место учебы', value: participant.schoolName || meta.schoolName || placeholder },
      { num: '10', label: 'Спортивное звание', value: placeholder },
      { num: '11', label: 'Почетное спортивное звание', value: placeholder },
      { num: '12', label: 'Спортивный разряд с указанием вида спорта', value: placeholder },
      { num: '13', label: 'Перечень выбранных испытаний', value: formatTestsList(selectedTests) }
    ];
  }

  /* ---- PDF Drawing Helpers ---- */

  var PAGE_W = 210; // A4 width mm
  var MARGIN_LEFT = 15;
  var MARGIN_RIGHT = 15;
  var MARGIN_TOP = 15;
  var TABLE_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT; // 180mm
  var COL_NUM_W = 8;   // "№" column
  var COL_LABEL_W = 72; // "Наименование" column
  var COL_VALUE_W = TABLE_W - COL_NUM_W - COL_LABEL_W; // ~100mm

  /**
   * Split text into lines that fit within maxWidth (mm) at given fontSize (pt).
   */
  function wrapText(doc, text, maxWidth, fontSize) {
    doc.setFontSize(fontSize);
    var lines = [];
    var paragraphs = String(text || '').split('\n');
    for (var p = 0; p < paragraphs.length; p++) {
      var wrapped = doc.splitTextToSize(paragraphs[p], maxWidth);
      for (var w = 0; w < wrapped.length; w++) {
        lines.push(wrapped[w]);
      }
    }
    return lines.length ? lines : [''];
  }

  /**
   * Draw a single table cell with border and text.
   */
  function drawCell(doc, x, y, w, h, text, fontSize, isBold, align) {
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(x, y, w, h);

    doc.setFont('LiberationSerif', isBold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);

    var textX = x + 1.5;
    if (align === 'center') {
      textX = x + w / 2;
    }
    var textY = y + fontSize * 0.35 + 1.5; // approximate baseline offset

    if (typeof text === 'string') {
      var lines = text.split('\n');
      if (lines.length === 1) {
        doc.text(text, textX, textY, { align: align || 'left', maxWidth: w - 3 });
      } else {
        for (var i = 0; i < lines.length; i++) {
          doc.text(lines[i], textX, textY + i * (fontSize * 0.4), { align: align || 'left', maxWidth: w - 3 });
        }
      }
    }
  }

  /**
   * Render one personal card onto the current page of the jsPDF doc.
   * Returns the doc for chaining.
   */
  function renderCard(doc, participant, selectedTests, meta) {
    var rows = buildCardRows(participant, selectedTests, meta);

    /* Font sizes */
    var titleSize = 14;
    var subtitleSize = 9;
    var headerSize = 10;
    var bodySize = 9;
    var lineH = bodySize * 0.42; // mm per line of text

    /* ---- Title ---- */
    var y = MARGIN_TOP;
    doc.setFont('LiberationSerif', 'bold');
    doc.setFontSize(titleSize);
    doc.text('ЗАЯВКА', PAGE_W / 2, y + 5, { align: 'center' });
    y += 8;

    doc.setFont('LiberationSerif', 'normal');
    doc.setFontSize(subtitleSize);
    doc.text('на прохождение тестирования в рамках Всероссийского физкультурно-спортивного комплекса', PAGE_W / 2, y + 4, { align: 'center' });
    y += 5;
    doc.text('«Готов к труду и обороне» (ГТО)', PAGE_W / 2, y + 4, { align: 'center' });
    y += 8;

    /* ---- Table header row ---- */
    var x0 = MARGIN_LEFT;
    var headerH = 7;
    drawCell(doc, x0, y, COL_NUM_W, headerH, '№', headerSize, true, 'center');
    drawCell(doc, x0 + COL_NUM_W, y, COL_LABEL_W, headerH, 'Наименование', headerSize, true, 'center');
    drawCell(doc, x0 + COL_NUM_W + COL_LABEL_W, y, COL_VALUE_W, headerH, 'Информация', headerSize, true, 'center');
    y += headerH;

    /* ---- Data rows ---- */
    var padding = 2; // vertical padding in cell
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];

      /* Calculate row height based on text wrapping */
      var labelLines = wrapText(doc, row.label, COL_LABEL_W - 3, bodySize);
      var valueLines = wrapText(doc, row.value, COL_VALUE_W - 3, bodySize);
      var maxLines = Math.max(labelLines.length, valueLines.length, 1);
      var rowH = Math.max(maxLines * lineH + padding * 2, 6);

      /* Draw cells */
      /* Number cell */
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.rect(x0, y, COL_NUM_W, rowH);
      doc.setFont('LiberationSerif', 'normal');
      doc.setFontSize(bodySize);
      doc.text(row.num, x0 + COL_NUM_W / 2, y + rowH / 2 + 1, { align: 'center' });

      /* Label cell */
      doc.rect(x0 + COL_NUM_W, y, COL_LABEL_W, rowH);
      doc.setFont('LiberationSerif', 'normal');
      doc.setFontSize(bodySize);
      var labelY = y + padding + lineH * 0.7;
      for (var li = 0; li < labelLines.length; li++) {
        doc.text(labelLines[li], x0 + COL_NUM_W + 1.5, labelY + li * lineH);
      }

      /* Value cell */
      doc.rect(x0 + COL_NUM_W + COL_LABEL_W, y, COL_VALUE_W, rowH);
      doc.setFont('LiberationSerif', 'normal');
      doc.setFontSize(bodySize);
      var valueY = y + padding + lineH * 0.7;
      for (var vi = 0; vi < valueLines.length; vi++) {
        doc.text(valueLines[vi], x0 + COL_NUM_W + COL_LABEL_W + 1.5, valueY + vi * lineH);
      }

      y += rowH;
    }

    return doc;
  }

  /**
   * Generate a single PDF Blob for one participant.
   */
  function generateSingleCard(participant, selectedTests, meta) {
    try {
      var doc = createPdfDoc();
      renderCard(doc, participant, selectedTests, meta);
      var blob = doc.output('blob');
      return Promise.resolve(blob);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   * Generate cards for all participants and download as ZIP.
   *
   * @param {Array} participants — selected participants with full data
   * @param {Object} standardsSelections — { participantId: [test1, test2, ...] }
   * @param {Object} meta — { schoolName, submissionDate, ... }
   */
  function generateCards(participants, standardsSelections, meta) {
    if (!participants || !participants.length) {
      return Promise.reject(new Error('Нет выбранных участников'));
    }

    try {
      var masterZip = new JSZip();
      var usedNames = {};

      /* 1. Build combined multi-page PDF */
      var combinedDoc = createPdfDoc();
      for (var i = 0; i < participants.length; i++) {
        if (i > 0) combinedDoc.addPage();
        var p = participants[i];
        var tests = standardsSelections[p.id] || [];
        renderCard(combinedDoc, p, tests, meta);
      }
      var combinedBlob = combinedDoc.output('arraybuffer');
      masterZip.file('00_Vse_kartochki_GTO.pdf', combinedBlob);

      /* 2. Build individual PDF files */
      for (var j = 0; j < participants.length; j++) {
        var part = participants[j];
        var partTests = standardsSelections[part.id] || [];
        var singleDoc = createPdfDoc();
        renderCard(singleDoc, part, partTests, meta);
        var singleBuf = singleDoc.output('arraybuffer');

        var name = buildFileName(part.fullName);
        if (usedNames[name]) {
          var count = usedNames[name]++;
          name = name.replace('.pdf', '_' + count + '.pdf');
        } else {
          usedNames[name] = 1;
        }
        masterZip.file(name, singleBuf);
      }

      /* 3. Generate and download ZIP */
      return masterZip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(function (zipBlob) {
        var schoolSlug = utils.slugify(meta.schoolName || 'school');
        utils.downloadBlob(zipBlob, 'Kartochki_GTO_' + schoolSlug + '.zip');
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  window.GTOApp.cardGenerator = {
    generateSingleCard: generateSingleCard,
    generateCards: generateCards,
    buildFileName: buildFileName
  };
})();
