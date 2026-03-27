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
    fieldLabels: {
      order: '№ п/п',
      fullName: 'ФИО',
      uin: 'УИН',
      className: 'Класс',
      surname: 'Фамилия',
      name: 'Имя',
      patronymic: 'Отчество',
      birthDate: 'Дата рождения',
      gender: 'Пол',
      documentType: 'Тип документа',
      documentSeries: 'Серия документа',
      documentNumber: 'Номер документа',
      residenceLocality: 'Населённый пункт',
      residenceStreetName: 'Название улицы',
      residenceStreetType: 'Тип улицы',
      residenceHouse: 'Дом',
      residenceBuilding: 'Корпус',
      residenceApartment: 'Квартира'
    },
    schoolHeaderSynonyms: {
      order: ['№ п/п', 'номер', 'порядковый номер', '№'],
      fullName: ['фио', 'ф.и.о.', 'участник', 'фамилия имя отчество'],
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
      documentSeries: ['серия документа', 'серия'],
      documentNumber: ['номер документа', 'номер'],
      residenceLocality: ['адрес проживания | населенный пункт', 'адрес проживания населенный пункт', 'населенный пункт'],
      residenceStreetName: ['адрес проживания | название улицы', 'адрес проживания название улицы', 'название улицы'],
      residenceStreetType: ['адрес проживания | тип улицы', 'адрес проживания тип улицы', 'тип улицы'],
      residenceHouse: ['адрес проживания | дом', 'адрес проживания дом'],
      residenceBuilding: ['адрес проживания | корпус', 'адрес проживания корпус'],
      residenceApartment: ['адрес проживания | квартира', 'адрес проживания квартира']
    }
  };
})();
