(function () {
  window.GTOApp = window.GTOApp || {};
  const { utils } = window.GTOApp;

  const calculations = {
    /**
     * Calculate full years between birth and event dates. DATE-ONLY safe:
     * delegates to GTODateUtils.calcAge so identical logic is used on the
     * main app and in workspace, with no timezone-induced off-by-one.
     */
    calculateAgeOnDate(birthDate, eventDate) {
      if (window.GTODateUtils) return window.GTODateUtils.calcAge(birthDate, eventDate);
      const birth = utils.parseDateValue(birthDate);
      const event = utils.parseDateValue(eventDate);
      if (!birth || !event) return null;
      let age = event.getFullYear() - birth.getFullYear();
      const monthDiff = event.getMonth() - birth.getMonth();
      const dayDiff = event.getDate() - birth.getDate();
      if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
      return age >= 0 ? age : null;
    },
    parseStageRange(rangeLabel) {
      const text = String(rangeLabel || '').trim();
      const match = text.match(/(\d+)\s*-\s*(\d+)/);
      if (match) return { min: Number(match[1]), max: Number(match[2]), label: text };
      const moreMatch = text.match(/(\d+)\s*лет\s*и\s*больше/i);
      if (moreMatch) return { min: Number(moreMatch[1]), max: Number.POSITIVE_INFINITY, label: text };
      return null;
    },
    resolveStage(age, stages) {
      if (age === null || age === undefined || !Array.isArray(stages)) return null;
      return stages.find((stage) => age >= stage.min && age <= stage.max) || null;
    }
  };

  window.GTOApp.calculations = calculations;
})();
