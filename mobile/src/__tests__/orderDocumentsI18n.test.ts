const uzJson = require('../i18n/locales/uz.json');
const ruJson = require('../i18n/locales/ru.json');
const enJson = require('../i18n/locales/en.json');

describe('order document i18n', () => {
  it.each([
    ['uz', uzJson],
    ['ru', ruJson],
    ['en', enJson],
  ])('%s has invoice/ttn/cmr/act and pdf keys', (_lang, locale) => {
    const docs = locale.features.documents;
    expect(docs.types.invoice).toBeTruthy();
    expect(docs.types.ttn).toBeTruthy();
    expect(docs.types.cmr).toBeTruthy();
    expect(docs.types.act).toBeTruthy();
    expect(docs.pdf).toBeTruthy();
    expect(docs.open).toBeTruthy();
    expect(locale.company.legalTitle).toBeTruthy();
    expect(locale.company.mfo).toBeTruthy();
    expect(locale.matching.feed.title).toBeTruthy();
    expect(locale.matching.lanes.title).toBeTruthy();
    expect(locale.vehicles.bodyTypes.reefer).toBeTruthy();
  });
});
