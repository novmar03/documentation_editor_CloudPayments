# CloudPayments Documentation Editor

Отдельный no-code редактор страниц документации CloudPayments. Проект собирается как статическое Vite-приложение и публикуется через GitHub Pages.

## Возможности

- редактирование текста, заголовков H2–H6, жирного, курсива, подчёркивания и ссылок;
- выравнивание текста и заголовков по левому краю, центру или правому краю;
- вставка кода с выбором языка, подсветкой и кнопкой копирования;
- блоки «Информация» и «Внимание»;
- таблицы с добавлением, удалением, объединением и разделением строк/столбцов, изменением ширины столбцов;
- загрузка PNG, JPG, WebP и GIF до 5 МБ или вставка изображения по ссылке;
- кнопки со ссылкой, настраиваемыми текстом, шириной, высотой, размером текста и выравниванием;
- раскрывающаяся левая навигация с изменением уровня и порядка заголовков;
- локальная резервная копия, история GitHub-черновиков, экспорт HTML и публикация в репозиторий документации.

## Запуск локально

```bash
pnpm install
pnpm dev
```

Откройте адрес, который выведет Vite (обычно `http://localhost:5173`). Для production-проверки:

```bash
pnpm build
pnpm preview
```

## GitHub

Редактор подключается кнопкой «Подключить GitHub». Нужен fine-grained personal access token с правами **Contents: Read and write** для двух репозиториев: редактора и документации. Токен хранится только в памяти текущей вкладки и не записывается в файлы.

Черновики сохраняются в ветку `documentation-drafts` этого репозитория. Кнопка «Опубликовать» отправляет согласованную страницу в `novmar03/CloudPayments_documentation`; перед публикацией редактор проверяет, что исходная страница не менялась вне редактора.

При публикации встроенные PNG, JPG, WebP и GIF копируются в `static/img/editor` репозитория документации. Имя файла определяется SHA-256 содержимого: одинаковые изображения используют один файл. В HTML и опубликованном документе сохраняются ссылки на файлы. Исходники и заметки изображений в черновиках сохраняются; удаление изображения со страницы не удаляет загруженный файл автоматически. GitHub получает изображения и страницу одним коммитом.

Проверки публикации и операций с документом: `pnpm test` (Node.js 24), проверка типов: `pnpm typecheck`.

## Английская версия страницы

В правой панели «Настройки страницы» нажмите «Английская версия». Откроется тот же редактор с отдельным английским черновиком. При первом открытии русская страница копируется как заготовка; автоматического перевода нет. Измените заголовок и содержимое вручную, затем опубликуйте готовую английскую версию.

Кнопка «Русская версия» возвращает к исходной странице. У версий отдельные история, локальное восстановление и публикация. Русские черновики сохраняются по прежним адресам `editor-data/pages/…`, английские — в `editor-data/en/pages/…`. Переключение сохраняет текущий черновик; если сохранение в GitHub не удалось, редактор оставляет текущую страницу открытой.
# Ссылки на документацию

В модалке «Ссылка» можно выбрать внешний URL или страницу документации и её заголовок H2–H6. Пустой раздел означает ссылку на всю страницу. Разделы текущей страницы берутся из открытого документа; остальных страниц — из опубликованной версии выбранного языка. ID заголовков сохраняются при переименовании.

Иконка ссылки в оглавлении копирует публичный адрес раздела, не изменяя текст. Новые разделы станут доступны по ссылке после публикации страницы.

Общий адрес задаётся в `lib/config.ts` и может быть переопределён переменной сборки `VITE_DOCS_URL`. Для текущего HTML-сайта используется `VITE_DOCS_ROUTING=hash`; при переходе на обычные маршруты задайте `VITE_DOCS_ROUTING=path`. Внутри документа ссылки всегда хранятся как `/tech/api/#id` или `/en/tech/api/#id`. Публикация подключает их преобразование для HTML-сайта и учитывает базовый путь в Docusaurus, сохраняя внешние ссылки.
# Documentation structure management

Open «Структура документации» in the editor sidebar. The two audience trees are views of the same `navigation.json`; `both` nodes are shared, not duplicated. A page's ID and route remain unchanged when moving, nesting, renaming, or changing its audience. Ordering uses the existing array order and nesting uses `parentId`.

Legacy groups remain categories. Nested categories use `type: category`. Top-level pages use a `root: true` group wrapper so the existing group/items schema can represent them without a second navigation store. The wrapper is not rendered as an extra section. The transient flat tree in `lib/structure.ts` is only an editing view; only navigation groups are persisted.

Structure changes are saved locally and published with «Опубликовать структуру». Publication reads a pinned repository revision, checks the navigation baseline, and creates one non-forced commit. It updates the standalone reader, HTML exporter, Docusaurus sidebars, overview components, and locale adapter together. Stale baselines and occupied page routes stop publication. «Загрузить с сайта» refreshes the baseline, with confirmation before discarding local structure edits.

New pages get empty Russian content and an English translation placeholder. Publish the structure before publishing the new page's content in the existing editor. Existing content drafts and translations are independent of structural edits. Renaming updates navigation and the published Russian title; an existing content draft keeps its independently edited title. Changing an audience applies to the selected subtree. A child targeted to an audience different from its parent is promoted in that audience's view.

«Убрать из навигации» sets `hidden`; it never deletes page content or files. Hidden subtrees can be restored. Empty navigation-only categories stay editable but are omitted from the public site until they contain a visible page, as required by Docusaurus. No test pages are published during development.
