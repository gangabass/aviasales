# На взлёт · мониторинг авиабилетов

PWA и API размещаются на собственном сервере в отдельном Docker Compose проекте `aviasales`, как portal38. Cloudflare для работы приложения не нужен. База D1, созданная ранее, не используется и оставлена без удаления.

- PWA: https://gangabass.duckdns.org/aviasales/
- API: https://gangabass.duckdns.org/aviasales-api
- Health: https://gangabass.duckdns.org/aviasales-api/api/health
- Сервер: `/home/kinjo/aviasales`, Docker-сервис `aviasales-api`, порт 3003 внутри сети `dnevnik-proxy`, отдельный volume `aviasales-data`.

13 ноября 2026: приложение установлено на сервере, HTTPS и вход проверены. Серверный планировщик получил реальные цены IKT → BKK (январь 2027), проверка прошла без ошибки. Healthcheck portal38 и Dnevnik после добавления маршрутов — HTTP 200. Проверка доставки push на настоящем телефоне остаётся отдельным шагом.

## Возможности

Вход по персональному токену; в SQLite хранится SHA-256. До 10 отслеживаний на пользователя: IATA-коды, диапазон будущих дат до 93 дней, цена в рублях. В одну сторону, один взрослый, эконом, пересадки допускаются. Доступны минимум и цены по датам, пауза, удаление и ссылка на Aviasales.

Проверки выполняются сервером сразу после запуска и каждые 60 секунд, независимо от открытой PWA. Новое уведомление — при первом попадании строго ниже порога и при дальнейшем снижении цены. После исчезновения подходящих предложений состояние сбрасывается. Подписки и данные изолированы по владельцам. Ошибки источника сохраняют последнюю известную цену с предупреждением, неудачные push повторяются. Истёкшие подписки удаляются. При неопределённом сетевом результате возможна повторная доставка.

PWA устанавливается на устройство, содержит offline-оболочку и тест push. На iPhone/iPad сначала добавьте PWA через Safari → Поделиться → На экран «Домой» и откройте с иконки. На Android установите из Chrome. Для Web Push нужен HTTPS и разрешение уведомлений.

## Установка и обновление

Собирайте Docker-образ **на сервере**. Cloudflare runtime и локальные Worker-сборки больше не используются.

```sh
cd /home/kinjo/aviasales
docker compose -p aviasales -f server/compose.yaml up -d --build
docker compose -p aviasales -f server/compose.yaml ps
```

Docker собирает frontend с `/aviasales-api` и `/aviasales/`, затем запускает Node.js 24 без root. Порт на хост не публикуется. Reverse proxy добавляет отдельные маршруты `/aviasales/` и `/aviasales-api/`, существующие маршруты сохраняются. Миграции SQLite выполняются автоматически при старте, в транзакциях; применённые миграции не редактируйте, добавляйте новые файлы.

Секреты находятся в `server/.env` с правами 600, вне Git и Docker-образа:

```text
ALLOWED_ORIGINS=https://gangabass.duckdns.org,https://gangabass.github.io
APP_URL=https://gangabass.duckdns.org/aviasales/
VAPID_SUBJECT=mailto:ваш_email
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

`npm run keys` создаёт/дополняет `server/.env`, сохраняя существующие ключи. Храните их резервную копию. Генератор использует ранее созданные `.dev.vars`, если пара ключей там уже есть.

## Пользователи

На машине с Node.js 24:

```powershell
npm ci
npm run token -- "Имя пользователя"
```

`private/token-UUID.txt` содержит секрет для входа, `private/user-UUID.sql` — только хеш для импорта. Передайте SQL на сервер и импортируйте:

```sh
cat user-UUID.sql | docker compose -p aviasales -f server/compose.yaml exec -T aviasales-api node server/import-user.mjs /dev/stdin
```

Сам токен пользователю передавайте отдельно. Для отзыва `npm run token -- --revoke UUID`, затем импортируйте соответствующий SQL тем же способом. Выход из PWA отключает push только текущего устройства и удаляет локальный токен; глобальный отзыв токена отключает API и все будущие уведомления пользователя.

## Резервное копирование

Остановите только сервис aviasales и скопируйте `/data` из контейнера, затем запустите его:

```sh
docker compose -p aviasales -f server/compose.yaml stop
docker compose -p aviasales -f server/compose.yaml cp aviasales-api:/data ./private-backup
docker compose -p aviasales -f server/compose.yaml start
```

Храните backup приватно вместе с `server/.env`. Не используйте `down -v`: это удалит volume данных. GitHub хранит исходники; рабочая PWA не зависит от GitHub Pages. Workflow Pages оставлен как необязательное зеркало с переменной `VITE_API_BASE_URL=https://gangabass.duckdns.org/aviasales-api`.

## Проверки и ограничения

`npm test` проверяет правила, токены, CORS, изоляцию пользователей, подписки, шифрование push, повторные уведомления, ошибки и планировщик. HTTP и реальный источник дополнительно проверяются после размещения. Push на настоящем телефоне требует проверки владельцем устройства.

Источник `tickets-api.aviasales.ru/search/prices/ribbon` неофициальный: доступность и формат могут меняться. Цены ориентировочные, итоговую стоимость, наличие и год вылета проверяйте на Aviasales. За цикл обрабатывается до 100 правил по четыре параллельно; при высокой нагрузке или медленном источнике период может увеличиться. Параллельные циклы блокируются. Точный момент push зависит от сети и браузера.

Справочник `src/airports.json` содержит 3616 аэропортов с рейсами из открытых данных Travelpayouts (`https://api.travelpayouts.com/data/ru/airports.json` и `https://api.travelpayouts.com/data/ru/cities.json`, загружены 15 ноября 2026). Поиск выполняется локально по русскому и английскому названию города, названию аэропорта и IATA-коду. Выберите подсказку мышью, касанием или стрелками и Enter; Escape закрывает список.
