# Internationalisation (i18n)

Every user-facing string in the app lives in `locales/en.js` and is looked up by key. Nothing is translated
by scanning or replacing text at run time.

```
src/i18n/
  languages.js      the list of supported languages (name, ISO code, locale for number/date formatting)
  locales/*.js      one resource file per language: { "key": "text" }   (en.js is the source of truth)
  translate.js      the engine: {placeholders}, plural forms (key_one / key_other), English fallback
  index.js          registers the resource files, coverage per language
  current.js        the language in use, readable outside React:  tr('key', params)
  format.js         numbers, money, dates in the person's locale (display only, never changes stored values)
  I18nContext.js    <I18nProvider> and useTranslation()
```

## Using it

```js
const { t, formatMoney, formatDate, tv } = useTranslation();   // inside a component
t('subscription.payWithPaystack', { amount: formatMoney(99, { decimals: 0 }) });
tv('workStatus', work.status);         // translate a STORED value for display only ("Pending" stays "Pending" in the database)

import { tr } from '../i18n/current';  // outside React (data layer, libs, error messages)
tr('err.sessionExpired');
```

Rules: put numbers, names and dates in as `{params}` (never glue them into the sentence); use `key_one` / `key_other`
for counts; show stored values (statuses, categories, currencies) with `tv()` and keep the stored value unchanged.

## Three different "languages"

1. **Interface language** ("Preferred language"): the screens (this system). Exactly three options:
   **English, Afrikaans and isiZulu** (shown as "isiZulu (Zulu)"). Saved on the device and on the account
   (`business.language`); the server refuses any other value, and an older saved choice that is no longer
   offered (isiXhosa, Sesotho, Setswana) is treated as "not chosen", so the app shows English.
2. **Spoken language**: what the person says or types. Live Voice detects it per message and replies in it.
3. **Translation request / interpreter mode**: an explicit "translate to X". Independent of both of the above.

The app sends the interface language to the AI (`uiLanguage`). It is only the tie-breaker when the language
of a message is unclear; the AI still understands and answers in any language it is spoken to in.

## Adding a language

Only English, Afrikaans and isiZulu are offered. To add one later: add a row to `languages.js`, copy
`locales/en.js` to `locales/<code>.js` and translate every value (keep each `{placeholder}`), register it in
`index.js`, add it to `APP_LANGUAGE_NAMES` / `APP_LANGUAGES` in `backend/src/lib/languages.js`, and update the
expectations in `i18n.test.js`.

## Status

| Language   | Coverage |
|------------|----------|
| English    | source   |
| Afrikaans  | complete |
| isiZulu    | complete (have a first-language speaker review before release) |

Not translated: text that the backend sends back as an error message (e.g. a validation message from the API)
is shown as the server wrote it. The AI's own answers follow the language of the conversation, not these files.
