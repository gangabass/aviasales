# На взлёт · Aviasales Watch

PWA для мониторинга авиабилетов. Frontend публикуется GitHub Actions на **https://gangabass.github.io/aviasales/**. Backend собирается и публикуется **Cloudflare Workers Builds из GitHub**, данные хранятся в D1, проверки запускаются Cron каждую минуту.

## Рабочий процесс на этом компьютере

Процессор этого ПК не поддерживает runtime Cloudflare. Не запускаем здесь сборку Worker, `wrangler dev`, локальные миграции и деплой. Изменения → коммит → push в `main` → автоматическая сборка и деплой на стороне Cloudflare. Frontend также собирается в облаке, через GitHub Actions.

На ПК можно редактировать исходники, запускать `npm test`, генерировать ключи и токены Node.js-скриптами. Тесты исполняют миграцию в SQLite с адаптером D1 и проверяют API; они не заменяют проверку развёрнутого Worker и push на телефоне.

## Функции

- Вход по персональному токену; в базе только SHA-256. Отслеживания и push-подписки разделены по владельцу. Один токен можно использовать на нескольких устройствах.
- До 10 направлений на токен: IATA-коды городов, диапазон вылета до 93 дней в пределах года, порог в рублях. Один взрослый, эконом, в одну сторону, пересадки допускаются.
- Минимальная цена, дата вылета, цены по дням, ссылка на Aviasales, пауза и удаление.
- Cron `* * * * *` работает при закрытой PWA. Push при первом попадании строго ниже порога и дальнейшем снижении относительно последнего отправленного на конкретное устройство. Если подходящих цен больше нет, состояние сбрасывается; следующее попадание снова вызывает push. Смена только даты при прежней цене не вызывает повтор.
- Ошибки источника сохраняют последнюю известную цену с предупреждением. Неуспешный push повторяется на следующей проверке; подписки с ответом 404/410 удаляются. При сетевой неопределённости возможна повторная доставка; tag объединяет уведомления одного направления.
- Одинаковые запросы объединяются в пределах запуска Cron. Lease в D1 исключает перекрывающиеся запуски. Истёкшие направления завершаются автоматически.
- Установка PWA, offline-оболочка и тест push. Service worker не кеширует API, токены и цены. Токен сохраняется в localStorage. Выход отключает push устройства и удаляет локальный токен, сохраняя доступ других устройств.

## Состояние подключения

13 ноября 2026: в аккаунте Cloudflare создана отдельная D1 aviasales-watch, ID e4a3f7af-aaa3-4494-9df1-69546971636b. Миграция 0001_init.sql применена удалённо. В wrangler.json записаны account_id, database_id, production origin и VAPID email. Worker и Git Builds ещё не подключены: существующий Wrangler OAuth получает 403 от Builds API; требуется пользовательский API-токен с Workers Builds Configuration Edit. Локальная сборка Worker не запускалась.

## Первоначальная настройка Cloudflare

1. В Cloudflare Dashboard → Workers & Pages → D1 создайте базу `aviasales-watch`. Скопируйте её ID в `wrangler.json`, поле `d1_databases[0].database_id` вместо заглушки.
2. В `wrangler.json` задайте `VAPID_SUBJECT` в формате `mailto:ваш_email`. `APP_URL` уже указывает на `https://gangabass.github.io/aviasales/`. Для production оставьте в `ALLOWED_ORIGINS` только `https://gangabass.github.io` (без пути и завершающего `/`).
3. Подключите GitHub-репозиторий **gangabass/aviasales** к Worker с именем **aviasales-watch** через Workers Builds. Настройки:

