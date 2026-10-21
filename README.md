# 🦖 Данчезавр: Geo Codecraft — v0.7 «Город + панорамы»

Браузерная 3D-игра с русским интерфейсом для iPad и компьютера. Ребёнок управляет пиксельным Данчезавром **настоящим Python**, а теперь игровой мир ощущается как городской квартал Москвы в стиле Minecraft.

## Реализовано

- Воксельный 3D-мир, WebGL без 3D-библиотек, кубический персонаж, вращение камеры пальцем.
- Реальная подложка OpenStreetMap на мини-карте, поиск городов/мест, координаты виртуального персонажа.
- Построение домов, дорог, воды и зелёных зон из данных OSM/Overpass. Если Overpass недоступен — **честно обозначенный демонстрационный кубический мир**; мини-карта может работать независимо.
- Движение **только кодом** по клеткам с реальными географическими координатами. Шаг = клетка сетки Web Mercator 32 м (в Москве на земле ≈18 м). Виртуальное перемещение **не требует GPS**.
- Полноценный интерпретатор CPython в браузере через Pyodide/WASM, запускаемый в отдельном Web Worker. Не имитация кода JavaScript-командами.
- 4 миссии: движение, кристалл, мост, цикл `for`; после миссий — свободная песочница.
- Защита от зависаний: ограничение до 80 игровых действий и аварийное завершение worker при долгой программе.
- Локальное сохранение монет, прогресса и координат, возможность добавления на домашний экран iPad через Safari.

## Программирование героя

```python
move_forward()       # один шаг вперёд
move_forward(3)      # три шага
turn_left()          # поворот налево на 90°
turn_right()         # поворот направо на 90°
collect()            # подобрать игровой кристалл под ногами
place_block()        # построить мост, если перед героем вода
front_is_clear()     # перед героем свободно?
is_water_ahead()     # перед героем вода?
crystal_here()       # под ногами кристалл?
```

Можно использовать `for`, `if`, функции, переменные, `print` и другие возможности настоящего Python:

```python
for _ in range(4):
    if front_is_clear():
        move_forward()
    else:
        turn_right()
```

## Запуск локально

Просто открывать `index.html` двойным кликом нельзя: браузер блокирует модули и Web Worker с `file://`.

```bash
cd danchezavr-codecraft
python -m http.server 8000
```

Открыть `http://localhost:8000` на компьютере. На iPad — опубликовать **всю папку целиком** через HTTPS на Render Static Site, GitHub Pages или другом статическом хостинге. В Render укажите Publish Directory = `.`; сборка и Node.js не нужны. Для адресного поиска и скачивания Python **нужен интернет**. Затем: Safari → Поделиться → На экран «Домой».

## Устройство

| Файл | Назначение |
| --- | --- |
| `index.html` | интерфейс, экран игры, редактор Python |
| `styles.css` | iPad/desktop/mobile дизайн |
| `src/main.js` | миссии, управление, редактор, карты, состояние |
| `src/engine.js` | собственный WebGL-воксельный рендер |
| `src/geo.js` | привязка к координатам и конвертация OSM в блоки |
| `src/python-worker.js` | безопасное выполнение в отдельном worker с таймаутом |
| `src/python_bootstrap.py` | реальная Python-модель мира и игровые команды |
| `src/levels.js` | миссии и тексты |
| `sw.js` | кеширование собственных файлов приложения |

## Архитектурные границы MVP

- Данные OSM подгружаются для текущей окрестности; по мере перемещения запросы обновляются. **Это не полная трёхмерная копия Земли**: высотный рельеф, детальные фасады, региональное кеширование и потоки чанков — следующие этапы.
- Проект **не содержит Arnis** и не импортирует сохранения Minecraft. [Arnis](https://github.com/louis-e/arnis) — отдельный генератор миров Minecraft из OSM/высот. Следующий этап: сервис/импорт из Arnis с проверкой формата и лицензии (в данном прототипе для iPad используется свой лёгкий OSM→voxel-рендер).
- Препятствия для обучения расположены поверх реальной карты и не являются достоверными препятствиями настоящего города.
- SBG-функциональность, онлайн-игроки, GPS-перемещение и мультиплеер **не реализованы**. Это самостоятельная образовательная игра, не клиент SBG.
- Нет серверного аккаунта, онлайн-хранилища прогресса или отправки пользовательского кода на наш сервер. Код исполняется локально в браузере; Python/WASM, картографические данные и поиск загружаются из внешних сервисов.
- Работа WebGL и Pyodide в Safari на конкретном iPad не подтверждена аппаратным тестированием.

## Тесты

```bash
python -m unittest discover -s tests -v
node --check src/main.js
node --check src/geo.js
node --check src/engine.js
```

## Источники и авторство

Игра/3D-визуал сделаны заново. Географические данные и карта: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL](https://opendatacommons.org/licenses/odbl/). Геоданные через Overpass API; геокодирование через Nominatim. Python via [Pyodide](https://pyodide.org/) (CPython/WASM). Подход к географическому преобразованию вдохновлён [louis-e/arnis](https://github.com/louis-e/arnis), код проекта не копировался.


## Moscow family journey, v0.4 (21 Oct 2026)

- Start: Народного Ополчения, 12к4 (verified map point: 55.772087, 37.479654).
- Goal: Демьяна Бедного, 1к5 — resolved **at runtime only if that exact building is geocoded**. No fabricated coordinates. Nominatim then Overpass address-tag fallback.
- Distance + cardinal compass hint; protagonist movement remains entirely user-authored Python (`move_forward()`, `turn_right()`, `for`, `if`).
- Five incremental Russian lessons; examples are *not automatically inserted into the editor*.
- Position, completed quests and code drafts saved to localStorage. Restart separately resets the journey.
- Voxels represent OpenStreetMap shapes when Overpass succeeds; when unavailable the world explicitly switches to *stylized* demo terrain. This is a game map, not a pedestrian navigation system.
- The public OSM server is best effort. For substantial usage, cache geographic extracts or adopt a map data provider; public services have availability and rate policies.
- Keep sensitive family relationships and actual home locations out of promotional screenshots and screenshots shared publicly.


## v0.7: настоящие улицы

Кнопка **«🏙 Реальные улицы»** в карточке путешествия открывает модальное окно со ссылками на Яндекс Карты для текущей игровой клетки, стартового адреса и подтверждённой точки финиша. Панорамы запускаются **по нажатию**, через внешнюю страницу Яндекс Карт, без копирования чужих панорамных изображений и без передачи GPS устройства. Не на каждом месте панорама доступна; для этого предусмотрена ссылка «Показать на карте». Точное положение бабушки не подменяется соседним домом.

Для локального теста: `python -m http.server 8000`, затем откройте `http://localhost:8000/`. Для Render: Static Site, `publishPath: .`, ветка `danchezavr-codecraft`, сборка не требуется.

Если Overpass временно недоступен, появится **отмеченный в интерфейсе демонстрационный город** (процедурная сетка), а не пустая поляна. Демосетка не выдаётся за точную географию.


## v0.7 — городские задания

Дополнительная сюжетная линия из трёх городских квестов: найти уличный ориентир, дойти до маркера возле здания, найти игровую посылку и выполнить `collect()` на её клетке. Светящиеся точки и посылка — **вымышленные игровые объекты**; география улиц и контуры зданий берутся из OSM там, где источник доступен. Если реальная география не загрузилась, включается явно помеченный демонстрационный квартал. Игрок сам набирает Python, а выполнение и проверка задач идут по журналу игровых действий, не по тексту программы. Позиции квестов проверяются на доступность обходом клеток. Награды и прогресс сохраняются локально в браузере.
