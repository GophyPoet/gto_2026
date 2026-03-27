(function () {
  window.GTOApp = window.GTOApp || {};
  window.GTOApp.config = {
    storageKey: 'gto-app-state-v1',
    projectFileName: 'gto-project-state.json',
    placeholders: { missing: '-' },
    steps: [
      { id: 'prepare', title: 'Подготовка данных', description: 'Загрузите файлы, проверьте распознавание и сохраните проект.' },
      { id: 'select', title: 'Выбор участников', description: 'Выберите учеников по классам или добавьте участника вручную.' },
      { id: 'review', title: 'Проверка и выгрузка', description: 'Проверьте проблемные поля и скачайте итоговый Excel.' }
    ],
    reviewColumns: ['№', 'ФИО', 'УИН', 'Пол', 'Место учебы', 'Ступень', 'Дата рождения', 'Возраст', 'Документ', 'Класс', 'Адрес'],
    schoolHeaderSynonyms: {
      order: ['№ п/п', 'номер', 'порядковый номер'],
      fullName: ['фио', 'ф.и.о.', 'участник'],
      uin: ['уин', 'win', 'uin', 'уин участника']
    },
    asuFields: {
      className: ['класс'],
      surname: ['фамилия'],
      name: ['имя'],
      patronymic: ['отчество'],
      birthDate: ['дата рождения'],
      gender: ['пол'],
      documentType: ['тип документа'],
      documentSeries: ['серия документа'],
      documentNumber: ['номер документа'],
      residenceLocality: ['адрес проживания | населенный пункт', 'адрес проживания населенный пункт'],
      residenceStreetName: ['адрес проживания | название улицы', 'адрес проживания название улицы'],
      residenceStreetType: ['адрес проживания | тип улицы', 'адрес проживания тип улицы'],
      residenceHouse: ['адрес проживания | дом', 'адрес проживания дом'],
      residenceBuilding: ['адрес проживания | корпус', 'адрес проживания корпус'],
      residenceApartment: ['адрес проживания | квартира', 'адрес проживания квартира']
    }
  };
})();