| Поле | Значение |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run worker:check` |
| Deploy command | `npm run worker:deploy` |
| Build variable | `NODE_VERSION=24` |
| Preview builds | Выключить на первом этапе |

Cloudflare устанавливает зависимости из lockfile. Build запускает тесты; deploy проверяет D1 ID/email, применяет миграции к удалённой D1 и затем собирает/публикует Worker. При ошибке миграции публикация не выполняется. Повторный запуск применяет только новые миграции. Build API token должен иметь права Workers Scripts Edit и **D1 Edit**; автоматически созданному токену может потребоваться добавить D1 Edit.

Команда `worker:deploy` предназначена для Cloudflare Builds. Запускать её на этом ПК не нужно. Настройки Build/Deploy задаются в Dashboard: файл Wrangler не подключает Git-интеграцию автоматически.

4. Отправьте изменения в GitHub. Cloudflare запустит сборку после подключения репозитория. Проверяйте результат в Worker → Builds; наличие коммита само по себе не означает успешный деплой.
5. Локально сгенерируйте VAPID-ключи (это обычный Node.js, без workerd):

```powershell
npm ci
npm run keys
```

В игнорируемом `.dev.vars` появятся `VAPID_PUBLIC_KEY` и `VAPID_PRIVATE_KEY`. Добавьте значения через Worker → Settings → Variables and Secrets как **runtime Secrets**. Build variables не доступны Worker во время выполнения. Сохраните резервную копию пары: её смена потребует переподключения push. Генератор сохраняет существующие ключи.

6. Создайте токен:

```powershell
npm run token -- "Роман"
```

Пути появятся в терминале: `private/token-UUID.txt` содержит секрет для входа, `private/user-UUID.sql` — SQL с хешем. Скопируйте SQL в Cloudflare D1 → база → Console и выполните после успешного применения миграций. Секретный токен в D1 Console не нужен. Для независимых пользователей создавайте разные токены.

Отзыв доступа:

```powershell
npm run token -- --revoke UUID_ПОЛЬЗОВАТЕЛЯ
```

Выполните SQL из `private/revoke-UUID_ПОЛЬЗОВАТЕЛЯ.sql` в D1 Console. Это отключит API и будущие рассылки, удалит подписки, сохранив правила.

Не коммитьте `.dev.vars`, `.env`, `private/`, `.wrangler/`: они исключены из Git. В runtime Secrets не нужно добавлять Cloudflare API token.

## GitHub Pages

1. Repository Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → Variables:
   `VITE_API_BASE_URL=https://aviasales-watch.ВАШ_SUBDOMAIN.workers.dev`
3. Push в `main` запускает **Deploy PWA to GitHub Pages**. Workflow также можно запустить вручную после заполнения переменной.

Workflow выполняет тесты, проверяет HTTPS API URL, собирает frontend на GitHub и публикует только `dist`. Backend и приватные файлы в Pages не попадают. Путь берётся из имени репозитория. Для репозитория `username.github.io` вместо текущего задайте `VITE_BASE_PATH: /` в workflow.

## Обычное обновление

После изменения исходников:

```powershell
npm test
git add <изменённые_файлы>
git commit -m "Описание изменения"
git push origin main
```

Worker обновится через Cloudflare Builds, PWA — через GitHub Actions. Новые миграции добавляйте отдельными файлами в `migrations/`: уже применённые не редактируйте. Изменения БД должны сохранять совместимость с предыдущей версией Worker: миграция выполняется до публикации кода. Откат Worker не откатывает D1.

## Проверка размещения

- Откройте `https://aviasales-watch.ВАШ_SUBDOMAIN.workers.dev/api/health` и убедитесь в успешном статусе обоих облачных деплоев.
- Войдите в PWA, создайте IKT → BKK с будущими датами, дождитесь времени проверки в карточке. Указанный ribbon API возвращал HTTP 200 с домашнего IP при разработке; доступ из Cloudflare требует отдельной проверки.
- Включите push, нажмите «Тест push». Задайте порог выше текущей цены и проверьте уведомление при закрытой PWA; прежняя цена не должна повторяться каждую минуту.
- На iPhone/iPad нужна установленная PWA на экране «Домой» (iOS/iPadOS 16.4+), открытая с её иконки: Safari → Поделиться → На экран «Домой». На Android установите приложение из Chrome.
- Проверьте паузу, продолжение, выход с отключением push и отсутствие чужих правил при входе другим токеном.

## Ограничения

`https://tickets-api.aviasales.ru/search/prices/ribbon` — неофициальный endpoint без гарантий доступности и совместимости. Ошибки 403/429 видны в карточке; приложение не обходит блокировки/CAPTCHA. Цены ribbon ориентировочные: наличие, итоговую стоимость и год вылета проверяйте на Aviasales. Формат ссылки поиска содержит день и месяц.

За запуск обрабатывается до 100 готовых правил, по четыре параллельно; очередь сортируется по времени следующей проверки. При большей нагрузке период увеличится. Для небольшого личного сервиса с шифрованием push рекомендуется Workers Paid: у Free низкие CPU/subrequest лимиты. Расписание минутное, но точный момент проверки и доставки зависит от Cloudflare, источника и push-сервиса.

## Проверки

`npm test` покрывает валидацию, формат API, токены, CORS, разделение владельцев, лимит правил, запрет SSRF через push endpoint, шифрование push, устранение повторов, снижение цены, возврат под порог, ошибки источника/доставки, истечение подписок, объединение запросов и Cron lease. Реальные push и runtime проверяются после облачного деплоя. Браузерная визуальная проверка в текущей сессии была недоступна.

[Cloudflare Workers Builds: настройки](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [лимиты Workers](https://developers.cloudflare.com/workers/platform/limits/).

